import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const targetUrl = new URL(url);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.hostname}`;

    const results = {
      citability: { score: 0, status: 'FAILED', details: [] as string[] },
      technical: { score: 0, status: 'FAILED', details: [] as string[] },
      schema: { score: 0, status: 'FAILED', details: [] as string[] },
      a2a: { score: 0, status: 'FAILED', details: [] as string[] },
      log: [] as string[]
    };

    results.log.push(`[OK] CONNECTING TO ${baseUrl}...`);

    // 1. Technical Check: robots.txt & llms.txt
    try {
      const robotsRes = await fetch(`${baseUrl}/robots.txt`);
      if (robotsRes.ok) {
        results.technical.score += 50;
        const robotsText = await robotsRes.text();
        if (robotsText.includes('GPTBot') || robotsText.includes('PerplexityBot')) {
           results.technical.score += 50;
           results.technical.details.push('AI Crawlers explicitly allowed.');
        } else {
           results.technical.details.push('robots.txt found, no explicit AI bot rules.');
        }
      } else {
         results.technical.details.push('No robots.txt found.');
      }

      const llmsRes = await fetch(`${baseUrl}/llms.txt`);
      if (llmsRes.ok) {
        results.a2a.score += 100;
        results.a2a.status = 'READY';
        results.a2a.details.push('llms.txt standard detected.');
        results.log.push('[OK] LLMS.TXT CONTEXT FILE FOUND.');
      } else {
        results.a2a.details.push('Missing llms.txt context file.');
        results.log.push('[WARN] NO LLMS.TXT DETECTED.');
      }
      
      results.technical.status = results.technical.score > 50 ? 'READY' : 'WARN';

    } catch (e) {
      results.log.push(`[ERROR] Technical check failed.`);
    }

    // 2. Content & Schema Check: Fetch Homepage
    try {
      results.log.push(`[OK] FETCHING DOM FOR ${baseUrl}...`);
      const pageRes = await fetch(baseUrl);
      const html = await pageRes.text();
      const $ = cheerio.load(html);

      // Schema Check
      const schemas = $('script[type="application/ld+json"]');
      if (schemas.length > 0) {
        results.schema.score = 100;
        results.schema.status = 'READY';
        results.schema.details.push(`Found ${schemas.length} JSON-LD blocks.`);
        results.log.push('[OK] STRUCTURED DATA DETECTED.');
      } else {
        results.schema.details.push('No JSON-LD schema found.');
        results.log.push('[WARN] NO SCHEMA DETECTED.');
      }

      // Citability Check (Basic heuristics)
      const h1 = $('h1').text();
      const paragraphs = $('p').length;
      if (h1 && paragraphs > 5) {
        results.citability.score = 85;
        results.citability.status = 'READY';
        results.citability.details.push('Good heading structure and text density.');
      } else {
        results.citability.score = 40;
        results.citability.status = 'WARN';
        results.citability.details.push('Thin content or missing H1.');
      }

    } catch (e) {
       results.log.push(`[ERROR] DOM parsing failed.`);
    }

    results.log.push(`[OK] AUDIT COMPLETE.`);

    return NextResponse.json(results);

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
