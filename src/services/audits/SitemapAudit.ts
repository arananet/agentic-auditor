import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';
import { fetchTextFile } from '../fetchWithTimeout';

/**
 * SitemapAudit — Evaluates XML sitemap quality for AI crawler optimization.
 *
 * Based on AISEO research (2025-2026): AI crawlers (GPTBot, PerplexityBot,
 * Google-Extended) rely on sitemaps 3.4x more than link-based discovery.
 * Sites with AI-optimized sitemaps appear in ChatGPT responses 2.3x more frequently.
 *
 * Checks:
 *   1. Sitemap exists and is valid XML                    (15 pts)
 *   2. Priority values vary (not all 0.5 / all 1.0)      (15 pts)
 *   3. <lastmod> timestamps present and recent            (15 pts)
 *   4. <changefreq> present                               (10 pts)
 *   5. URL count reasonable (≤1000 per sitemap)           (10 pts)
 *   6. Image sitemap extensions                           (10 pts)
 *   7. Sitemap referenced in robots.txt                   (10 pts)
 *   8. Sitemap index for large sites                      (10 pts)
 *   9. AI crawler-specific robots.txt signals             (5 pts)
 *
 * Does NOT crawl subpages — only fetches /sitemap.xml and /robots.txt.
 */
export class SitemapAudit implements IAuditStrategy {
  name = 'sitemap';

  async execute({ baseUrl }: AuditContext): Promise<AuditResult> {
    let score = 0;
    const findings: string[] = [];
    let sitemapRaw = '';
    let robotsRaw = '';
    let isSitemapIndex = false;
    let urlCount = 0;
    let childSitemapCount = 0;

    // ── 1. Fetch sitemap.xml ─────────────────────────────
    try {
      sitemapRaw = await fetchTextFile(`${baseUrl}/sitemap.xml`, 10000);
    } catch (e) {
      // try sitemap_index.xml (WordPress/Yoast default)
      try {
        sitemapRaw = await fetchTextFile(`${baseUrl}/sitemap_index.xml`, 10000);
      } catch (e2) {}
    }

    const hasSitemap = sitemapRaw.length > 50 && (/<urlset/i.test(sitemapRaw) || /<sitemapindex/i.test(sitemapRaw));
    isSitemapIndex = /<sitemapindex/i.test(sitemapRaw);

    if (!hasSitemap) {
      // No sitemap at all — score 0
      return this.buildResult(0, findings, baseUrl, sitemapRaw, robotsRaw);
    }

    score += 15;
    findings.push('Valid XML sitemap found.');

    // ── 2. Priority value analysis ───────────────────────
    const priorities = Array.from(sitemapRaw.matchAll(/<priority>([\d.]+)<\/priority>/gi))
      .map(m => parseFloat(m[1]));

    if (priorities.length > 0) {
      const uniquePriorities = new Set(priorities.map(p => p.toFixed(1)));
      if (uniquePriorities.size >= 3) {
        score += 15;
        findings.push(`Priority hierarchy found: ${uniquePriorities.size} distinct values (${Array.from(uniquePriorities).sort().join(', ')}).`);
      } else if (uniquePriorities.size === 2) {
        score += 8;
        findings.push(`Partial priority hierarchy: only ${uniquePriorities.size} distinct values. AI crawlers benefit from 3+ levels.`);
      } else {
        score += 3;
        findings.push(`Flat priority values: all URLs set to ${priorities[0]}. GPTBot uses priority as training dataset inclusion signal.`);
      }
    } else if (!isSitemapIndex) {
      findings.push('No <priority> values found. AI crawlers use priority to determine training dataset inclusion (+41% citation probability).'); 
    }

    // ── 3. lastmod timestamps ────────────────────────────
    const lastmods = Array.from(sitemapRaw.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi))
      .map(m => m[1].trim());

