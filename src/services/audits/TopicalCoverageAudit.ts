import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

/**
 * Topical Coverage Audit — evaluates whether the page is embedded in a
 * well-structured topic cluster rather than existing as an orphaned page.
 *
 * Research basis:
 * - SE Ranking (2025), 129K-domain AI citation study: pages with strong internal
 *   linking and related-content sections are cited 2.1× more often by AI engines.
 * - Google Helpful Content guidance: comprehensive topic coverage within a structured
 *   hierarchy is rewarded; orphaned pages rarely surface in AI-generated answers.
 * - Aggarwal et al. (GEO, KDD 2024): content organisation (heading hierarchy,
 *   cluster completeness) is a significant AI-citation predictor.
 */
export class TopicalCoverageAudit implements IAuditStrategy {
  name = 'topicalCoverage';

  /** Language-keyed related-content section keywords. */
  private static readonly RELATED_KEYWORDS: Record<string, string[]> = {
    en: ['related articles', 'related posts', 'related content', 'see also', 'you might also like', 'further reading', 'read next', 'recommended reading', 'more from', 'similar articles', 'keep reading'],
    pt: ['artigos relacionados', 'posts relacionados', 'conteúdo relacionado', 'veja também', 'leia também', 'leitura recomendada', 'mais artigos', 'similar'],
    es: ['artículos relacionados', 'posts relacionados', 'ver también', 'también te puede interesar', 'lectura recomendada', 'más artículos'],
    fr: ['articles liés', 'articles connexes', 'voir aussi', 'vous pourriez aussi aimer', 'lecture recommandée', 'plus sur'],
    de: ['verwandte artikel', 'ähnliche artikel', 'siehe auch', 'das könnte sie auch interessieren', 'empfohlene artikel'],
    it: ['articoli correlati', 'articoli simili', 'vedi anche', 'potrebbe interessarti', 'lettura consigliata'],
  };

