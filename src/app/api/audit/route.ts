import { NextResponse } from 'next/server';
import { AuditorService } from '@/services/auditor.service';

const auditor = new AuditorService();

export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });
  
  const results = await auditor.runAudit(url);
  return NextResponse.json(results);
}
