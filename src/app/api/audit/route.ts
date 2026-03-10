import { NextResponse } from 'next/server';
import { AuditorService } from '@/services/auditor.service';

const auditor = new AuditorService();

export async function POST(req: Request) {
  const { url, token } = await req.json();
  
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

  // Verify Cloudflare Turnstile Token
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_DEV_MODE) {
    const formData = new FormData();
    formData.append('secret', process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'); // Testing secret
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome = await result.json();
    if (!outcome.success) {
      return NextResponse.json({ error: 'Security verification failed.' }, { status: 403 });
    }
  }
  
  const results = await auditor.runAudit(url);
  return NextResponse.json(results);
}
