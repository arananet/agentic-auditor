import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

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
      } catch (e) {
        // malformed JSON
      }
    });

    const totalScore = Math.min(100, schemaScore);

    return {
      score: totalScore,
      status: totalScore >= 75 ? 'READY' : totalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        { message: totalScore > 0 ? 'Structured data active.' : 'No rich schema found.', explanation: 'Schema (JSON-LD) acts as an API for AI engines to parse entities.', remediation: 'Add Organization, FAQPage, or Article schema.' }
      ]
    };
  }
}
