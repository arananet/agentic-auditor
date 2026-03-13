import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class SentimentAudit implements IAuditStrategy {
  name = 'sentiment';

  async execute({ $, html }: AuditContext): Promise<AuditResult> {
    // Advanced continuous sentiment proxy: check for trusted, authoritative language
    const trustWords = ['guarantee', 'proven', 'expert', 'secure', 'certified', 'trusted', 'reliable', 'award', 'recognized', 'leading'];
    const weakWords = ['maybe', 'perhaps', 'try to', 'might', 'could be', 'hopefully'];
    
    const text = $('body').text().toLowerCase();
    
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

    // Optionally utilize LlmAnalyzer if we had the API keys configured
    const llmSemanticScore = await LlmAnalyzer.analyzeSemantics(text.slice(0, 2000), "authoritative stance and brand trust");

    // Mix heuristic and ML mock (weighted)
    let finalScore = Math.max(0, Math.min(100, 50 + trustScore - weakPenalty));
    finalScore = Math.round((finalScore * 0.4) + (llmSemanticScore * 0.6));

    return {
      score: finalScore,
      status: finalScore >= 70 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: trustScore > 0 ? 'High trust markers detected.' : 'Low density of authoritative vocabulary.', explanation: 'AI agents synthesize the "sentiment" or "stance" of your brand based on vocabulary confidence.', remediation: 'Replace passive or uncertain language with definitive, authoritative statements.' },
        { message: `Semantic Confidence: ${finalScore}%`, explanation: 'A weighted NLP/heuristic analysis of brand authority and clarity.', remediation: 'Highlight awards, certifications, and guarantees.' }
      ]
    };
  }
}
