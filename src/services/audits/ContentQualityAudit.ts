import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class ContentQualityAudit implements IAuditStrategy {
  name = 'contentQuality';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const hasAuthorMeta = $('meta[name="author"]').length > 0 || $('.author, .byline').length > 0;
    const hasPublishDate = $('time').length > 0 || $('meta[property="article:published_time"]').length > 0;
    
    const wordCount = $('body').text().split(/\s+/).filter(w => w.length > 0).length;
    const wordDensityScore = Math.min(50, Math.floor(wordCount / 50)); 

    let score = wordDensityScore;
    if (hasAuthorMeta) score += 25;
    if (hasPublishDate) score += 25;

    let finalScore = score;
    let explanation = 'E-E-A-T signals require transparent authorship and substantial depth.';
    let remediation = 'Add <meta name="author">, <time> tags, and ensure word counts exceed 1,500.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) Content Quality. Word count: ${wordCount}, Has author meta: ${hasAuthorMeta}, Has publish date: ${hasPublishDate}. High scores require clear indications of authorship, freshness, and deep substantive content. Penalize thin, generic content. Provide direct feedback on the content quality.`;
      const text = $('body').text().trim().replace(/\s+/g, ' ');
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
      status: finalScore >= 75 ? 'READY' : finalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        { message: hasAuthorMeta ? 'Authorship defined.' : 'Missing explicit author metadata.', explanation: hasLlmMessage ? explanation : 'E-E-A-T signals require transparent authorship.', remediation: hasLlmMessage ? remediation : 'Add <meta name="author"> or visible author bylines.' },
        { message: hasPublishDate ? 'Content freshness indicated.' : 'Missing publish dates.', explanation: hasLlmMessage ? explanation : 'AI agents prioritize recent data over evergreen content without a timestamp.', remediation: hasLlmMessage ? remediation : 'Use HTML5 <time> tags for articles.' },
        { message: wordDensityScore >= 40 ? 'Rich content depth.' : 'Thin content detected.', explanation: hasLlmMessage ? explanation : 'AI models struggle to summarize pages with fewer than 1,000 words of substantive text.', remediation: hasLlmMessage ? remediation : 'Expand core pages to exceed 1,500 words with in-depth answers.' }
      ]
    };
  }
}
