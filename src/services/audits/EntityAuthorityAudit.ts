import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class EntityAuthorityAudit implements IAuditStrategy {
  name = 'entityAuthority';

  /** Known sameAs domains that seed AI knowledge panels */
  private static readonly SAMEAS_DOMAINS = [
    'wikipedia.org', 'wikidata.org', 'linkedin.com', 'crunchbase.com',
    'twitter.com', 'x.com', 'facebook.com', 'github.com', 'youtube.com',
  ];

  async execute({ $, baseUrl }: AuditContext): Promise<AuditResult> {
    const scripts = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    const parsedSchemas: any[] = [];
    scripts.forEach(s => { try { parsedSchemas.push(JSON.parse(s)); } catch {} });

    // --- 1. sameAs completeness on Organization/Person ---
    const sameAsLinks: string[] = [];
    const orgPersonSchemas: any[] = [];
    this.findSchemasByType(parsedSchemas, ['Organization', 'Person'], orgPersonSchemas);
    let hasSameAs = false;
    const sameAsDomains = new Set<string>();
    orgPersonSchemas.forEach(schema => {
      const links = Array.isArray(schema.sameAs) ? schema.sameAs : schema.sameAs ? [schema.sameAs] : [];
      links.forEach((link: string) => {
        if (typeof link === 'string') {
          sameAsLinks.push(link);
          hasSameAs = true;
          for (const domain of EntityAuthorityAudit.SAMEAS_DOMAINS) {
            if (link.includes(domain)) sameAsDomains.add(domain);
          }
        }
      });
    });

    // --- 2. Wikipedia/Wikidata presence ---
    const hasWikipedia = sameAsDomains.has('wikipedia.org');
    const hasWikidata = sameAsDomains.has('wikidata.org');
    const wikiLinksInContent = $('a[href*="wikipedia.org"], a[href*="wikidata.org"]').length;

    // --- 3. WebSite + SearchAction (Sitelinks Searchbox) ---
    let hasWebSiteSearchAction = false;
    const websiteSchemas: any[] = [];
    this.findSchemasByType(parsedSchemas, ['WebSite'], websiteSchemas);
    websiteSchemas.forEach(schema => {
      const action = schema.potentialAction;
      if (action) {
        const actions = Array.isArray(action) ? action : [action];
        actions.forEach((a: any) => {
          if (a['@type'] === 'SearchAction' && a['target']) {
            const target = typeof a.target === 'string' ? a.target : a.target?.urlTemplate || '';
            if (target.includes('{search_term_string}') || target.includes('{query}')) {
              hasWebSiteSearchAction = true;
            }
          }
        });
      }
    });

    // --- 4. Person schema with jobTitle/knowsAbout/sameAs (author E-E-A-T) ---
    const personSchemas: any[] = [];
    this.findSchemasByType(parsedSchemas, ['Person'], personSchemas);
    let authorSchemaQuality = 0;
    const authorIssues: string[] = [];
    personSchemas.forEach(person => {
      let quality = 0;
      if (person.name) quality += 1;
      if (person.jobTitle) quality += 1;
      if (person.knowsAbout) quality += 1;
      if (person.sameAs) quality += 1;
      if (person.url) quality += 1;
      authorSchemaQuality = Math.max(authorSchemaQuality, quality);
      if (!person.jobTitle) authorIssues.push('Person schema missing jobTitle');
      if (!person.knowsAbout) authorIssues.push('Person schema missing knowsAbout');
      if (!person.sameAs) authorIssues.push('Person schema missing sameAs');
    });

    // --- 5. NAP consistency for LocalBusiness ---
    const localBusinessSchemas: any[] = [];
    this.findSchemasByType(parsedSchemas, ['LocalBusiness'], localBusinessSchemas);
    let napConsistency = true;
    const napIssues: string[] = [];
    localBusinessSchemas.forEach(lb => {
      if (!lb.name) { napConsistency = false; napIssues.push('LocalBusiness missing name'); }
      if (!lb.address) { napConsistency = false; napIssues.push('LocalBusiness missing address'); }
      if (!lb.telephone) { napConsistency = false; napIssues.push('LocalBusiness missing telephone'); }
    });

    // --- Score calculation ---
    let score = 0;
    score += Math.min(30, sameAsDomains.size * 6);
    if (hasWikipedia) score += 12;
    if (hasWikidata) score += 8;
    if (hasWebSiteSearchAction) score += 15;
    else if (websiteSchemas.length > 0) score += 5;
    score += Math.min(20, authorSchemaQuality * 4);
    if (localBusinessSchemas.length > 0) {
      score += napConsistency ? 15 : 5;
    } else {
      score += Math.min(15, sameAsLinks.length * 3);
    }
    if (orgPersonSchemas.length === 0) {
      score = Math.max(0, score - 10);
    }

    let finalScore = Math.min(100, score);
    let explanation = 'Entity authority signals (sameAs, Wikipedia/Wikidata, SearchAction, author identity) seed AI knowledge panels and entity resolution in GPT/Gemini/Perplexity.';
    let remediation = 'Add sameAs links to Organization/Person schema pointing to Wikipedia, Wikidata, LinkedIn, and Crunchbase. Add WebSite schema with SearchAction.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const entityContext = `Organization/Person schemas found: ${orgPersonSchemas.length}. sameAs links: ${sameAsLinks.join(', ') || 'None'}. sameAs domains covered: ${Array.from(sameAsDomains).join(', ') || 'None'}. Wikipedia: ${hasWikipedia}. Wikidata: ${hasWikidata}. Wiki links in content: ${wikiLinksInContent}. WebSite+SearchAction: ${hasWebSiteSearchAction}. Person schemas: ${personSchemas.length}, best quality score: ${authorSchemaQuality}/5. Author issues: ${authorIssues.join('; ') || 'None'}. LocalBusiness: ${localBusinessSchemas.length}, NAP consistent: ${napConsistency}. NAP issues: ${napIssues.join('; ') || 'None'}. JSON-LD: ${scripts.join('\n').slice(0, 2000)}`;
      const systemPrompt = `Evaluate the entity authority and knowledge-panel readiness of this page for GEO/AEO 2026.
Key factors:
1. sameAs property in Organization/Person JSON-LD linking to Wikipedia, Wikidata, LinkedIn, Crunchbase, X — these seed AI knowledge panels and GPT/Gemini entity resolution.
2. Wikipedia/Wikidata presence — the #1 Knowledge-Panel predictor (Ahrefs 2025, seoClarity).
3. WebSite schema with SearchAction (potentialAction with urlTemplate containing {search_term_string}) — powers AEO sitelinks searchbox.
4. Person schema with jobTitle, knowsAbout, sameAs for author E-E-A-T identity.
5. NAP consistency (name/address/phone) for LocalBusiness — required for local knowledge panels.
Score 100 for comprehensive entity signals. Score 0 for no entity markup.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(entityContext, systemPrompt);
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
        {
          message: hasSameAs ? `sameAs links found on ${sameAsDomains.size} domain(s): ${Array.from(sameAsDomains).join(', ')}.` : 'No sameAs links found in Organization/Person schema.',
          explanation: hasLlmMessage ? explanation : 'sameAs links in Organization/Person JSON-LD seed AI knowledge panels and entity resolution in GPT, Gemini, and Perplexity.',
          remediation: hasLlmMessage ? remediation : 'Add sameAs array to Organization schema: ["https://en.wikipedia.org/wiki/Brand", "https://www.wikidata.org/wiki/Q12345", "https://www.linkedin.com/company/brand", "https://www.crunchbase.com/organization/brand"].',
          source: { label: 'Schema.org – sameAs property', url: 'https://schema.org/sameAs' },
          location: 'JSON-LD Organization/Person → sameAs'
        },
        {
          message: hasWikipedia || hasWikidata ? `Wikipedia${hasWikipedia ? ' ✓' : ' ✗'} / Wikidata${hasWikidata ? ' ✓' : ' ✗'} presence detected.` : 'No Wikipedia/Wikidata sameAs links — missing #1 Knowledge-Panel predictor.',
          explanation: hasLlmMessage ? explanation : 'Wikipedia and Wikidata are the #1 predictor of Knowledge Panel generation (Ahrefs 2025). AI systems use these for entity verification and disambiguation.',
          remediation: hasLlmMessage ? remediation : 'Create or claim your Wikipedia page, then add it as sameAs in Organization schema. Add the corresponding Wikidata QID.',
          source: { label: 'Ahrefs (2025) – Knowledge Panel predictors', url: 'https://ahrefs.com/blog/knowledge-panels/' },
          location: 'JSON-LD sameAs → wikipedia.org / wikidata.org'
        },
        {
          message: hasWebSiteSearchAction ? 'WebSite + SearchAction detected — sitelinks searchbox ready.' : websiteSchemas.length > 0 ? 'WebSite schema found but missing SearchAction/urlTemplate.' : 'No WebSite schema with SearchAction found.',
          explanation: hasLlmMessage ? explanation : 'WebSite schema with SearchAction (potentialAction + urlTemplate) powers the AEO sitelinks searchbox and helps AI engines understand your site search capabilities.',
          remediation: hasLlmMessage ? remediation : 'Add WebSite schema: {"@type":"WebSite","url":"https://example.com","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://example.com/search?q={search_term_string}"},"query-input":"required name=search_term_string"}}.',
          source: { label: 'Google – Sitelinks searchbox structured data', url: 'https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox' },
          location: 'JSON-LD WebSite → potentialAction → SearchAction'
        },
        {
          message: personSchemas.length > 0 ? `Person schema found (quality: ${authorSchemaQuality}/5).${authorIssues.length > 0 ? ` Issues: ${authorIssues.slice(0, 2).join('; ')}.` : ' Complete.'}` : 'No Person schema found for author E-E-A-T identity.',
          explanation: hasLlmMessage ? explanation : 'Person schema with jobTitle, knowsAbout, and sameAs establishes structured author identity for E-E-A-T. AI systems use this for trustworthiness assessment.',
          remediation: hasLlmMessage ? remediation : 'Add Person schema: {"@type":"Person","name":"Author Name","jobTitle":"Title","knowsAbout":["Topic1","Topic2"],"sameAs":["https://linkedin.com/in/author","https://twitter.com/author"]}.',
          source: { label: 'Schema.org – Person type', url: 'https://schema.org/Person' },
          location: 'JSON-LD Person → jobTitle / knowsAbout / sameAs'
        },
        ...(localBusinessSchemas.length > 0 ? [{
          message: napConsistency ? 'LocalBusiness NAP (Name/Address/Phone) consistent.' : `LocalBusiness NAP incomplete: ${napIssues.join('; ')}.`,
          explanation: hasLlmMessage ? explanation : 'NAP consistency (name, address, telephone) in LocalBusiness schema is required for local knowledge panels and local AI search results.',
          remediation: hasLlmMessage ? remediation : 'Ensure LocalBusiness schema includes name, address (PostalAddress), and telephone properties.',
          source: { label: 'Schema.org – LocalBusiness', url: 'https://schema.org/LocalBusiness' },
          location: 'JSON-LD LocalBusiness → name / address / telephone'
        }] : [])
      ]
    };
  }

  private findSchemasByType(schemas: any[], types: string[], results: any[]): void {
    for (const schema of schemas) {
      if (!schema || typeof schema !== 'object') continue;
      if (Array.isArray(schema)) {
        this.findSchemasByType(schema, types, results);
        continue;
      }
      const schemaType = schema['@type'];
      if (schemaType) {
        const typeArr = Array.isArray(schemaType) ? schemaType : [schemaType];
        if (typeArr.some(t => types.includes(t))) results.push(schema);
      }
      if (schema['@graph']) this.findSchemasByType(schema['@graph'], types, results);
      for (const key of Object.keys(schema)) {
        if (key.startsWith('@')) continue;
        const val = schema[key];
        if (val && typeof val === 'object') {
          this.findSchemasByType(Array.isArray(val) ? val : [val], types, results);
        }
      }
    }
  }
}
