import * as cheerio from 'cheerio';
import { AuditResponse, AuditResult } from '../types';

export class AuditorService {
  async runAudit(url: string): Promise<AuditResponse> {
    const targetUrl = new URL(url);
    const baseUrl = `${targetUrl.protocol}//${targetUrl.hostname}`;
    
    const results: AuditResponse = {
      overallScore: 0,
      citability: { score: 0, status: 'WAITING', details: [] },
      technical: { score: 0, status: 'WAITING', details: [] },
      schema: { score: 0, status: 'WAITING', details: [] },
      a2a: { score: 0, status: 'WAITING', details: [] },
      brandMentions: { score: 0, status: 'WAITING', details: [] },
      contentQuality: { score: 0, status: 'WAITING', details: [] },
      intentMatch: { score: 0, status: 'WAITING', details: [] },
      structural: { score: 0, status: 'WAITING', details: [] },
      semantic: { score: 0, status: 'WAITING', details: [] },
      media: { score: 0, status: 'WAITING', details: [] },
      sentiment: { score: 0, status: 'WAITING', details: [] },
      log: [`[OK] INITIALIZING DEEP SPECTRUM SCAN FOR ${baseUrl}`]
    };

    try {
      const pageRes = await fetch(baseUrl);
      const html = await pageRes.text();
      const $ = cheerio.load(html);

      // 1. AI CITABILITY (geo-citability)
      const paragraphs = $('p').map((_, el) => $(el).text()).get();
      const hasAnswerBlocks = paragraphs.some(p => p.length > 50 && p.length < 300 && /(is|are|was|were|means|refers to)/i.test(p));
      const hasStats = paragraphs.some(p => /\d+(%| percent|k|m|b)/i.test(p));
      
      results.citability = {
        score: (hasAnswerBlocks ? 60 : 0) + (hasStats ? 40 : 0),
        status: hasAnswerBlocks ? 'READY' : 'WARN',
        details: [
          hasAnswerBlocks ? 'High fact-density blocks found suitable for LLM extraction.' : 'Content too verbose or lacks clear definitional statements.',
          hasStats ? 'Statistical density detected, improving authoritative signals.' : 'No statistics or strong data points detected.'
        ]
      };

      // 2. TECHNICAL (geo-crawlers)
      const robotsText = await fetch(`${baseUrl}/robots.txt`).then(r => r.text()).catch(() => '');
      const hasAIAllow = /(GPTBot|PerplexityBot|ClaudeBot|Anthropic)/i.test(robotsText);
      const isClientSideRendered = html.includes('id="root"') && $('p').length < 3; // Simple heuristic

      results.technical = {
        score: (robotsText ? 30 : 0) + (hasAIAllow ? 40 : 0) + (!isClientSideRendered ? 30 : 0),
        status: hasAIAllow && !isClientSideRendered ? 'READY' : 'WARN',
        details: [
          hasAIAllow ? 'AI Crawlers explicitly addressed in robots.txt.' : 'Generic robots.txt detected, missing specific AI crawler directives.',
          !isClientSideRendered ? 'Content is server-side rendered or statically generated.' : 'Potential client-side rendering issue; AI bots might struggle to parse content.'
        ]
      };

      // 3. SEMANTIC SCHEMA (geo-schema)
      const schemas = $('script[type="application/ld+json"]');
      let hasIdentity = false;
      let hasFAQ = false;
      schemas.each((_, el) => {
        const content = $(el).html() || '';
        if (content.includes('Person') || content.includes('Organization')) hasIdentity = true;
        if (content.includes('FAQPage')) hasFAQ = true;
      });

      results.schema = {
        score: (schemas.length > 0 ? 30 : 0) + (hasIdentity ? 40 : 0) + (hasFAQ ? 30 : 0),
        status: hasIdentity ? 'READY' : 'WARN',
        details: [
          hasIdentity ? 'Identity schema (Person/Organization) detected, building deterministic trust.' : 'Schema present but lacks entity identity definition.',
          hasFAQ ? 'FAQPage schema found, highly effective for generative QA.' : 'No FAQPage schema detected.'
        ]
      };

      // 4. LLMS.TXT PROTOCOL (geo-llmstxt)
      const hasLLMSTxt = await fetch(`${baseUrl}/llms.txt`).then(r => r.ok).catch(() => false);

      results.a2a = { 
        score: hasLLMSTxt ? 100 : 0,
        status: hasLLMSTxt ? 'READY' : 'WARN',
        details: [hasLLMSTxt ? 'llms.txt protocol active, providing direct context to AI agents.' : 'No machine-readable context file (llms.txt) found.']
      };

      // 5. BRAND AUTHORITY (geo-brand-mentions)
      const hasWikiLink = $('a[href*="wikipedia.org"]').length > 0;
      const hasSocialLinks = $('a[href*="linkedin.com"], a[href*="twitter.com"]').length > 0;

      results.brandMentions = {
        score: (hasWikiLink ? 50 : 0) + (hasSocialLinks ? 50 : 0),
        status: hasSocialLinks ? 'READY' : 'WARN',
        details: [
          hasWikiLink ? 'Strong external knowledge graph links (Wikipedia) found.' : 'Lacking links to external knowledge graphs.',
          hasSocialLinks ? 'Social entity links present.' : 'No recognized social profiles linked.'
        ]
      };

      // 6. CONTENT E-E-A-T (geo-content)
      const hasAuthor = $('meta[name="author"]').length > 0 || $('.author, .byline').length > 0;
      const hasDate = $('meta[property="article:published_time"]').length > 0 || $('time').length > 0;

      results.contentQuality = {
        score: (hasAuthor ? 50 : 0) + (hasDate ? 50 : 0),
        status: hasAuthor && hasDate ? 'READY' : 'WARN',
        details: [
          hasAuthor ? 'Author credentials detected.' : 'Missing clear author attribution.',
          hasDate ? 'Content freshness signals (publication date) found.' : 'No publication date signals detected.'
        ]
      };

      // 7. INTENT MATCH (geo-intent)
      const h1Text = $('h1').text().toLowerCase();
      const hasQuestionH2 = $('h2').map((_, el) => $(el).text()).get().some(text => /\b(how|what|why|when|where|who)\b/i.test(text) || text.includes('?'));
      
      results.intentMatch = {
        score: (h1Text ? 30 : 0) + (hasQuestionH2 ? 70 : 0),
        status: hasQuestionH2 ? 'READY' : 'WARN',
        details: [
          hasQuestionH2 ? 'Conversational headers (H2) found, matching generative query patterns.' : 'Headers lack conversational/question-based intent mapping.'
        ]
      };

      // 8. STRUCTURAL GEO (geo-structure)
      const hasLists = $('ul, ol').length > 0;
      const hasTables = $('table').length > 0;
      const hasSemanticTags = $('article, section, nav, aside').length > 0;

      results.structural = {
        score: (hasLists ? 40 : 0) + (hasTables ? 30 : 0) + (hasSemanticTags ? 30 : 0),
        status: hasLists && hasSemanticTags ? 'READY' : 'WARN',
        details: [
          hasLists || hasTables ? 'Structured data presentation (lists/tables) found.' : 'Lacking lists or tables, making parsing harder for LLMs.',
          hasSemanticTags ? 'Semantic HTML5 regions utilized correctly.' : 'Poor semantic document outline.'
        ]
      };

      // 9. SEMANTIC DEPTH (geo-semantics)
      const textLength = $('body').text().trim().replace(/\s+/g, ' ').length;
      const hasSufficientLength = textLength > 1500;

      results.semantic = {
        score: hasSufficientLength ? 100 : 40,
        status: hasSufficientLength ? 'READY' : 'WARN',
        details: [
          hasSufficientLength ? 'Sufficient content depth for semantic clustering.' : 'Thin content detected. Insufficient context for deep semantic mapping.'
        ]
      };

      // 10. MEDIA OPTIMIZATION (geo-media)
      const totalImages = $('img').length;
      const imagesWithAlt = $('img[alt]').filter((_, el) => $(el).attr('alt')?.trim() !== '').length;
      const mediaScore = totalImages === 0 ? 100 : Math.round((imagesWithAlt / totalImages) * 100);

      results.media = {
        score: mediaScore,
        status: mediaScore > 80 ? 'READY' : (mediaScore > 0 ? 'WARN' : 'FAILED'),
        details: [
          totalImages === 0 ? 'No images present to evaluate.' : `${imagesWithAlt} out of ${totalImages} images have descriptive alt text for multi-modal context.`
        ]
      };

      // 11. SENTIMENT ALIGNMENT (geo-sentiment)
      const hasExclamation = $('p').text().split('!').length > 5;
      
      results.sentiment = {
        score: hasExclamation ? 40 : 100,
        status: hasExclamation ? 'WARN' : 'READY',
        details: [
          hasExclamation ? 'Tone might be too sensational. LLMs prefer objective, factual reporting.' : 'Tone appears objective and neutral, aligning with AI citation preferences.'
        ]
      };

      // Calculate Overall Score
      const scores = [
        results.citability.score,
        results.technical.score,
        results.schema.score,
        results.a2a.score,
        results.brandMentions.score,
        results.contentQuality.score,
        results.intentMatch.score,
        results.structural.score,
        results.semantic.score,
        results.media.score,
        results.sentiment.score
      ];
      
      results.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

      results.log.push(`[OK] 11-DIMENSIONAL GEO SPECTRUM ANALYSIS COMPLETE. OVERALL SCORE: ${results.overallScore}/100`);
      return results;
    } catch (e) {
      results.log.push('[ERROR] HANDSHAKE FAILED. SITE UNREACHABLE.');
      return results;
    }
  }
}
