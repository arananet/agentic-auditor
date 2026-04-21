import * as cheerio from 'cheerio';
import { AuditResponse, AuditResult } from '../types';
import { IAuditStrategy, AuditContext } from './audits/IAuditStrategy';
import { CitabilityAudit } from './audits/CitabilityAudit';
import { TechnicalAudit } from './audits/TechnicalAudit';
import { SchemaAudit } from './audits/SchemaAudit';
import { A2aAudit } from './audits/A2aAudit';
import { BrandMentionsAudit } from './audits/BrandMentionsAudit';
import { ContentQualityAudit } from './audits/ContentQualityAudit';
import { IntentMatchAudit } from './audits/IntentMatchAudit';
import { StructuralAudit } from './audits/StructuralAudit';
import { SemanticAudit } from './audits/SemanticAudit';
import { MediaAudit } from './audits/MediaAudit';
import { SentimentAudit } from './audits/SentimentAudit';
import { EntityAuthorityAudit } from './audits/EntityAuthorityAudit';
import { PaaAudit } from './audits/PaaAudit';
import { SitemapAudit } from './audits/SitemapAudit';
import { fetchWithTimeout, isBotBlockPage, detectWafVendor, solveWafChallenge } from './fetchWithTimeout';
import { globalCache } from './CacheManager';
import { LlmAnalyzer, swarmStats } from './LlmAnalyzer';
import { runOracle } from './OracleValidator';

export class AuditorService {
  private strategies: IAuditStrategy[] = [
    new CitabilityAudit(),
    new TechnicalAudit(),
    new SchemaAudit(),
    new A2aAudit(),
    new BrandMentionsAudit(),
    new ContentQualityAudit(),
    new IntentMatchAudit(),
    new StructuralAudit(),
    new SemanticAudit(),
    new MediaAudit(),
    new SentimentAudit(),
    new EntityAuthorityAudit(),
    new PaaAudit(),
    new SitemapAudit()
  ];

  async runAudit(
    url: string,
    onLog?: (msg: string) => void,
    onScreenshot?: (key: 'initial' | 'final', data: string) => void
  ): Promise<AuditResponse> {
    const targetUrl = new URL(url);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.hostname}`;
    
    // Cache key uses the full URL so different paths get separate audits
    const cacheKey = `audit:${url}`;
    const cached = globalCache.get<AuditResponse>(cacheKey);
    if (cached) {
      const cacheMsg = `[INFO] Returning cached result for ${url}`;
      cached.log.push(cacheMsg);
      onLog?.(cacheMsg);
      // Replay the cached log so the caller's live buffer receives all lines
      cached.log.forEach(msg => onLog?.(msg));
      return cached;
    }

    const results: Partial<AuditResponse> & { overallScore: number; log: string[] } = {
      overallScore: 0,
      log: []
    };

    // Unified emit: appends to results.log AND forwards to the live callback
    const emit = (msg: string) => {
      results.log.push(msg);
      onLog?.(msg);
    };

    emit(`[OK] INITIALIZING SCAN FOR ${url}`);

    if (LlmAnalyzer.isConfigured()) {
      emit(`[INFO] Deep Semantic Engine Active (Cloudflare Workers AI - Llama 3.1).`);
      emit(`[INFO] Agent Swarm: ${this.strategies.length} parallel agents — all LLM calls fire simultaneously.`);
      emit(`[INFO] Benefits: Advanced stance analysis, superior intent matching, and nuanced entity recognition.`);
    } else {
      emit(`[WARN] Partial Detection Active: No LLM configured.`);
      emit(`[WARN] Falling back to heuristic density analysis. Add Cloudflare AI credentials to enable deep semantic analysis.`);
    }

    try {
      emit(`[OK] Fetching HTML content from ${url}...`);
      const fetchResult = await fetchWithTimeout(url, 30000);
      let html = fetchResult.html;
      let screenshot = fetchResult.screenshot;
      const initialScreenshot = fetchResult.initialScreenshot;
      emit(`[OK] HTML fetched (${(html.length / 1024).toFixed(1)} KB).`);

      // Send initial screenshot immediately so the UI can show what the browser first saw
      if (initialScreenshot) {
        (results as any).screenshotInitial = initialScreenshot;
        onScreenshot?.('initial', initialScreenshot);
        emit(`[INFO] 📸 Initial page capture taken.`);
      }

      // ── WAF / bot-block detection ────────────────────────────────────
      const wafVendor = detectWafVendor(html);

      if (wafVendor !== 'none') {
        emit(`[WARN] ⚠ ${wafVendor} challenge detected — attempting WAF solver (headless=new + stealth)...`);
        const solvedResult = await solveWafChallenge(url, wafVendor, emit);

        if (solvedResult) {
          html = solvedResult.html;
          screenshot = solvedResult.screenshot;
          emit(`[OK] WAF challenge bypassed! Proceeding with full audit.`);
        } else {
          emit(`[FAIL] WAF solver could not bypass ${wafVendor}. Falling back to partial infrastructure audit.`);
          return this.handleBlockedSite(url, baseUrl, html, wafVendor, results, emit);
        }
      }

      // Attach final screenshot — the page actually being audited
      if (screenshot) {
        (results as any).screenshotFinal = screenshot;
        onScreenshot?.('final', screenshot);
        emit(`[INFO] 📸 Final page capture taken (audited content).`);
      }

      emit(`[OK] Starting ${this.strategies.length} parallel audits...`);

      const $ = cheerio.load(html);

      // Detect page language from <html lang>, <meta> Content-Language, or content heuristics
      const language = this.detectLanguage($, html);
      emit(`[INFO] Detected page language: ${language}. Note: geo-redirected sites may serve a different locale depending on the server's IP location.`);

