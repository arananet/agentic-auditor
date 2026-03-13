import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class TechnicalAudit implements IAuditStrategy {
  name = 'technical';

  async execute({ $, baseUrl }: AuditContext): Promise<AuditResult> {
    const isCSR = $('body').html()?.length || 0 < 500 && $('script').length > 5;
    
    let robotsTxtFound = false;
    let robotsScore = 0;
    let txt = "";
    
    try {
      const robotsRes = await fetch(`${baseUrl}/robots.txt`);
      if (robotsRes.ok) {
        robotsTxtFound = true;
        txt = await robotsRes.text();
        if (/User-agent:\s*(GPTBot|ClaudeBot|PerplexityBot)\s*Allow:/i.test(txt)) robotsScore += 25;
        if (/User-agent:\s*(Google-Extended)\s*Allow:/i.test(txt)) robotsScore += 25;
      }
    } catch (e) {
      console.warn('Failed to fetch robots.txt', e);
    }
    
    let csrScore = isCSR ? 0 : 50;
    let finalScore = Math.min(100, csrScore + robotsScore);
    
    let explanation = 'AI agents require explicit permission to crawl and summarize your content.';
    let remediation = 'Update robots.txt to allow GPTBot, ClaudeBot, and PerplexityBot.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the technical AI crawlability readiness based on this data: Client-Side Rendering (CSR): ${isCSR ? 'Yes (Blocks basic crawlers)' : 'No (SSR/SSG, AI friendly)'}. robots.txt content: ${txt || 'None'}. If heavy CSR is used, penalize. If robots.txt explicitly allows GPTBot or ClaudeBot, reward. Score 100 for perfect SSR + explicit AI allows.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback("Analyze technical metrics", systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        { message: isCSR ? 'Client-Side Rendering Detected.' : 'Server-Side Rendering Detected.', explanation: hasLlmMessage ? explanation : 'CSR blocks AI scrapers that do not execute JavaScript.', remediation: hasLlmMessage ? remediation : 'Implement SSR or Static Generation.' },
        { message: robotsScore > 0 ? 'AI explicit allows found.' : 'Missing explicit AI allows in robots.txt.', explanation: hasLlmMessage ? explanation : 'AI agents require explicit permission to crawl and summarize your content.', remediation: hasLlmMessage ? remediation : 'Update robots.txt to allow GPTBot, ClaudeBot, and PerplexityBot.' }
      ]
    };
  }
}