    if (lastmods.length > 0) {
      const now = Date.now();
      const recentCount = lastmods.filter(d => {
        const ts = Date.parse(d);
        return !isNaN(ts) && (now - ts) < 90 * 24 * 60 * 60 * 1000; // within 90 days
      }).length;

      const allSame = new Set(lastmods).size === 1 && lastmods.length > 5;

      if (allSame) {
        score += 5;
        findings.push(`All <lastmod> timestamps are identical (${lastmods[0]}) — likely static, not reflecting actual content updates.`);
      } else if (recentCount > 0) {
        score += 15;
        findings.push(`Dynamic <lastmod> timestamps: ${recentCount}/${lastmods.length} updated within 90 days.`);
      } else {
        score += 8;
        findings.push('All <lastmod> timestamps are older than 90 days — stale signals reduce AI crawl frequency.');
      }
    } else if (!isSitemapIndex) {
      findings.push('No <lastmod> timestamps. Sites with accurate lastmod see 41% faster AI content recognition (12 vs 21 days).');
    }

    // ── 4. changefreq ────────────────────────────────────
    const changefreqs = Array.from(sitemapRaw.matchAll(/<changefreq>([^<]+)<\/changefreq>/gi))
      .map(m => m[1].trim().toLowerCase());

    if (changefreqs.length > 0) {
      const uniqueFreqs = new Set(changefreqs);
      const allSameFreq = uniqueFreqs.size === 1 && changefreqs.length > 5;

      if (allSameFreq && (changefreqs[0] === 'daily' || changefreqs[0] === 'always')) {
        score += 3;
        findings.push(`All URLs set to changefreq="${changefreqs[0]}" — signals instability, may trigger AI crawl rate limiting.`);
      } else if (uniqueFreqs.size >= 2) {
        score += 10;
        findings.push(`Smart changefreq distribution: ${Array.from(uniqueFreqs).join(', ')}.`);
      } else {
        score += 5;
        findings.push(`Uniform changefreq="${changefreqs[0]}". Varying by content type improves AI recrawl scheduling.`);
      }
    } else if (!isSitemapIndex) {
      findings.push('No <changefreq> values. AI crawlers use changefreq to optimize recrawl scheduling.');
    }

    // ── 5. URL count ─────────────────────────────────────
    urlCount = (sitemapRaw.match(/<url>/gi) || []).length;
    childSitemapCount = (sitemapRaw.match(/<sitemap>/gi) || []).length;

    if (isSitemapIndex) {
      score += 10;
      findings.push(`Sitemap index found with ${childSitemapCount} child sitemap(s) — topical segmentation improves AI crawl efficiency.`);
    } else if (urlCount > 0 && urlCount <= 1000) {
      score += 10;
      findings.push(`URL count: ${urlCount} (within optimal ≤1,000 per sitemap).`);
    } else if (urlCount > 1000) {
      score += 4;
      findings.push(`URL count: ${urlCount} — oversized. Split into topical sub-sitemaps (optimal: ≤1,000 per sitemap).`);
    }

    // ── 6. Image sitemap extensions ──────────────────────
    const hasImageNs = /image:image|xmlns:image/i.test(sitemapRaw);
    if (hasImageNs) {
      score += 10;
      findings.push('Image sitemap extensions found — enables multimodal AI platforms (GPT-4V, Gemini Vision) to discover visual assets.');
    } else {
      findings.push('No image sitemap extensions. Multimodal AI platforms rely on image sitemaps for visual asset discovery.');
    }

    // ── 7. robots.txt sitemap reference ──────────────────
    try {
      robotsRaw = await fetchTextFile(`${baseUrl}/robots.txt`, 10000);
    } catch (e) {}

    const sitemapInRobots = /^Sitemap:\s*https?:\/\//im.test(robotsRaw);
    if (sitemapInRobots) {
      score += 10;
      findings.push('Sitemap referenced in robots.txt.');
    } else if (robotsRaw.length > 0) {
      findings.push('Sitemap NOT referenced in robots.txt. Add "Sitemap: <url>" for AI crawler discovery.');
    } else {
      findings.push('robots.txt not reachable — cannot verify sitemap reference.');
    }

    // ── 8. Sitemap index bonus (for non-index sitemaps with large URL count) ──
    if (!isSitemapIndex && urlCount > 500) {
      findings.push(`Large sitemap (${urlCount} URLs) without sitemap index. Segmented sitemaps improve AI crawl efficiency by 65%.`);
    } else if (isSitemapIndex) {
      // Already scored in step 5
    } else if (urlCount <= 500) {
      score += 10; // small site, index not needed
    }

