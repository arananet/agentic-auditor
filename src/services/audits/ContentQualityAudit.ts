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

    // GEO: Freshness recency — AI engines heavily weight recently updated content
    const modifiedTimeMeta = $('meta[property="article:modified_time"]').attr('content') || '';
    const publishTimeMeta = $('meta[property="article:published_time"]').attr('content') || '';
    const bestDateStr = modifiedTimeMeta || publishTimeMeta || '';
    let freshnessLevel: 'excellent' | 'good' | 'stale' | 'unknown' = 'unknown';
    if (bestDateStr) {
      const dateMs = Date.parse(bestDateStr);
      if (!isNaN(dateMs)) {
        const daysSince = Math.floor((Date.now() - dateMs) / (1000 * 60 * 60 * 24));
        if (daysSince <= 30) freshnessLevel = 'excellent';
        else if (daysSince <= 180) freshnessLevel = 'good';
        else freshnessLevel = 'stale';
      }
    }
    const bodyText = $('body').text();
    const hasVisibleUpdateDate = /\b(last\s+updated|updated\s+on|modified|actualizado|atualizado|mis\s+à\s+jour|aktualisiert|aggiornato)\b/i.test(bodyText);

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
    if (hasAuthorMeta) score += 12;
    if (hasPublishDate) score += 10;
    if (hasMetaDesc) score += 13;
    score += Math.round((ogTagCount / 4) * 12);
    if (hasValidDatetime) score += 8;
    if (freshnessLevel === 'excellent') score += 8;
    else if (freshnessLevel === 'good') score += 5;
    else if (freshnessLevel === 'stale') score += 2;
    if (hasVisibleUpdateDate) score += 5;
    if (modifiedTimeMeta) score += 2;

    // ── H1 Quality & Above-the-Fold Clarity ──────────────────────────────────
    // Inspired by icp-website-audit "First Impression" and "Messaging Relevance" dimensions.
    // Research basis: Google Helpful Content guidance — the page should immediately
    // communicate what it covers; Aggarwal et al. (GEO, KDD 2024) — answer-first
    // content structure with a clear subject-predicate opening improves AI extraction.

    // H1 presence and optimal length (10–80 chars: clear, descriptive, not truncated)
    const h1El = $('h1').first();
    const h1Text = h1El.text().trim();
    const hasH1 = h1Text.length > 0;
    const h1Length = h1Text.length;
    const h1IsOptimal = hasH1 && h1Length >= 10 && h1Length <= 80;
    const h1Score = hasH1 ? (h1IsOptimal ? 10 : 5) : 0;

    // Above-the-fold substance — does the page open with substantive content
    // rather than a hero image only? Check the first 5 <p> elements.
    const firstParaText = $('p').slice(0, 5).map((_, el) => $(el).text().trim()).get().join(' ');
    const aboveTheFoldWords = firstParaText.split(/\s+/).filter(Boolean).length;
    const hasAboveTheFoldContent = aboveTheFoldWords >= 40;
    const aboveTheFoldScore = aboveTheFoldWords >= 80 ? 8 : aboveTheFoldWords >= 40 ? 4 : 0;

    // Objection-handling content — trust-building signals AI engines use when
    // answering "Is X reliable / worth it?" queries (icp-website-audit: Objection Handling)
    const bodyTextObjCheck = $('body').text();
    const objectionPatterns = [
      /\b(money[\s-]back\s+guarantee|refund\s+policy|satisfaction\s+guaranteed)\b/i,
      /\b(free\s+trial|cancel\s+anytime|no\s+(commitment|contract|credit\s+card))\b/i,
      /\b(warranty|return\s+policy|returns?\s+accepted)\b/i,
    ];
    const objectionCount = objectionPatterns.filter(p => p.test(bodyTextObjCheck)).length;
    const objectionScore = objectionCount >= 2 ? 5 : objectionCount === 1 ? 2 : 0;

    score += h1Score + aboveTheFoldScore + objectionScore;

    let finalScore = Math.min(100, score);
    let explanation = 'E-E-A-T signals require transparent authorship, substantial depth, and clear above-the-fold messaging.';
    let remediation = 'Add <meta name="author">, <time> tags, a clear H1, and ensure the first paragraph opens with substantive content.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following text for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) Content Quality AND GEO machine-readable metadata.