  async execute({ $, baseUrl, language }: AuditContext): Promise<AuditResult> {
    // 1. Internal link count — same-domain links signal cluster connectivity
    const hostname = (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })();
    const internalLinkCount = $('a[href]').filter((_, el) => {
      const href = $(el).attr('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
      return href.startsWith('/') || (hostname && href.includes(hostname));
    }).length;

    // 2. Heading hierarchy — topic tree depth and subtopic breadth
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;

    // 3. Related content section — cluster membership signal
    const relatedKeywords = [
      ...(TopicalCoverageAudit.RELATED_KEYWORDS[language] || []),
      ...(language !== 'en' ? TopicalCoverageAudit.RELATED_KEYWORDS['en'] : []),
    ];
    const bodyTextLower = $('body').text().toLowerCase();
    const hasRelatedSection =
      relatedKeywords.some(kw => bodyTextLower.includes(kw)) ||
      $('[class*="related"], [class*="similar"], [id*="related"], [id*="similar"]').length > 0;

    // 4. Category/tag/topic links — content taxonomy signal
    const hasCategoryLinks = $('a[href*="/category/"], a[href*="/tag/"], a[href*="/topic/"], a[href*="/tags/"], a[href*="/categor"]').length > 0;

    // 5. Breadcrumb navigation — site hierarchy depth signal
    // (BreadcrumbList schema, aria-label, or class-name conventions)
    const hasBreadcrumb =
      $('[class*="breadcrumb"], [id*="breadcrumb"], nav[aria-label*="breadcrumb"], [aria-label*="Breadcrumb"], [itemtype*="BreadcrumbList"]').length > 0 ||
      $('script[type="application/ld+json"]').toArray().some(el => {
        try { return JSON.stringify(JSON.parse($(el).html() || '')).includes('BreadcrumbList'); } catch { return false; }
      });

    // --- Scoring ---
    // Internal links: 2 pts per link, capped at 30
    // Rationale: SE Ranking (2025) shows 15+ internal links correlates with 2.1× citation rate
    const internalLinkScore = Math.min(30, internalLinkCount * 2);

    // Heading hierarchy: single H1 best-practice (+8), H2 subtopics (+2 each, max 14), H3 depth (+1 each, max 8)
    const h1Score = h1Count === 1 ? 8 : h1Count > 1 ? 4 : 0;
    const h2Score = Math.min(14, h2Count * 2);
    const h3Score = Math.min(8, h3Count);
    const headingScore = h1Score + h2Score + h3Score; // max 30

    // Cluster signals
    const relatedBonus    = hasRelatedSection ? 20 : 0;
    const categoryBonus   = hasCategoryLinks  ? 10 : 0;
    const breadcrumbBonus = hasBreadcrumb     ? 10 : 0;

    let totalScore = Math.min(100, internalLinkScore + headingScore + relatedBonus + categoryBonus + breadcrumbBonus);
    let finalScore = totalScore;
    let explanation = 'Pages embedded in a topic cluster with strong internal linking and related content sections are cited more frequently by AI engines.';
    let remediation = 'Add a "Related Articles" section, ensure a clear heading hierarchy (H1→H2→H3), and increase contextual internal links to related content on your site.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const headings = $('h1, h2, h3')
        .map((_, el) => `[${el.tagName.toUpperCase()}] ${$(el).text().trim()}`)
        .get().slice(0, 30).join('\n');
      const sampleLinks = $('a[href]')
        .map((_, el) => $(el).attr('href'))
        .get()
        .filter(h => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:'))
        .slice(0, 30).join('\n');

      const topicalContext = `Page language: ${language}.
Internal links (same-domain): ${internalLinkCount}. Heading hierarchy: H1×${h1Count}, H2×${h2Count}, H3×${h3Count}. Related content section: ${hasRelatedSection}. Category/tag links: ${hasCategoryLinks}. Breadcrumb nav: ${hasBreadcrumb}.
Heading outline:
${headings}
Sample internal links:
${sampleLinks}`;

      const systemPrompt = `Evaluate the topical coverage and cluster integration of this webpage for GEO 2026.
The page is in "${language}". Evaluate IN ITS ORIGINAL LANGUAGE — do not penalise for non-English content.
AI engines (ChatGPT, Perplexity, Claude) heavily weight topical authority. Pages embedded in comprehensive topic clusters with strong internal linking are cited significantly more often than isolated orphan pages.
Key signals to assess:
(1) Internal link count — fewer than 5 signals an orphaned page; 15+ is strong.
(2) Heading hierarchy — a clear H1→H2→H3 structure signals comprehensive topic coverage and subtopic depth.
(3) Related content sections ("Related Articles", "See Also") signal cluster membership.
(4) Category/tag links signal content taxonomy integration.
(5) Breadcrumb navigation signals structured site hierarchy.
SE Ranking (2025), 129K-domain study: pages with strong topical cluster structure are cited 2.1× more often by AI engines.
Score 100: 15+ internal links, rich H1→H2→H3 hierarchy, related content section, category taxonomy, breadcrumb nav.
Score 0: isolated page, no internal links, single heading, no cluster signals.
Provide specific remediation advice.`;

      const llmResult = await LlmAnalyzer.analyzeWithFeedback(topicalContext, systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 70 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        {
          message: internalLinkCount >= 10
            ? `Strong internal linking: ${internalLinkCount} same-domain links.`
            : internalLinkCount >= 3
              ? `Moderate internal linking: ${internalLinkCount} same-domain links.`
              : `Weak internal linking: only ${internalLinkCount} same-domain link(s) — potential orphaned page.`,
          explanation: hasLlmMessage ? explanation : 'Pages embedded in a topic cluster with 15+ internal links are cited 2.1× more often by AI engines (SE Ranking, 2025, 129K domains). Isolated "orphan" pages with few internal links rarely appear in AI-generated answers.',
          remediation: hasLlmMessage ? remediation : 'Add contextual internal links to related articles, guides, and your topic cluster hub page. Aim for at least 5–10 contextual internal links per page.',
          source: { label: 'SE Ranking (2025) — 129K Domain AI Citation Study', url: 'https://seranking.com/blog/ai-overviews-study/' },
          location: `<a href="..."> internal links (${internalLinkCount} detected)`,
        },
        {
          message: h1Count === 1 && h2Count >= 3
            ? `Clear topic hierarchy: 1 H1, ${h2Count} H2s, ${h3Count} H3s.`
            : h1Count !== 1
              ? `H1 issue: ${h1Count === 0 ? 'missing H1' : `${h1Count} H1s found — should be exactly 1`}.`
              : `Shallow heading structure: ${h2Count} H2(s), ${h3Count} H3(s) — add more subtopic headings.`,
          explanation: hasLlmMessage ? explanation : 'A clear H1→H2→H3 heading hierarchy signals to AI engines that the page comprehensively covers a topic and its subtopics. AI engines use the heading outline as a "topic map" when extracting and attributing answers (Aggarwal et al., GEO, KDD 2024).',
          remediation: hasLlmMessage ? remediation : 'Structure content with exactly one H1 (primary topic), 3–8 H2 subheadings (subtopics), and H3s for sub-points. Each heading should represent a distinct subtopic.',
          source: { label: 'GEO: Generative Engine Optimization (Aggarwal et al., KDD 2024)', url: 'https://arxiv.org/abs/2311.09735' },
          location: `<h1>×${h1Count}, <h2>×${h2Count}, <h3>×${h3Count}`,
        },
        {
          message: hasRelatedSection
            ? 'Related content section detected — strong cluster membership signal.'
            : 'No related content section detected — page may appear isolated to AI engines.',
          explanation: hasLlmMessage ? explanation : 'A "Related Articles" or "See Also" section signals that the page belongs to a comprehensive topic cluster. Perplexity and AI Overviews preferentially cite pages that link to supporting cluster content rather than standalone pages.',
          remediation: hasLlmMessage ? remediation : 'Add a "Related Articles" or "Further Reading" section at the bottom of each page, linking to 3–6 topically related pages on your site.',
          source: { label: 'Google — Helpful Content and Topical Authority', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' },
          location: '[class*="related"], [class*="similar"], "Related Articles" text',
        },
        {
          message: (hasCategoryLinks || hasBreadcrumb)
            ? `Content taxonomy detected: ${[hasBreadcrumb ? 'breadcrumb navigation' : '', hasCategoryLinks ? 'category/tag links' : ''].filter(Boolean).join(' + ')}.`
            : 'No content taxonomy signals detected (no breadcrumbs or category/tag links).',
          explanation: hasLlmMessage ? explanation : 'Breadcrumb navigation and category/tag links signal that the page belongs to a structured content hierarchy. AI engines use these signals to understand topic relationships and preferentially cite content from well-organised, hierarchically structured sites.',
          remediation: hasLlmMessage ? remediation : 'Add BreadcrumbList structured data and link to parent category/tag pages to embed this page in your site\'s topic taxonomy.',
          source: { label: 'Google Search Central — Breadcrumbs structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb' },
          location: '[class*="breadcrumb"], a[href*="/category/"], a[href*="/tag/"]',
        },
      ],
    };
  }
}
