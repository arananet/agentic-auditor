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

    // GEO: Meta description — AI engines use this as a summary signal
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const hasMetaDesc = metaDesc.length >= 50 && metaDesc.length <= 300;

    // GEO: Open Graph tags — used by AI for entity resolution and rich snippets
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogType = $('meta[property="og:type"]').attr('content') || '';
    const ogTagCount = [ogTitle, ogDesc, ogImage, ogType].filter(v => v.length > 0).length;

    // GEO: <time datetime> ISO 8601 validation — machine-readable date for freshness signals
    const timeElements = $('time[datetime]');
    let validDatetimeCount = 0;
    timeElements.each((_, el) => {
      const dt = $(el).attr('datetime') || '';
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/.test(dt)) {
        validDatetimeCount++;
      }
    });
    const hasValidDatetime = validDatetimeCount > 0;

    // Extract text from main content area only, excluding nav/footer/header/aside boilerplate
    const contentSelector = 'main, article, [role="main"], #content, .content, .main-content';
    const contentEl = $(contentSelector);
    const rawText = (contentEl.length > 0 ? contentEl : $('body')).clone()
      .find('nav, footer, header, aside, script, style, noscript, [role="navigation"], [role="banner"], [role="contentinfo"]').remove().end()
      .text();
    const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;
    const wordDensityScore = Math.min(30, Math.floor(wordCount / 50));

    let score = wordDensityScore;
    if (hasAuthorMeta) score += 15;
    if (hasPublishDate) score += 15;
    if (hasMetaDesc) score += 15;
    score += Math.round((ogTagCount / 4) * 15);
    if (hasValidDatetime) score += 10;

    let finalScore = score;
    let explanation = 'E-E-A-T signals require transparent authorship and substantial depth.';
    let remediation = 'Add <meta name="author">, <time> tags, and ensure word counts exceed 1,500.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) Content Quality AND GEO machine-readable metadata.
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
Word count: ${wordCount}. Has author meta: ${hasAuthorMeta}. Has publish date: ${hasPublishDate}.
Meta description: ${hasMetaDesc ? `"${metaDesc.slice(0, 160)}" (${metaDesc.length} chars)` : 'MISSING'}.
Open Graph: og:title=${ogTitle ? 'yes' : 'no'}, og:description=${ogDesc ? 'yes' : 'no'}, og:image=${ogImage ? 'yes' : 'no'}, og:type=${ogType || 'missing'}.
<time datetime> ISO 8601: ${validDatetimeCount} valid element(s) found.
High scores require authorship, freshness, deep content, AND complete machine-readable metadata (meta description 50-160 chars, OG tags, valid ISO datetime).
Provide feedback and remediation suggestions in English, but acknowledge the page language.`;
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
        { message: hasMetaDesc ? `Meta description present (${metaDesc.length} chars).` : 'Missing or inadequate meta description.', explanation: hasLlmMessage ? explanation : 'AI engines use meta descriptions as a summary signal for snippet generation and entity extraction.', remediation: hasLlmMessage ? remediation : 'Add <meta name="description"> with 50-160 chars summarizing the page content.', source: { label: 'Google Search Central – Meta descriptions', url: 'https://developers.google.com/search/docs/appearance/snippet#meta-descriptions' }, location: '<head> <meta name="description">' },
        { message: ogTagCount >= 3 ? `Open Graph tags present (${ogTagCount}/4).` : `Incomplete Open Graph tags (${ogTagCount}/4).`, explanation: hasLlmMessage ? explanation : 'OG tags (og:title, og:description, og:image, og:type) provide structured metadata that AI engines use for entity resolution and rich previews.', remediation: hasLlmMessage ? remediation : 'Add og:title, og:description, og:image, and og:type meta tags.', source: { label: 'Open Graph Protocol', url: 'https://ogp.me/' }, location: '<head> <meta property="og:*">' },
        { message: hasValidDatetime ? `Valid ISO 8601 datetime found (${validDatetimeCount} element${validDatetimeCount > 1 ? 's' : ''}).` : 'No valid <time datetime> with ISO 8601 format.', explanation: hasLlmMessage ? explanation : 'Machine-readable ISO 8601 dates in <time datetime> enable AI engines to assess content freshness accurately.', remediation: hasLlmMessage ? remediation : 'Use <time datetime="2024-01-15T10:00:00Z"> with ISO 8601 format.', source: { label: 'HTML Living Standard – time element', url: 'https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-time-element' }, location: '<time datetime="..."> elements' },
        { message: wordDensityScore >= 20 ? 'Rich content depth.' : 'Thin content detected.', explanation: hasLlmMessage ? explanation : 'AI models struggle to summarize pages with fewer than 1,000 words of substantive text.', remediation: hasLlmMessage ? remediation : 'Expand core pages to exceed 1,500 words with in-depth answers.', source: { label: 'Google Search Quality Rater Guidelines', url: 'https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf' }, location: `<main>/<article> body text (${wordCount} words)` }
      ]
    };
  }
}
