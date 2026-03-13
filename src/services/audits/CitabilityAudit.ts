import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class CitabilityAudit implements IAuditStrategy {
  name = 'citability';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
    
    let answerBlockScore = 0;
    let statScore = 0;

    const answerBlockIndicators = ['is defined as', 'refers to', 'means', 'is a', 'are a', 'represents'];
    const statIndicators = [/\b\d+(\.\d+)?\s*(%|percent)\b/i, /\b(increased|decreased)\b.*\b\d+\b/i, /\b\d+(k|m|b)\b/i];

    paragraphs.forEach(p => {
      if (p.length > 50 && p.length < 350) {
        if (answerBlockIndicators.some(indicator => p.toLowerCase().includes(indicator))) {
          answerBlockScore += 20; 
        }
      }
      if (statIndicators.some(regex => regex.test(p))) {
        statScore += 15;
      }
    });

    let finalScore = Math.min(60, answerBlockScore) + Math.min(40, statScore);
    let explanation = 'AI relies on concise, definitive statements (X is Y) to generate direct answers.';
    let remediation = 'Structure paragraphs as direct answers to common questions within your domain.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for "AI Citability" (GEO). High scores (80-100) require dense "X is Y" definitions and hard statistical metrics. Low scores (0-40) are given to fluffy, vague marketing copy lacking facts. Provide specific feedback.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(paragraphs.join('\n').slice(0, 3000), systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 80 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        {
          message: finalScore >= 60 ? 'High density of answer blocks detected.' : 'Insufficient definition blocks.',
          explanation: hasLlmMessage ? explanation : 'AI relies on concise, definitive statements (X is Y) to generate direct answers. Density of these structures impacts citability.',
          remediation: hasLlmMessage ? remediation : 'Structure paragraphs as direct answers to common questions within your domain.'
        }
      ]
    };
  }
}
