import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class ContentQualityAudit implements IAuditStrategy {
  name = 'contentQuality';

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
    const hasAuthorMeta = $('meta[name="author"]').length > 0 || $('.author, .byline, [rel="author"], [itemprop="author"]').length > 0;
    const hasPublishDate = $('time').length > 0
      || $('meta[property="article:published_time"]').length > 0
      || $('meta[itemprop="datePublished"]').length > 0
      || $('[class*="date"], [class*="publish"]').filter((_, el) => /\d{4}/.test($(el).text())).length > 0;
    
    // Extract text from main content area only, excluding nav/footer/header/aside boilerplate
    const contentSelector = 'main, article, [role="main"], #content, .content, .main-content';
    const contentEl = $(contentSelector);
    const rawText = (contentEl.length > 0 ? contentEl : $('body')).clone()
      .find('nav, footer, header, aside, script, style, noscript, [role="navigation"], [role="banner"], [role="contentinfo"]').remove().end()
      .text();
    const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;
    const wordDensityScore = Math.min(50, Math.floor(wordCount / 50)); 

    let score = wordDensityScore;
    if (hasAuthorMeta) score += 25;
    if (hasPublishDate) score += 25;

    let finalScore = score;
    let explanation = 'E-E-A-T signals require transparent authorship and substantial depth.';
    let remediation = 'Add <meta name="author">, <time> tags, and ensure word counts exceed 1,500.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) Content Quality.
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
Word count: ${wordCount}. Has author meta: ${hasAuthorMeta}. Has publish date: ${hasPublishDate}.
High scores require clear indications of authorship, freshness, and deep substantive content.
Penalize thin, generic content. Provide feedback and remediation suggestions in English, but acknowledge the page language.`;
      const text = rawText.trim().replace(/\s+/g, ' ');
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
        { message: hasAuthorMeta ? 'Authorship defined.' : 'Missing explicit author metadata.', explanation: hasLlmMessage ? explanation : 'E-E-A-T signals require transparent authorship.', remediation: hasLlmMessage ? remediation : 'Add <meta name="author"> or visible author bylines.', source: { label: 'Google E-E-A-T – Expertise & Authoritativeness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: '<meta name="author"> / .author / .byline' },
        { message: hasPublishDate ? 'Content freshness indicated.' : 'Missing publish dates.', explanation: hasLlmMessage ? explanation : 'AI agents prioritize recent data over evergreen content without a timestamp.', remediation: hasLlmMessage ? remediation : 'Use HTML5 <time> tags for articles.', source: { label: 'Google E-E-A-T – Experience & Freshness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: '<time> + <meta property="article:published_time">' },
        { message: wordDensityScore >= 40 ? 'Rich content depth.' : 'Thin content detected.', explanation: hasLlmMessage ? explanation : 'AI models struggle to summarize pages with fewer than 1,000 words of substantive text.', remediation: hasLlmMessage ? remediation : 'Expand core pages to exceed 1,500 words with in-depth answers.', source: { label: 'Google Search Quality Rater Guidelines', url: 'https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf' }, location: `<main>/<article> body text (${wordCount} words)` }
      ]
    };
  }
}
