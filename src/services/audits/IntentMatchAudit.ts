import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class IntentMatchAudit implements IAuditStrategy {
  name = 'intentMatch';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get();
    
    // 1. Continuous Scoring Heuristic
    const intentWords = ['how', 'what', 'why', 'guide', 'tutorial', 'best', 'compare', 'vs', 'difference'];
    let intentScore = 0;

    headings.forEach(h => {
      const lower = h.toLowerCase();
      if (intentWords.some(w => lower.includes(w))) {
        intentScore += 20; // Each interrogative heading adds 20 points
      }
    });

    let finalScore = Math.min(100, intentScore);

    // 2. Deep Semantic Engine: User Intent Evaluation via Cloudflare AI
    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `You are evaluating an array of website headings (H1, H2, H3) for Generative Engine Optimization (GEO) "Intent Match".
Your goal is to determine if these headings directly answer common user queries, tutorials, comparisons (vs), or technical questions.
If the headings are generic corporate fluff ("Our Vision", "Welcome", "Services"), score it 0.
If the headings are highly actionable, conversational, and question-driven ("What is X?", "How to do Y", "X vs Y"), score it 100.
Evaluate the following array of headings based strictly on their conversational and problem-solving utility.`;

      const llmScore = await LlmAnalyzer.analyzeSemantics(JSON.stringify(headings), systemPrompt);
      // Give the LLM priority for contextual understanding
      finalScore = Math.round((finalScore * 0.2) + (llmScore * 0.8));
    }

    return {
      score: finalScore,
      status: finalScore >= 60 ? 'READY' : finalScore > 0 ? 'WARN' : 'FAILED',
      details: [
        { message: finalScore > 50 ? 'Conversational headings found.' : 'Headings are purely topical.', explanation: 'Generative search matches user queries directly to semantic headings.', remediation: 'Rewrite generic H2s as common questions (e.g., "What is [Product]?", "How [Product] Works").' }
      ]
    };
  }
}
