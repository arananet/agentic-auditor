import * as cheerio from 'cheerio';
import { AuditResponse, AuditResult } from '../types';

export class AuditorService {
  async runAudit(url: string): Promise<AuditResponse> {
    const targetUrl = new URL(url);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.hostname}`;
    
    const results: AuditResponse = {
      citability: { score: 0, status: 'WAITING', details: [] },
      technical: { score: 0, status: 'WAITING', details: [] },
      schema: { score: 0, status: 'WAITING', details: [] },
      a2a: { score: 0, status: 'WAITING', details: [] },
      log: [`[OK] STARTING AUDIT FOR ${baseUrl}`]
    };

    try {
      const pageRes = await fetch(baseUrl);
      const html = await pageRes.text();
      const $ = cheerio.load(html);

      // Technical & A2A
      const robots = await fetch(`${baseUrl}/robots.txt`).then(r => r.ok).catch(() => false);
      const llms = await fetch(`${baseUrl}/llms.txt`).then(r => r.ok).catch(() => false);

      results.technical = {
        score: robots ? 100 : 0,
        status: robots ? 'READY' : 'FAILED',
        details: [robots ? 'robots.txt detected' : 'Missing robots.txt']
      };

      results.a2a = {
        score: llms ? 100 : 0,
        status: llms ? 'READY' : 'WARN',
        details: [llms ? 'llms.txt standard detected' : 'Missing llms.txt (AI Manual)']
      };

      // Schema
      const schemaCount = $('script[type="application/ld+json"]').length;
      results.schema = {
        score: schemaCount > 0 ? 100 : 0,
        status: schemaCount > 0 ? 'READY' : 'FAILED',
        details: [`Found ${schemaCount} JSON-LD blocks`]
      };

      // Citability
      const hasH1 = $('h1').length > 0;
      results.citability = {
        score: hasH1 ? 90 : 30,
        status: hasH1 ? 'READY' : 'WARN',
        details: [hasH1 ? 'Proper semantic header' : 'Missing H1']
      };

      results.log.push('[OK] CORE SCAN COMPLETE.');
      return results;
    } catch (e) {
      results.log.push('[ERROR] HANDSHAKE FAILED.');
      return results;
    }
  }
}