The page is in "${language}". Evaluate the content IN ITS ORIGINAL LANGUAGE — do not penalize for not being in English.
Word count: ${wordCount}. Has author meta: ${hasAuthorMeta}. Has publish date: ${hasPublishDate}.
Meta description: ${hasMetaDesc ? `"${metaDesc.slice(0, 160)}" (${metaDesc.length} chars)` : 'MISSING'}.
Open Graph: og:title=${ogTitle ? 'yes' : 'no'}, og:description=${ogDesc ? 'yes' : 'no'}, og:image=${ogImage ? 'yes' : 'no'}, og:type=${ogType || 'missing'}.
<time datetime> ISO 8601: ${validDatetimeCount} valid element(s) found.
Freshness: article:modified_time=${modifiedTimeMeta || 'MISSING'}. Recency level: ${freshnessLevel}. Visible "Last updated" text: ${hasVisibleUpdateDate}.
H1: ${hasH1 ? `"${h1Text.slice(0, 80)}" (${h1Length} chars, ${h1IsOptimal ? 'optimal' : 'suboptimal'} length)` : 'MISSING'}.
Above-the-fold: ${aboveTheFoldWords} words in first 5 paragraphs (${hasAboveTheFoldContent ? 'sufficient' : 'insufficient'}).
Objection-handling content detected: ${objectionCount} pattern(s) (money-back, free trial, warranty, etc.).
ChatGPT cites content updated within 30 days 3.2x more often (SE Ranking, 129K domains).
High scores require authorship, freshness, deep content, complete machine-readable metadata (meta description 50-160 chars, OG tags, valid ISO datetime), a clear optimally-sized H1, substantive above-the-fold text, and trust/objection-handling signals.
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
        { message: freshnessLevel === 'excellent' ? 'Content recently updated (within 30 days) — excellent freshness.' : freshnessLevel === 'good' ? 'Content updated within 6 months — good freshness.' : freshnessLevel === 'stale' ? 'Content older than 6 months — stale.' : 'No article:modified_time detected — freshness unknown.', explanation: hasLlmMessage ? explanation : 'ChatGPT cites content updated within 30 days 3.2x more often than older content (SE Ranking, 129K domains).', remediation: hasLlmMessage ? remediation : 'Add <meta property="article:modified_time"> with current date, display "Last updated: [date]" prominently, and refresh competitive content quarterly.', source: { label: 'SE Ranking (2025) — Domain authority study, 129K domains', url: 'https://seranking.com/blog/ai-overviews-study/' }, location: '<meta property="article:modified_time"> + visible update text' },
        { message: wordDensityScore >= 20 ? 'Rich content depth.' : 'Thin content detected.', explanation: hasLlmMessage ? explanation : 'AI models struggle to summarize pages with fewer than 1,000 words of substantive text.', remediation: hasLlmMessage ? remediation : 'Expand core pages to exceed 1,500 words with in-depth answers.', source: { label: 'Google Search Quality Rater Guidelines', url: 'https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf' }, location: `<main>/<article> body text (${wordCount} words)` },
        {
          message: hasH1
            ? (h1IsOptimal ? `H1 present and optimal length: "${h1Text.slice(0, 60)}${h1Length > 60 ? '…' : ''}" (${h1Length} chars).` : `H1 present but suboptimal length (${h1Length} chars — aim for 10–80 chars): "${h1Text.slice(0, 60)}".`)
            : 'Missing H1 heading — page has no primary topic declaration.',
          explanation: hasLlmMessage ? explanation : 'The H1 is the primary topic signal AI engines use to classify and answer queries about a page. A clear, concise H1 (10–80 chars) that names the page\'s subject enables accurate "What is X?" and "How to X" query matching (Aggarwal et al., GEO, KDD 2024).',
          remediation: hasLlmMessage ? remediation : 'Add a single, descriptive H1 that clearly states the page\'s primary topic. Keep it between 10–80 characters. Use a subject-predicate pattern: "[Topic] is/does/helps [outcome]".',
          source: { label: 'GEO: Generative Engine Optimization — Answer-first content structure (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: '<h1> element (first)',
        },
        {
          message: hasAboveTheFoldContent
            ? `Above-the-fold substance detected (${aboveTheFoldWords} words in first paragraphs).`
            : `Thin above-the-fold content: only ${aboveTheFoldWords} words in first paragraphs — page may open with imagery only.`,
          explanation: hasLlmMessage ? explanation : 'AI engines extract the first substantive text block to answer direct queries. Pages that open with a hero image only (no text in the first viewport) force AI crawlers to scan deeper, reducing citation likelihood. Google Helpful Content guidance: pages should immediately deliver on their promise.',
          remediation: hasLlmMessage ? remediation : 'Ensure the first 40–80 words after the H1 contain substantive, indexable text — a concise summary of what the page covers. Avoid opening sections that are pure images or JavaScript-rendered carousels with no static text.',
          source: { label: 'Google — Creating helpful, reliable, people-first content', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
          location: 'First 5 <p> elements (above-the-fold zone)',
        },
        ...(objectionCount > 0 ? [{
          message: `Trust / objection-handling content detected (${objectionCount} signal(s): ${objectionPatterns.filter(p => p.test(bodyTextObjCheck)).map((_, i) => ['money-back/refund', 'free trial/no-commitment', 'warranty/return policy'][i]).filter(Boolean).join(', ')}).`,
          explanation: hasLlmMessage ? explanation : 'Objection-handling content (money-back guarantees, free trials, return policies) signals trustworthiness to AI engines when answering "Is X worth it?" or "Is X reliable?" queries. Google E-E-A-T Trustworthiness dimension explicitly rewards sites that reduce purchase risk for users.',
          remediation: hasLlmMessage ? remediation : 'Keep existing objection-handling content visible. Consider adding schema markup (e.g., Offer with refundPolicy) to make these signals machine-readable.',
          source: { label: 'Google E-E-A-T — Trustworthiness signals', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
          location: 'body text — guarantee/trial/policy patterns',
        }] : []),
      ]
    };
  }
}
