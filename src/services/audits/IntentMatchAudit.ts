import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class IntentMatchAudit implements IAuditStrategy {
  name = 'intentMatch';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get();
    
    // Continuous scoring based on conversational interrogatives
    const intentWords = ['how', 'what', 'why', 'guide', 'tutorial', 'best', 'compare', 'vs', 'difference'];
    let intentScore = 0;

    headings.forEach(h => {
      const lower = h.toLowerCase();
      if (intentWords.some(w => lower.includes(w))) {
        intentScore += 20; // Each interrogative heading adds 20 points
      }
    });

    const finalScore = Math.min(100, intentScore);

    return {
      score: finalScore,
      status: finalScore >= 60 ? 'READY' : finalScore > 0 ? 'WARN' : 'ERROR',
      details: [
        { message: finalScore > 0 ? 'Conversational headings found.' : 'Headings are purely topical.', explanation: 'Generative search matches user queries directly to semantic headings.', remediation: 'Rewrite H2s as common questions (e.g., "What is [Product]?").' }
      ]
    };
  }
}
