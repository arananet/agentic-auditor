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
import { fetchWithTimeout } from './fetchWithTimeout';
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
    new SentimentAudit()
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
      const $ = cheerio.load(html);

      const context: AuditContext = {
        url,
        baseUrl,
        html,
        $
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

      // We have 11 audits, max 1100 points
      results.overallScore = Math.round((totalScore / 1100) * 100);
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
}
