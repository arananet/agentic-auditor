import { NextResponse } from 'next/server';
import { globalMemory } from '@/services/MemoryService';
import { AUDIT_DIMENSIONS } from '@/types';

// --- Lightweight per-IP rate limiter: 30 feedback submissions per minute ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

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

const NOTE_MAX = 500;

/**
 * POST /api/feedback — capture an anonymous reaction to a single audit finding.
 * Feeds the Agent Memory Layer; Phase-2 Oracle calibration consumes only
 * trusted feedback, so submissions here are stored as source: 'anonymous'.
 *
 * Body: { dimension: <audit key>, signal: 'agree' | 'disagree', url?: string, note?: string }
 */
export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get('x-real-ip')?.trim() ||
      req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { dimension, signal, url, note } = body as Record<string, unknown>;

    if (typeof dimension !== 'string' || !(AUDIT_DIMENSIONS as readonly string[]).includes(dimension)) {
      return NextResponse.json({ error: 'Invalid or unknown audit dimension' }, { status: 400 });
    }
    if (signal !== 'agree' && signal !== 'disagree') {
      return NextResponse.json({ error: "signal must be 'agree' or 'disagree'" }, { status: 400 });
    }

    const cleanUrl = typeof url === 'string' && url.length <= 2048 ? url : null;
    const cleanNote = typeof note === 'string' ? note.slice(0, NOTE_MAX) : undefined;

    const fb = globalMemory.recordFeedback({
      url: cleanUrl,
      dimension,
      signal,
      source: 'anonymous',
      note: cleanNote,
    });

    return NextResponse.json({ ok: true, id: fb.id });
  } catch (error) {
    console.error('POST /api/feedback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
