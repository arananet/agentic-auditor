import { NextResponse } from 'next/server';
import { AuditorService } from '@/services/auditor.service';

const auditor = new AuditorService();

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json();
    
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });
    if (!token) return NextResponse.json({ error: 'Security token required' }, { status: 403 });

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
    
    const results = await auditor.runAudit(url);
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
