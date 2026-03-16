import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class IntentMatchAudit implements IAuditStrategy {
  name = 'intentMatch';

  /** Intent-signal words per language — covers interrogative, tutorial, and comparison patterns. */
  private static readonly INTENT_WORDS: Record<string, string[]> = {
    en: ['how', 'what', 'why', 'when', 'where', 'which', 'guide', 'tutorial', 'best', 'compare', 'vs', 'difference', 'tips', 'steps'],
    pt: ['como', 'o que', 'por que', 'porque', 'quando', 'onde', 'qual', 'guia', 'tutorial', 'melhor', 'melhores', 'comparar', 'dicas', 'passo'],
    es: ['cómo', 'qué', 'por qué', 'cuándo', 'dónde', 'cuál', 'guía', 'tutorial', 'mejor', 'mejores', 'comparar', 'vs', 'diferencia', 'consejos', 'pasos'],
    fr: ['comment', 'quoi', 'pourquoi', 'quand', 'où', 'quel', 'guide', 'tutoriel', 'meilleur', 'comparer', 'vs', 'différence', 'conseils', 'étapes'],
    de: ['wie', 'was', 'warum', 'wann', 'wo', 'welche', 'anleitung', 'tutorial', 'beste', 'vergleich', 'vs', 'unterschied', 'tipps', 'schritte'],
    it: ['come', 'cosa', 'perché', 'quando', 'dove', 'quale', 'guida', 'tutorial', 'migliore', 'confronto', 'vs', 'differenza', 'consigli', 'passaggi'],
  };

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
    const headings = $('h1, h2, h3').map((_, el) => $(el).text().trim()).get();
    
    // 1. Continuous Scoring Heuristic — use language-specific intent words
    const words = IntentMatchAudit.INTENT_WORDS[language] || IntentMatchAudit.INTENT_WORDS['en'];
    let intentScore = 0;

    headings.forEach(h => {
      const lower = h.toLowerCase();
      if (words.some(w => lower.includes(w))) {
        intentScore += 20;
      }
    });

    let finalScore = Math.min(100, intentScore);
    let explanation = 'Generative search matches user queries directly to semantic headings.';
    let remediation = 'Rewrite generic H2s as common questions (e.g., "What is [Product]?", "How [Product] Works").';
    let hasLlmMessage = false;

    // 2. Deep Semantic Engine: User Intent Evaluation via Cloudflare AI
    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `You are evaluating an array of website headings (H1, H2, H3) for Generative Engine Optimization (GEO) "Intent Match".
The page language is "${language}". Evaluate the headings IN THAT LANGUAGE — do not penalize for not being in English.
Your goal is to determine if these headings directly answer common user queries, tutorials, comparisons (vs), or technical questions in ${language}.
If the headings are generic corporate fluff (e.g. "Our Vision", "Welcome", "Services", or their equivalents in ${language}), score it 0.
If the headings are highly actionable, conversational, and question-driven (e.g. "What is X?", "How to do Y", "X vs Y", or their ${language} equivalents), score it 100.
Provide remediation examples IN ${language} appropriate for the site's market.`;

      const llmResult = await LlmAnalyzer.analyzeWithFeedback(JSON.stringify(headings), systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 60 ? 'READY' : finalScore > 0 ? 'WARN' : 'FAILED',
      details: [
        { message: finalScore > 50 ? 'Conversational headings found.' : 'Headings are purely topical.', explanation: hasLlmMessage ? explanation : 'Generative search relies on headings matching user search queries directly.', remediation: hasLlmMessage ? remediation : 'Rewrite H2s as common queries.', source: { label: 'GEO: Generative Engine Optimization (Aggarwal et al., 2023)', url: 'https://arxiv.org/abs/2311.09735' }, location: `<h1>/<h2>/<h3> (${headings.length} heading${headings.length !== 1 ? 's' : ''})` }
      ]
    };
  }
}
