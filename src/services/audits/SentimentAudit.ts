import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class SentimentAudit implements IAuditStrategy {
  name = 'sentiment';

  async execute({ $, html }: AuditContext): Promise<AuditResult> {
    const text = $('body').text().toLowerCase();
    
    // 1. Base Heuristic: Fast Lexical Density
    const trustWords = ['guarantee', 'proven', 'expert', 'secure', 'certified', 'trusted', 'reliable', 'award', 'recognized', 'leading'];
    const weakWords = ['maybe', 'perhaps', 'try to', 'might', 'could be', 'hopefully'];
    
    let trustScore = 0;
    trustWords.forEach(w => {
      const regex = new RegExp(`\\b${w}\\b`, 'g');
      trustScore += (text.match(regex) || []).length * 5;
    });

    let weakPenalty = 0;
    weakWords.forEach(w => {
      const regex = new RegExp(`\\b${w}\\b`, 'g');
      weakPenalty += (text.match(regex) || []).length * 10;
    });

    let finalScore = Math.max(0, Math.min(100, trustScore - weakPenalty));
    let explanation = 'A weighted analysis of brand authority and clarity.';
    let remediation = 'Highlight awards, certifications, and guarantees prominently.';
    let hasLlmMessage = false;

    // 2. Deep Semantic Check: LLM Override (if configured)
    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `You are evaluating website text for "Brand Sentiment & Authority" under Generative Engine Optimization (GEO) standards.
Evaluate the text's stance: Does it sound like an undisputed industry leader, or is the language passive, weak, or apologetic? 
Look for strong trust markers (certifications, guarantees, expertise) versus weak qualifiers (might, maybe, try to). 
Score 100 for absolute authoritative domain expertise, 50 for average marketing copy, and 0 for extremely passive/untrustworthy language. Provide specific feedback on the tone.`;
      
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(text.slice(0, 3000), systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 70 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: trustScore > 0 ? 'High trust markers detected.' : 'Low density of authoritative vocabulary.', explanation: 'AI agents synthesise the "sentiment" or "stance" of your brand based on vocabulary confidence.', remediation: 'Replace passive or uncertain language with definitive, authoritative statements.', source: { label: 'Google E-E-A-T – Trust & Authoritativeness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: 'document.body — vocabulary density analysis' },
        { message: hasLlmMessage ? `Authority Score: ${finalScore}/100 (Deep Semantic)` : `Authority Score: ${finalScore}/100 (Heuristic)`, explanation, remediation, source: { label: 'Google E-E-A-T – Trust & Authoritativeness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: 'document.body — tone & stance analysis' }
      ]
    };
  }
}
