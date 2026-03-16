import { NextResponse } from 'next/server';
import { globalQueue } from '@/services/QueueManager';

// --- Rate limiter: 10 requests per minute per IP ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

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

// --- SSRF protection: only allow public http/https URLs ---
function isValidAuditUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
    if (h === '169.254.169.254' || h === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
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

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
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
