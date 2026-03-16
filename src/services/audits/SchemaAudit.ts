import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class SchemaAudit implements IAuditStrategy {
  name = 'schema';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();

    // 2026 GEO priority schemas
    const prioritySchemas = [
      'Organization', 'Person', 'FAQPage', 'Article', 'Product',
      'BreadcrumbList', 'HowTo', 'WebSite', 'WebPage', 'VideoObject',
      'LocalBusiness', 'Review', 'AggregateRating', 'Event'
    ];
    const foundSchemas = new Set<string>();

    scripts.forEach(script => {
      try {
        const parsed = JSON.parse(script);
        this.extractTypes(parsed, foundSchemas, prioritySchemas);
      } catch (e) { }
    });

    // Also check microdata (itemtype attributes)
    $('[itemtype]').each((_, el) => {
      const itemtype = $(el).attr('itemtype') || '';
      prioritySchemas.forEach(schema => {
        if (itemtype.includes(schema)) foundSchemas.add(schema);
      });
    });

    // Score: up to 100, proportional to how many priority types are found
    const maxScore = 100;
    const perSchema = Math.floor(maxScore / 5); // ~20 points per schema, cap after 5
    let schemaScore = Math.min(maxScore, foundSchemas.size * perSchema);

    let finalScore = schemaScore;
    let explanation = 'Schema (JSON-LD/microdata) acts as structured data APIs for AI engines.';
    let remediation = 'Add Organization, FAQPage, Product, or Article schema.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const schemaContext = `Found ${foundSchemas.size} priority schema types: ${Array.from(foundSchemas).join(', ') || 'None'}. Raw JSON-LD snippets: ${scripts.join('\n').slice(0, 2500) || 'No JSON-LD found.'}`;
      const systemPrompt = `Evaluate the JSON-LD and structured data for GEO 2026 standards. Priority schema types for AI are: Organization, Person, FAQPage, Article, Product, BreadcrumbList, HowTo, WebSite, WebPage, VideoObject, LocalBusiness, Review, AggregateRating, Event. Score 100 for robust interconnected schemas with multiple types. Score 0 for missing or invalid schemas. Provide feedback on schema completeness and quality.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(schemaContext, systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    const foundList = Array.from(foundSchemas);
    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        { message: foundList.length > 0 ? `Structured data found: ${foundList.join(', ')}.` : 'No rich schema found.', explanation: hasLlmMessage ? explanation : 'Schema (JSON-LD) acts as an API for AI engines to parse entities.', remediation: hasLlmMessage ? remediation : 'Add Organization, FAQPage, Product, or Article schema.', source: { label: 'Schema.org / Google Structured Data', url: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data' }, location: `<script type="application/ld+json"> (${scripts.length} block${scripts.length !== 1 ? 's' : ''})` }
      ]
    };
  }

  private extractTypes(obj: any, found: Set<string>, targets: string[]): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(item => this.extractTypes(item, found, targets));
      return;
    }
    const type = obj['@type'];
    if (type) {
      const types = Array.isArray(type) ? type : [type];
      types.forEach(t => { if (targets.includes(t)) found.add(t); });
    }
    if (obj['@graph']) this.extractTypes(obj['@graph'], found, targets);
  }
}
