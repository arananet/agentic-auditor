import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';
import { fetchTextFile } from '../fetchWithTimeout';

/** Parse robots.txt into per-User-Agent blocks */
function parseRobotsBlocks(raw: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let currentAgents: string[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const uaMatch = trimmed.match(/^User-agent:\s*(.+)$/i);
    if (uaMatch) {
      const agent = uaMatch[1].trim().toLowerCase();
      currentAgents.push(agent);
      if (!blocks.has(agent)) blocks.set(agent, []);
    } else if (currentAgents.length > 0) {
      for (const agent of currentAgents) {
        blocks.get(agent)!.push(trimmed);
      }
      // Once we see a directive, new User-agent lines start a new block
      if (/^(allow|disallow|sitemap|crawl-delay):/i.test(trimmed)) {
        // Keep collecting directives for the same block
      }
    }
    // Reset agents on blank line between blocks
    if (trimmed === '') currentAgents = [];
  }
  return blocks;
}

function isBotAllowed(blocks: Map<string, string[]>, botName: string): boolean {
  const key = botName.toLowerCase();
  const directives = blocks.get(key);
  if (!directives) return false;
  // Check if there's an explicit "Allow: /" and no blanket "Disallow: /"
  const hasAllow = directives.some(d => /^allow:\s*\//i.test(d));
  const hasBlanketDisallow = directives.some(d => /^disallow:\s*\/$/i.test(d));
  return hasAllow && !hasBlanketDisallow;
}

export class TechnicalAudit implements IAuditStrategy {
  name = 'technical';

  async execute({ $, html, baseUrl }: AuditContext): Promise<AuditResult> {
    // 1. CSR detection — check if body has very little static text vs heavy JS
    const bodyHtmlLength = html.length;
    const scriptCount = $('script').length;
    const bodyTextLength = $('body').text().trim().replace(/\s+/g, ' ').length;
    const isCSR = scriptCount > 5 && bodyTextLength < 500;

    // 2. Robots.txt — use plain fetch (no JS rendering needed)
    let robotsTxtFound = false;
    let robotsScore = 0;
    let robotsContent = "";

    try {
      const raw = await fetchTextFile(`${baseUrl}/robots.txt`, 10000);
      if (raw.length > 20 && raw.toLowerCase().includes('user-agent')) {
        robotsTxtFound = true;
        robotsContent = raw;
        const blocks = parseRobotsBlocks(raw);

        const aiBots = [
          // OpenAI (developers.openai.com/api/docs/bots)
          'GPTBot',            // AI training crawler
          'OAI-SearchBot',     // ChatGPT search results
          'ChatGPT-User',      // user-triggered browsing
          // Anthropic (support.claude.com/en/articles/8896518)
          'ClaudeBot',         // AI training crawler
          'Claude-SearchBot',  // search quality crawler
          // Google (developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
          'Google-Extended',   // Gemini AI training opt-out token
          // Amazon (developer.amazon.com/support/amazonbot)
          'Amazonbot',         // AI training + Alexa / Rufus
          // Perplexity (docs.perplexity.ai)
          'PerplexityBot',
          // Apple (support.apple.com/en-us/119829)
          'Applebot-Extended', // Apple Intelligence training opt-out
          // Meta (developers.facebook.com/docs/sharing/webmasters/web-crawlers)
          'meta-externalagent',   // AI training / direct indexing
          'meta-webindexer',      // Meta AI search quality
          'meta-externalfetcher', // user-triggered fetches
          'facebookexternalhit',  // link previews (Facebook/Instagram/Messenger)
          // Third-party AI crawlers
          'Bytespider',  // ByteDance / TikTok
          'cohere-ai',   // Cohere
          'Diffbot',     // Diffbot structured data
        ];
        aiBots.forEach(bot => {
          if (isBotAllowed(blocks, bot)) {
            robotsScore += 12;
          }
        });
        // Also check wildcard: Allow: / with no blanket Disallow
        if (isBotAllowed(blocks, '*')) {
          robotsScore += 4;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch robots.txt', e);
    }

    // 3. Meta robots tag check
    const metaRobots = $('meta[name="robots"]').attr('content') || '';
    const blocksIndexing = /noindex|nofollow/i.test(metaRobots);

    // 4. GEO: Canonical URL — ensures AI engines resolve the authoritative version
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
    const hasCanonical = canonicalUrl.length > 0;

    // 5. GEO: Hreflang — signals locale variants for multilingual AI indexing
    const hreflangTags = $('link[rel="alternate"][hreflang]');
    const hreflangCount = hreflangTags.length;
    const hasHreflang = hreflangCount > 0;

    // 6. GEO: XML Sitemap — AI crawlers use this to discover crawlable content
    let hasSitemap = false;
    try {
      const sitemapRaw = await fetchTextFile(`${baseUrl}/sitemap.xml`, 10000);
      if (sitemapRaw.length > 50 && /<urlset|<sitemapindex/i.test(sitemapRaw)) {
        hasSitemap = true;
      }
    } catch (e) {
      // Sitemap not reachable — not a hard failure
    }

    let csrScore = isCSR ? 0 : 50;
    let metaPenalty = blocksIndexing ? -20 : 0;
    let geoBonus = (hasCanonical ? 5 : 0) + (hasHreflang ? 5 : 0) + (hasSitemap ? 5 : 0);
    let finalScore = Math.max(0, Math.min(100, csrScore + robotsScore + metaPenalty + geoBonus));

    let explanation = 'AI agents require explicit permission to crawl and index content.';
    let remediation = 'Update robots.txt to allow AI crawlers and use SSR/SSG.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const technicalContext = `CSR detected: ${isCSR} (scripts: ${scriptCount}, static text length: ${bodyTextLength}). Robots.txt found: ${robotsTxtFound}. Robots.txt content: ${robotsContent.slice(0, 1500)}. Meta robots: "${metaRobots}". Blocks indexing: ${blocksIndexing}. Canonical URL: ${hasCanonical ? canonicalUrl : 'MISSING'}. Hreflang tags: ${hreflangCount} found. XML Sitemap: ${hasSitemap ? 'reachable' : 'NOT found'}.`;
      const systemPrompt = `Evaluate technical AI crawlability for GEO 2026. Verified AI crawlers (16 documented tokens): GPTBot, OAI-SearchBot, ChatGPT-User (OpenAI); ClaudeBot, Claude-SearchBot (Anthropic); PerplexityBot; Google-Extended (Gemini); Amazonbot; Applebot-Extended (Apple Intelligence); meta-externalagent, meta-webindexer, meta-externalfetcher, facebookexternalhit (Meta); Bytespider (ByteDance/TikTok); cohere-ai (Cohere); Diffbot. CSR blocks basic AI crawlers that don't execute JS. A robots.txt should explicitly Allow these bots. Meta noindex/nofollow prevents indexing. Canonical URL signals the authoritative version for deduplication. Hreflang tags signal locale variants for multilingual indexing. XML Sitemap enables efficient AI crawl discovery. Score 100 for SSR + explicit AI allows + canonical + sitemap + no blocking meta tags. Score 0 for heavy CSR + blocked bots.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(technicalContext, systemPrompt);
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
        { message: isCSR ? 'Client-Side Rendering Detected (heavy JS, little static text).' : 'Server-Side Rendering Detected.', explanation: hasLlmMessage ? explanation : 'CSR blocks AI scrapers that do not execute JavaScript.', remediation: hasLlmMessage ? remediation : 'Implement SSR or Static Generation.', source: { label: 'Google Search Central – JavaScript SEO basics', url: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics' }, location: `document.body — ${scriptCount} scripts, ${bodyTextLength} text chars` },
        { message: robotsScore > 0 ? `AI crawler allows found in robots.txt (score: ${robotsScore}).` : 'Missing explicit AI allows in robots.txt.', explanation: hasLlmMessage ? explanation : 'AI agents require explicit permission in robots.txt. As of 2026, 16 verified crawlers are documented: GPTBot & OAI-SearchBot (OpenAI), ClaudeBot & Claude-SearchBot (Anthropic), PerplexityBot, Google-Extended, Amazonbot, Applebot-Extended (Apple), meta-externalagent & meta-webindexer (Meta), Bytespider (ByteDance), Diffbot, cohere-ai.', remediation: hasLlmMessage ? remediation : 'Add Allow rules for all major AI crawlers: GPTBot, OAI-SearchBot, ChatGPT-User (OpenAI); ClaudeBot, Claude-SearchBot (Anthropic); PerplexityBot; Google-Extended; Amazonbot; Applebot-Extended (Apple); meta-externalagent, meta-webindexer, meta-externalfetcher, facebookexternalhit (Meta); Bytespider (ByteDance); cohere-ai (Cohere); Diffbot.', source: { label: 'RFC 9309 – Robots Exclusion Protocol', url: 'https://www.rfc-editor.org/rfc/rfc9309' }, location: `${baseUrl}/robots.txt` },
        ...(blocksIndexing ? [{ message: 'Meta robots blocks indexing (noindex/nofollow).', explanation: hasLlmMessage ? explanation : 'A noindex or nofollow meta tag prevents AI engines from indexing the page.', remediation: hasLlmMessage ? remediation : 'Remove noindex/nofollow from meta robots unless intentional.', source: { label: 'Google Search Central – Robots meta tag', url: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag' }, location: '<head> <meta name="robots">' }] : []),
        { message: hasCanonical ? `Canonical URL defined: ${canonicalUrl.slice(0, 80)}` : 'Missing canonical URL.', explanation: hasLlmMessage ? explanation : 'A canonical URL tells AI engines which version of a page is authoritative, preventing duplicate indexing.', remediation: hasLlmMessage ? remediation : 'Add <link rel="canonical" href="..."> pointing to the preferred URL.', source: { label: 'Google Search Central – Canonical URLs', url: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls' }, location: '<head> <link rel="canonical">' },
        { message: hasHreflang ? `Hreflang tags found (${hreflangCount} locale variant${hreflangCount > 1 ? 's' : ''}).` : 'No hreflang tags detected.', explanation: hasLlmMessage ? explanation : 'Hreflang tags signal locale/language variants so AI engines serve the correct version in multilingual results.', remediation: hasLlmMessage ? remediation : 'Add <link rel="alternate" hreflang="xx"> for each language variant.', source: { label: 'Google Search Central – Hreflang', url: 'https://developers.google.com/search/docs/specialty/international/localized-versions' }, location: '<head> <link rel="alternate" hreflang="...">' },
        { message: hasSitemap ? 'XML Sitemap reachable.' : 'XML Sitemap not found at /sitemap.xml.', explanation: hasLlmMessage ? explanation : 'AI crawlers use XML sitemaps to efficiently discover all crawlable content on a site.', remediation: hasLlmMessage ? remediation : 'Create and serve an XML Sitemap at /sitemap.xml with all indexable URLs.', source: { label: 'Sitemaps.org Protocol', url: 'https://www.sitemaps.org/protocol.html' }, location: `${baseUrl}/sitemap.xml` }
      ]
    };
  }
}
