import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class CitabilityAudit implements IAuditStrategy {
  name = 'citability';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
    
    // Move from binary regex to density and semantic heuristics
    let answerBlockScore = 0;
    let statScore = 0;

    const answerBlockIndicators = ['is defined as', 'refers to', 'means', 'is a', 'are a', 'represents'];
    const statIndicators = [/\b\d+(\.\d+)?\s*(%|percent)\b/i, /\b(increased|decreased)\b.*\b\d+\b/i, /\b\d+(k|m|b)\b/i];

    paragraphs.forEach(p => {
      // Reward concise paragraphs that read like direct answers
      if (p.length > 50 && p.length < 350) {
        if (answerBlockIndicators.some(indicator => p.toLowerCase().includes(indicator))) {
          answerBlockScore += 20; // Accumulate based on density
        }
      }

      // Reward statistical backing
      if (statIndicators.some(regex => regex.test(p))) {
        statScore += 15;
      }
    });

    const finalAnswerScore = Math.min(60, answerBlockScore);
    const finalStatScore = Math.min(40, statScore);
    const totalScore = finalAnswerScore + finalStatScore;

    return {
      score: totalScore,
      status: totalScore >= 80 ? 'READY' : totalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        {
          message: totalScore >= 60 ? 'High density of answer blocks detected.' : 'Insufficient definition blocks.',
          explanation: 'AI relies on concise, definitive statements (X is Y) to generate direct answers. Density of these structures impacts citability.',
          remediation: 'Structure paragraphs as direct answers to common questions within your domain.'
        },
        {
          message: statScore > 0 ? 'Statistical evidence found.' : 'Missing quantitative data.',
          explanation: 'Generative engines prioritize content backed by hard data and statistics.',
          remediation: 'Embed specific metrics, percentages, and hard numbers to validate claims.'
        }
      ]
    };
  }
}