    // ── 9. AI-specific crawler signals in robots.txt ─────
    if (robotsRaw.length > 0) {
      const aiCrawlers = ['gptbot', 'perplexitybot', 'google-extended', 'claudebot', 'amazonbot'];
      const mentionedCrawlers = aiCrawlers.filter(c => robotsRaw.toLowerCase().includes(c));
      if (mentionedCrawlers.length >= 2) {
        score += 5;
        findings.push(`AI crawler rules in robots.txt: ${mentionedCrawlers.join(', ')}. Explicit allow/crawl-delay signals improve AI crawl scheduling.`);
      } else if (mentionedCrawlers.length === 1) {
        score += 2;
        findings.push(`Only 1 AI crawler mentioned in robots.txt (${mentionedCrawlers[0]}). Add rules for GPTBot, PerplexityBot, Google-Extended, ClaudeBot, Amazonbot.`);
      } else {
        findings.push('No AI-specific crawler rules in robots.txt. Add User-agent + Allow rules for GPTBot, PerplexityBot, Google-Extended, ClaudeBot.');
      }
    }

    score = Math.min(100, score);

    return this.buildResult(score, findings, baseUrl, sitemapRaw, robotsRaw);
  }

  private async buildResult(
    heuristicScore: number,
    findings: string[],
    baseUrl: string,
    sitemapRaw: string,
    robotsRaw: string
  ): Promise<AuditResult> {
    let finalScore = heuristicScore;
    let explanation = 'AI crawlers (GPTBot, PerplexityBot, Google-Extended) rely on sitemaps 3.4x more than link-based discovery. Sites with AI-optimized sitemaps appear in ChatGPT responses 2.3x more frequently.';
    let remediation = 'Create an XML sitemap with dynamic priority hierarchy (0.1–1.0), accurate <lastmod> timestamps, smart <changefreq> values, and reference it in robots.txt. For 500+ URL sites, use a sitemap index with topical segmentation.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured() && (sitemapRaw.length > 0 || robotsRaw.length > 0)) {
      const sitemapContext = `Sitemap (${sitemapRaw.length} chars, first 2000): ${sitemapRaw.slice(0, 2000)}. Robots.txt sitemap reference: ${/^Sitemap:/im.test(robotsRaw) ? 'YES' : 'NO'}. Heuristic findings: ${findings.join(' ')}`;
      const systemPrompt = `Evaluate this XML sitemap for AI crawler optimization (GEO 2026). Key AI-specific signals: 1) Priority hierarchy with 3+ distinct values (GPTBot uses priority for training dataset inclusion). 2) Dynamic <lastmod> timestamps that reflect actual content updates (not static dates). 3) <changefreq> that varies by content type. 4) URL count ≤1000 per sitemap or use sitemap index. 5) Image sitemap extensions for multimodal AI. 6) Sitemap reference in robots.txt. 7) AI crawler-specific robots.txt rules. Score 100 for fully AI-optimized sitemap with all signals. Score 0 if sitemap is missing.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(sitemapContext, systemPrompt);
      if (llmResult) {
        finalScore = Math.round((heuristicScore * 0.3) + (llmResult.score * 0.7));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    const hasSitemap = sitemapRaw.length > 50;

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        {
          message: hasSitemap ? 'XML sitemap found and parseable.' : 'No XML sitemap found at /sitemap.xml or /sitemap_index.xml.',
          explanation: hasLlmMessage ? explanation : 'AI crawlers reference sitemaps in 76% of initial domain discovery visits. GPTBot crawls sitemap-listed URLs 3.4x more frequently.',
          remediation: hasLlmMessage ? remediation : 'Create and serve /sitemap.xml with all indexable URLs. Use a sitemap index for 500+ URL sites.',
          source: { label: 'Sitemaps.org Protocol', url: 'https://www.sitemaps.org/protocol.html' },
          location: `${baseUrl}/sitemap.xml`
        },
        {
          message: findings.length > 0 ? findings.join(' ') : 'No sitemap to analyze.',
          explanation: hasLlmMessage ? explanation : 'AI-optimized sitemaps require: varied priority values (0.1–1.0), dynamic lastmod, smart changefreq, image extensions, and robots.txt reference.',
          remediation: hasLlmMessage ? remediation : remediation,
          source: { label: 'AISEO – XML Sitemap Optimization for AI Crawlers', url: 'https://aiseo.com.mx/en/xml-sitemap-optimization-for-ai-crawlers-complete-guide/' },
          location: `${baseUrl}/sitemap.xml`
        }
      ]
    };
  }
}
