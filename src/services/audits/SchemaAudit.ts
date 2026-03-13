import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class SchemaAudit implements IAuditStrategy {
  name = 'schema';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    let schemaScore = 0;
    
    const requiredSchemas = ['Person', 'Organization', 'FAQPage', 'Article'];
    
    scripts.forEach(script => {
      try {
        const parsed = JSON.parse(script);
        requiredSchemas.forEach(schema => {
          if (parsed['@type'] === schema || (parsed['@graph'] && parsed['@graph'].some((g: any) => g['@type'] === schema))) {
            schemaScore += 25;
          }
        });
      } catch (e) { }
    });

    let finalScore = Math.min(100, schemaScore);
    let explanation = 'Schema (JSON-LD) acts as an API for AI engines to parse entities.';
    let remediation = 'Add Organization, FAQPage, or Article schema.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the provided JSON-LD schema snippets for Generative Engine Optimization. Check for rich entities like Organization, Person, FAQPage, or Article. Score 100 for robust interconnected schemas, 50 for basic ones, and 0 for invalid/missing schemas. Provide feedback based solely on the schema quality.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(scripts.join('\n').slice(0, 3000) || "No JSON-LD schema found.", systemPrompt);
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
        { message: finalScore > 0 ? 'Structured data active.' : 'No rich schema found.', explanation: hasLlmMessage ? explanation : 'Schema (JSON-LD) acts as an API for AI engines to parse entities.', remediation: hasLlmMessage ? remediation : 'Add Organization, FAQPage, or Article schema.' }
      ]
    };
  }
}
