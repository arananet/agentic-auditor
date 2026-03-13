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

  async runAudit(url: string): Promise<AuditResponse> {
    const targetUrl = new URL(url);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.hostname}`;
    
    // Check Cache First
    const cacheKey = `audit:${baseUrl}`;
    const cached = globalCache.get<AuditResponse>(cacheKey);
    if (cached) {
      cached.log.push(`[INFO] Returning cached result for ${baseUrl}`);
      return cached;
    }

    const results: any = {
      overallScore: 0,
      log: [`[OK] INITIALIZING SCAN FOR ${baseUrl}`]
    };

    if (LlmAnalyzer.isConfigured()) {
      results.log.push(`[INFO] Deep Semantic Engine Active (Cloudflare Workers AI - Llama 3.1).`);
      results.log.push(`[INFO] Benefits: Advanced stance analysis, superior intent matching, and nuanced entity recognition.`);
    } else {
      results.log.push(`[WARN] Partial Detection Active: No LLM configured.`);
      results.log.push(`[WARN] Falling back to heuristic density analysis. Add Cloudflare AI credentials to enable deep semantic analysis.`);
    }

    try {
      results.log.push(`[OK] Fetching HTML content...`);
      const pageRes = await fetchWithTimeout(baseUrl, 15000);
      const html = await pageRes.text();
      const $ = cheerio.load(html);

      const context: AuditContext = {
        url,
        baseUrl,
        html,
        $,
        headers: pageRes.headers
      };

      let totalScore = 0;

      // Run all strategies concurrently for performance
      const promises = this.strategies.map(async strategy => {
        try {
          const res = await strategy.execute(context);
          results[strategy.name] = res;
          totalScore += res.score;
          results.log.push(`[OK] Completed ${strategy.name} audit: ${res.score}/100`);
          
          if (res.score < 100) {
            res.details.forEach(detail => {
              // Extract the LLM Analysis explanation or the heuristic explanation
              const feedback = detail.explanation.replace('LLM Analysis: ', '');
              if (feedback) {
                 results.log.push(`   ↳ [FINDING] ${feedback}`);
              }
            });
          }
        } catch (e: any) {
          results.log.push(`[ERROR] ${strategy.name} failed: ${e.message}`);
          results[strategy.name] = { score: 0, status: 'FAILED', details: [{ message: `Audit failed: ${e.message}`, explanation: 'Internal error', remediation: 'Retry later' }] };
        }
      });

      await Promise.all(promises);

      // We have 11 audits, max 1100 points
      results.overallScore = Math.round((totalScore / 1100) * 100);
      results.log.push(`[OK] FINAL SCORE: ${results.overallScore}/100`);
      
      // Save to cache for 1 hour (3600 seconds)
      globalCache.set(cacheKey, results, 3600);

      return results as AuditResponse;
    } catch (error: any) {
      results.log.push(`[FATAL] Scan failed: ${error.message || 'Unknown network error'}`);
      throw new Error(`Audit failed: ${error.message}`);
    }
  }
}
