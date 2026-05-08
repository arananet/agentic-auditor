import { NextResponse } from 'next/server';
import { globalQueue } from '@/services/QueueManager';
import dns from 'dns/promises';
import net from 'net';

// --- Rate limiter: 10 requests per minute per IP ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Purge expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000).unref();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Returns true if the resolved IP is private, loopback, link-local, or cloud-metadata
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab][0-9a-f]/i.test(lower) ||
      lower.startsWith('::ffff:')
    );
  }
  return false;
}

// --- SSRF protection: only allow public http/https URLs ---
function isValidAuditUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();

    // Reject well-known private hostnames and TLDs
    if (h === 'localhost') return false;
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
    if (h === 'metadata.google.internal') return false;

    // Strip brackets from IPv6 literals (e.g. "[::1]" → "::1")
    const bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;

    // Reject IP literals that map to private/reserved ranges (IPv4 and IPv6)
    if (net.isIP(bare) && isPrivateIp(bare)) return false;

    // Belt-and-suspenders: pattern-match common private IPv4 prefixes
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|127\.|0\.)/.test(bare)) return false;

    return true;
  } catch {
    return false;
  }
}

// DNS pre-resolution — rejects URLs whose hostname resolves to a private IP.
// This is a first-line defense against DNS rebinding; Playwright adds a second layer.
async function dnsValidateUrl(urlString: string): Promise<boolean> {
  try {
    const { hostname } = new URL(urlString);
    const bare = hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
    // IP literals were already checked statically; skip DNS for them
    if (net.isIP(bare)) return true;
    const results = await dns.lookup(bare, { all: true });
    return results.length > 0 && results.every(r => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}

if (!process.env.TURNSTILE_SECRET_KEY) {
  console.error('[CONFIG] TURNSTILE_SECRET_KEY is not set — Turnstile verification will reject all requests');
}

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }
    if (!token) return NextResponse.json({ error: 'Security token required' }, { status: 403 });

    if (!isValidAuditUrl(url)) {
      return NextResponse.json({ error: 'Invalid URL. Only public http/https URLs are allowed.' }, { status: 400 });
    }

    // DNS validation — catches URLs that resolve to private/cloud-metadata IPs
    if (!await dnsValidateUrl(url)) {
      return NextResponse.json({ error: 'Invalid URL. Only public http/https URLs are allowed.' }, { status: 400 });
    }

    // Prefer x-real-ip (set by Railway's trusted proxy) over the user-controllable
    // x-forwarded-for header to prevent rate-limit bypass via header spoofing
    const ip =
      req.headers.get('x-real-ip')?.trim() ||
      req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }

    // Verify Cloudflare Turnstile Token
    const formData = new FormData();
    formData.append('secret', process.env.TURNSTILE_SECRET_KEY || '');
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome = await result.json();

    if (!outcome.success) {
      return NextResponse.json({
        error: 'Security verification failed.',
        details: outcome['error-codes']
      }, { status: 403 });
    }

    let jobId: string;
    try {
      jobId = globalQueue.addJob(url);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const status = globalQueue.getJobStatus(jobId);

    return NextResponse.json({ jobId, ...status });
  } catch (error) {
    console.error('POST /api/audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    const status = globalQueue.getJobStatus(jobId);
    if (!status) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });

    return NextResponse.json(status);
  } catch (error) {
    console.error('GET /api/audit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