      const context: AuditContext = {
        url,
        baseUrl,
        html,
        $,
        language
      };

      let totalScore = 0;
      const t0 = Date.now();

      // Run all strategies concurrently for performance
      const promises = this.strategies.map(async strategy => {
        const tStart = Date.now() - t0;
        emit(`[SCAN] ⟳ Running ${strategy.name}... (t+${(tStart / 1000).toFixed(1)}s)`);
        try {
          const res = await strategy.execute(context);
          const tEnd = Date.now() - t0;
          Object.assign(results, { [strategy.name]: res });
          totalScore += res.score;
          const icon = res.score >= 75 ? '✓' : res.score >= 40 ? '⚠' : '✗';
          emit(`[${res.score >= 75 ? 'OK' : res.score >= 40 ? 'WARN' : 'FAIL'}] ${icon} ${strategy.name}: ${res.score}/100 (${((tEnd - tStart) / 1000).toFixed(1)}s @ t+${(tEnd / 1000).toFixed(1)}s)`);
          
          if (res.score < 100) {
            res.details.forEach(detail => {
              const loc = detail.location ? `  [${detail.location}]` : '';
              emit(`   ↳ ${detail.message}${loc}`);
            });
          }
        } catch (e: any) {
          emit(`[ERROR] ${strategy.name} failed: ${e.message}`);
          Object.assign(results, { [strategy.name]: { score: 0, status: 'FAILED' as const, details: [{ message: `Audit failed: ${e.message}`, explanation: 'Internal error', remediation: 'Retry later' }] } });
        }
      });

      await Promise.all(promises);

      // ── Oracle Governance: cross-validate all agent outputs ──────────
      const bodyText = $.root().text() || '';
      const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
      const verdicts = runOracle(results, { botBlocked: false, htmlBytes: html.length, wordCount }, emit);

      // Apply oracle adjustments
      let scoreAdjustment = 0;
      for (const v of verdicts) {
        const res = (results as any)[v.key] as AuditResult | undefined;
        if (!res) continue;
        res.confidence = v.confidence;
        res.oracleFlags = v.flags;
        if (v.adjustedScore !== undefined && v.adjustedScore !== res.score) {
          scoreAdjustment += v.adjustedScore - res.score;
          totalScore += v.adjustedScore - res.score;
          res.score = v.adjustedScore;
        }
      }
      if (scoreAdjustment !== 0) {
        emit(`[ORACLE] Score adjustment: ${scoreAdjustment > 0 ? '+' : ''}${scoreAdjustment} points across overridden agents.`);
      }

