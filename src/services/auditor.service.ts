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
      log: [`[OK] INITIALIZING DEEP SPECTRUM SCAN FOR ${baseUrl}`]
    };

    try {
      const pageRes = await fetch(baseUrl);
      const html = await pageRes.text();
      const $ = cheerio.load(html);

      // 1. AI CITABILITY (Logic from geo-citability)
      const paragraphs = $('p').map((_, el) => $(el).text()).get();
      const h1 = $('h1').text();
      const h2s = $('h2').length;
      
      // Check for "Answer Blocks" (Concise, factual sentences)
      const hasAnswerBlocks = paragraphs.some(p => p.length > 50 && p.length < 200 && /is|are|was|were/.test(p));
      results.citability = {
        score: (h1 ? 30 : 0) + (h2s > 0 ? 30 : 0) + (hasAnswerBlocks ? 40 : 0),
        status: h1 && hasAnswerBlocks ? 'READY' : 'WARN',
        details: [
          h1 ? 'Primary entity (H1) detected.' : 'Missing H1.',
          hasAnswerBlocks ? 'High fact-density blocks found.' : 'Content too verbose for AI extraction.'
        ]
      };

      // 2. TECHNICAL & A2A (Logic from geo-crawlers + geo-llmstxt)
      const robotsText = await fetch(`${baseUrl}/robots.txt`).then(r => r.text()).catch(() => '');
      const hasAIAllow = /GPTBot|PerplexityBot|ClaudeBot/.test(robotsText);
      const hasLLMSTxt = await fetch(`${baseUrl}/llms.txt`).then(r => r.ok).catch(() => false);

      results.technical = {
        score: (robotsText ? 50 : 0) + (hasAIAllow ? 50 : 0),
        status: hasAIAllow ? 'READY' : 'WARN',
        details: [hasAIAllow ? 'AI Crawlers explicitly invited.' : 'Generic robots.txt detected.']
      };

      results.a2a = {
        score: hasLLMSTxt ? 100 : 0,
        status: hasLLMSTxt ? 'READY' : 'WARN',
        details: [hasLLMSTxt ? 'llms.txt protocol active.' : 'No machine-readable context file found.']
      };

      // 3. SCHEMA & BRAND (Logic from geo-schema + geo-brand-mentions)
      const schemas = $('script[type="application/ld+json"]');
      let hasPersonOrOrg = false;
      schemas.each((_, el) => {
        const content = $(el).html() || '';
        if (content.includes('Person') || content.includes('Organization')) hasPersonOrOrg = true;
      });

      results.schema = {
        score: (schemas.length > 0 ? 50 : 0) + (hasPersonOrOrg ? 50 : 0),
        status: hasPersonOrOrg ? 'READY' : 'WARN',
        details: [hasPersonOrOrg ? 'Identity schema detected.' : 'Schema present but lacks entity definition.']
      };

      results.log.push('[OK] SPECTRUM ANALYSIS COMPLETE.');
      return results;
    } catch (e) {
      results.log.push('[ERROR] HANDSHAKE FAILED. SITE UNREACHABLE.');
      return results;
    }
  }
}
