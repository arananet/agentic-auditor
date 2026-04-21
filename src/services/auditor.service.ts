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
import { fetchWithTimeout, isBotBlockPage } from './fetchWithTimeout';
import { globalCache } from './CacheManager';
import { LlmAnalyzer } from './LlmAnalyzer';

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
    new PaaAudit()
  ];

  async runAudit(url: string, onLog?: (msg: string) => void): Promise<AuditResponse> {
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
      emit(`[INFO] Benefits: Advanced stance analysis, superior intent matching, and nuanced entity recognition.`);
    } else {
      emit(`[WARN] Partial Detection Active: No LLM configured.`);
      emit(`[WARN] Falling back to heuristic density analysis. Add Cloudflare AI credentials to enable deep semantic analysis.`);
    }

    try {
      emit(`[OK] Fetching HTML content from ${url}...`);
      const html = await fetchWithTimeout(url, 30000);
      emit(`[OK] HTML fetched (${(html.length / 1024).toFixed(1)} KB). Starting ${this.strategies.length} parallel audits...`);

      // Warn if we received a WAF challenge page instead of real content
      if (isBotBlockPage(html)) {
        emit(`[WARN] ⚠ Bot protection detected (Imperva/Cloudflare/WAF). The site may have returned a challenge page instead of real content.`);
        emit(`[WARN] ⚠ Audit results below may be inaccurate — scores will reflect the block page, not the actual site.`);
      }

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

      // Run all strategies concurrently for performance
      const promises = this.strategies.map(async strategy => {
        emit(`[SCAN] ⟳ Running ${strategy.name}...`);
        try {
          const res = await strategy.execute(context);
          Object.assign(results, { [strategy.name]: res });
          totalScore += res.score;
          const icon = res.score >= 75 ? '✓' : res.score >= 40 ? '⚠' : '✗';
          emit(`[${res.score >= 75 ? 'OK' : res.score >= 40 ? 'WARN' : 'FAIL'}] ${icon} ${strategy.name}: ${res.score}/100`);
          
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

      // We have 13 audits, max 1300 points
      results.overallScore = Math.round((totalScore / 1300) * 100);
      emit(`[OK] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      emit(`[OK] FINAL GEO SCORE: ${results.overallScore}/100`);
      
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
}