      const totalMs = Date.now() - t0;
      // We have 14 audits, max 1400 points
      results.overallScore = Math.round((totalScore / 1400) * 100);
      emit(`[OK] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      emit(`[OK] FINAL GEO SCORE: ${results.overallScore}/100 (14 audits in ${(totalMs / 1000).toFixed(1)}s)`);
      if (LlmAnalyzer.isConfigured()) {
        const finalStats = swarmStats();
        emit(`[INFO] Swarm peak: ${finalStats.peakConcurrent} concurrent LLM calls.`);
      }
      
      // Save to cache for 1 hour (3600 seconds)
      globalCache.set(cacheKey, results, 3600);

      return results as AuditResponse;
    } catch (error: any) {
      emit(`[FATAL] Scan failed: ${error.message || 'Unknown network error'}`);
      throw new Error(`Audit failed: ${error.message}`);
    }
  }

  /**
   * Detect page language from <html lang>, <meta http-equiv="Content-Language">,
   * og:locale, or a simple content-frequency heuristic. Returns ISO 639-1 code.
   */
  private detectLanguage($: cheerio.CheerioAPI, html: string): string {
    // 1. Regex on raw HTML — most reliable, avoids Cheerio stripping <html> attributes
    const rawLangMatch = html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);
    if (rawLangMatch) return rawLangMatch[1].trim().toLowerCase().split('-')[0];

    // 2. Cheerio fallback: $('html').attr('lang') or first [lang] element
    const htmlLang = ($('html').attr('lang') || $('[lang]').first().attr('lang') || '').trim().toLowerCase();
    if (htmlLang) return htmlLang.split('-')[0];

    // 3. <meta http-equiv="Content-Language" content="pt-BR">
    const metaLang = ($('meta[http-equiv="Content-Language"]').attr('content') || '').trim().toLowerCase();
    if (metaLang) return metaLang.split('-')[0];

    // 4. <meta property="og:locale" content="pt_BR">
    const ogLocale = ($('meta[property="og:locale"]').attr('content') || '').trim().toLowerCase();
    if (ogLocale) return ogLocale.split('_')[0];

    // 5. <meta name="language" content="pt">
    const metaLang2 = ($('meta[name="language"]').attr('content') || '').trim().toLowerCase();
    if (metaLang2) return metaLang2.split('-')[0];

    // 6. Content heuristic — language-exclusive stop-words (avoid shared words like "para", "entre")
    const text = $('body').text().toLowerCase().slice(0, 5000);
    const langPatterns: [string, RegExp][] = [
      ['pt', /\b(você|não|também|são|nosso|mais|muito|ainda|desde|já|pode|está|fazer|depois)\b/g],
      ['es', /\b(también|más|nuestro|puede|está|hacer|después|donde|pero|ahora|muy|otro|tiene)\b/g],
      ['fr', /\b(vous|nous|avec|dans|pour|aussi|depuis|cette|mais|sont|peut|fait|après|très)\b/g],
      ['de', /\b(nicht|auch|sich|eine|haben|werden|diese|können|nach|über|noch|schon|sehr)\b/g],
      ['it', /\b(anche|sono|questa|nostro|tutti|dopo|può|ancora|molto|però|come|hanno|fatto)\b/g],
    ];
    let bestLang = 'en';
    let bestCount = 0;
    for (const [lang, pattern] of langPatterns) {
      const count = (text.match(pattern) || []).length;
      if (count > bestCount) { bestCount = count; bestLang = lang; }
    }
    return bestCount >= 5 ? bestLang : 'en';
  }

  /**
   * Short-circuit for WAF/bot-blocked sites.
   * Only runs infrastructure audits that fetch their own resources (a2a, technical, sitemap).
   * Content-analyzing agents are skipped entirely — no point analyzing a CAPTCHA page.
   */
  private async handleBlockedSite(
    url: string,
    baseUrl: string,
    html: string,
    wafVendor: string,
    results: Partial<AuditResponse> & { overallScore: number; log: string[] },
    emit: (msg: string) => void
  ): Promise<AuditResponse> {
    const vendorLabels: Record<string, string> = {
      'cloudflare-turnstile': 'Cloudflare Turnstile (interactive CAPTCHA — unsolvable by automated browsers)',
      'cloudflare': 'Cloudflare JS Challenge',
      'imperva': 'Imperva/Incapsula WAF',
      'datadome': 'DataDome Bot Protection',
      'akamai': 'Akamai Bot Manager',
      'generic': 'Unknown WAF/Bot Protection',
    };

    emit(`[FAIL] ✗ ${vendorLabels[wafVendor] || 'WAF'} detected — the site returned a challenge page, not real content.`);
    emit(`[FAIL] ✗ Aborting content audits — analyzing a CAPTCHA page would produce meaningless results.`);

    if (wafVendor === 'cloudflare-turnstile') {
      emit(`[INFO] Cloudflare Turnstile requires real human interaction. No automated browser can bypass it.`);
      emit(`[INFO] Suggestions: (1) Scan a non-protected subdomain, (2) whitelist the auditor IP in Cloudflare, (3) disable "Under Attack" mode temporarily.`);
    } else if (wafVendor === 'imperva') {
      emit(`[INFO] Imperva/Incapsula advanced challenge detected.`);
      emit(`[INFO] Suggestions: (1) Whitelist the auditor IP in Imperva, (2) scan from an internal network, (3) try a different subdomain.`);
    } else {
      emit(`[INFO] Suggestions: (1) Whitelist the auditor IP, (2) try a different subdomain or URL path.`);
    }

    // ── Infrastructure audits that fetch their own resources ────────────
    const infraStrategies = this.strategies.filter(s =>
      ['a2a', 'technical', 'sitemap'].includes(s.name)
    );
    const skippedStrategies = this.strategies.filter(s =>
      !['a2a', 'technical', 'sitemap'].includes(s.name)
    );

    emit(`[INFO] ━━━ Running ${infraStrategies.length} infrastructure audits (independent of page HTML) ━━━`);

    const $ = cheerio.load(html);
    const context: AuditContext = { url, baseUrl, html, $, language: 'en' };
    const t0 = Date.now();
    let totalScore = 0;

    const promises = infraStrategies.map(async strategy => {
      const tStart = Date.now() - t0;
      emit(`[SCAN] ⟳ Running ${strategy.name}... (t+${(tStart / 1000).toFixed(1)}s)`);
      try {
        const res = await strategy.execute(context);
        const tEnd = Date.now() - t0;
        Object.assign(results, { [strategy.name]: res });
        totalScore += res.score;
        const icon = res.score >= 75 ? '✓' : res.score >= 40 ? '⚠' : '✗';
        emit(`[${res.score >= 75 ? 'OK' : res.score >= 40 ? 'WARN' : 'FAIL'}] ${icon} ${strategy.name}: ${res.score}/100 (${((tEnd - tStart) / 1000).toFixed(1)}s @ t+${(tEnd / 1000).toFixed(1)}s)`);
        if (res.score < 100) {
          res.details.forEach(detail => {
            const loc = detail.location ? `  [${detail.location}]` : '';
            emit(`   ↳ ${detail.message}${loc}`);
          });
        }
      } catch (e: any) {
        emit(`[ERROR] ${strategy.name} failed: ${e.message}`);
        Object.assign(results, { [strategy.name]: { score: 0, status: 'FAILED' as const, details: [{ message: `Audit failed: ${e.message}`, explanation: 'Internal error', remediation: 'Retry later' }] } });
      }
    });

    await Promise.all(promises);

    // ── Mark skipped audits with BLOCKED status ────────────────────────
    const blockedResult: AuditResult = {
      score: 0,
      status: 'FAILED',
      details: [{
        message: `Skipped — site is behind ${vendorLabels[wafVendor] || 'WAF'}.`,
        explanation: `This audit was not executed because the site returned a ${wafVendor} challenge page instead of real HTML content. Running content analysis against a CAPTCHA page would produce meaningless results.`,
        remediation: 'Whitelist the auditor IP in your WAF configuration, disable "Under Attack" mode temporarily, or try scanning a non-protected subdomain.',
      }],
      confidence: 'low',
      oracleFlags: [`Blocked by ${wafVendor} — audit skipped.`],
    };

    for (const strategy of skippedStrategies) {
      Object.assign(results, { [strategy.name]: blockedResult });
      emit(`[SKIP] ⊘ ${strategy.name}: skipped (WAF-blocked page)`);
    }

    const totalMs = Date.now() - t0;
    results.overallScore = Math.round((totalScore / 1400) * 100);
    emit(`[OK] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    emit(`[WARN] PARTIAL GEO SCORE: ${results.overallScore}/100 (${infraStrategies.length} of 14 audits — site blocked by ${wafVendor})`);
    emit(`[INFO] Only infrastructure audits (a2a, technical, sitemap) produced real results. Content audits were skipped.`);

    globalCache.set(`audit:${url}`, results, 3600);
    return results as AuditResponse;
  }
}
