import { NextResponse } from 'next/server';
import { globalQueue } from '@/services/QueueManager';

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
    
    // Add job to memory queue instead of awaiting it synchronously
    const jobId = globalQueue.addJob(url);
    const status = globalQueue.getJobStatus(jobId);

    return NextResponse.json({ jobId, ...status });
  } catch (error) {
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
