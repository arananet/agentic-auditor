import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class TechnicalAudit implements IAuditStrategy {
  name = 'technical';

  async execute({ $, baseUrl }: AuditContext): Promise<AuditResult> {
    const isCSR = $('body').html()?.length || 0 < 500 && $('script').length > 5;
    
    let robotsTxtFound = false;
    let robotsScore = 0;
    
    try {
      const robotsRes = await fetch(`${baseUrl}/robots.txt`);
      if (robotsRes.ok) {
        robotsTxtFound = true;
        const txt = await robotsRes.text();
        if (/User-agent:\s*(GPTBot|ClaudeBot|PerplexityBot)\s*Allow:/i.test(txt)) robotsScore += 25;
        if (/User-agent:\s*(Google-Extended)\s*Allow:/i.test(txt)) robotsScore += 25;
      }
    } catch (e) {
      console.warn('Failed to fetch robots.txt', e);
    }
    
    let csrScore = isCSR ? 0 : 50;
    let totalScore = Math.min(100, csrScore + robotsScore);

    return {
      score: totalScore,
      status: totalScore >= 75 ? 'READY' : totalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        { message: isCSR ? 'Client-Side Rendering Detected.' : 'Server-Side Rendering Detected.', explanation: 'CSR blocks AI scrapers that do not execute JavaScript.', remediation: 'Implement SSR or Static Generation.' },
        { message: robotsScore > 0 ? 'AI explicit allows found.' : 'Missing explicit AI allows in robots.txt.', explanation: 'AI agents require explicit permission to crawl and summarize your content.', remediation: 'Update robots.txt to allow GPTBot, ClaudeBot, and PerplexityBot.' }
      ]
    };
  }
}
