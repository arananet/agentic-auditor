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

      // 1. AI CITABILITY
      const paragraphs = $('p').map((_, el) => $(el).text()).get();
      const hasAnswerBlocks = paragraphs.some(p => p.length > 50 && p.length < 300 && /(is|are|was|were|means|refers to)/i.test(p));
      const hasStats = paragraphs.some(p => /\d+(%| percent|k|m|b)/i.test(p));
      
      results.citability = {
        score: (hasAnswerBlocks ? 60 : 0) + (hasStats ? 40 : 0),
        status: hasAnswerBlocks ? 'READY' : 'WARN',
        details: [
          hasAnswerBlocks 
            ? { message: 'High fact-density blocks found.', explanation: 'Content contains concise, objective sentences defining core concepts, which LLMs prefer for citations.', remediation: 'Maintain clear "X is Y" definitional structures in your content.' }
            : { message: 'Content lacks concise answer blocks.', explanation: 'Content is too verbose or lacks clear definitional statements that LLMs can easily extract as facts.', remediation: 'Add concise, factual summaries (50-200 chars) answering core questions directly.' },
          hasStats 
            ? { message: 'Statistical density detected.', explanation: 'Numerical data and statistics increase the perceived authoritativeness by AI engines.', remediation: 'Continue backing claims with specific data points and metrics.' }
            : { message: 'No statistical data points detected.', explanation: 'Content relies on qualitative statements without numerical backing, which may be ranked lower for factual queries.', remediation: 'Include relevant percentages, metrics, or data points to support your claims.' }
        ]
      };

      // 2. TECHNICAL
      const robotsText = await fetch(`${baseUrl}/robots.txt`).then(r => r.text()).catch(() => '');
      const hasAIAllow = /(GPTBot|PerplexityBot|ClaudeBot|Anthropic)/i.test(robotsText);
      const isClientSideRendered = html.includes('id="root"') && $('p').length < 3;

      results.technical = {
        score: (robotsText ? 30 : 0) + (hasAIAllow ? 40 : 0) + (!isClientSideRendered ? 30 : 0),
        status: hasAIAllow && !isClientSideRendered ? 'READY' : 'WARN',
        details: [
          hasAIAllow 
            ? { message: 'AI Crawlers explicitly addressed.', explanation: 'Your robots.txt explicitly handles AI crawlers like GPTBot or ClaudeBot.', remediation: 'Regularly review crawler logs to ensure permitted bots are successfully indexing.' }
            : { message: 'Generic or missing AI crawler directives.', explanation: 'Without explicit AI crawler directives in robots.txt, some engines may skip your site or interpret limits incorrectly.', remediation: 'Add User-agent blocks for GPTBot, PerplexityBot, and ClaudeBot in your robots.txt.' },
          !isClientSideRendered 
            ? { message: 'Server-side rendered content detected.', explanation: 'HTML contains pre-rendered text, making it trivial for AI scrapers to ingest your content.', remediation: 'Ensure dynamic content (like reviews or pricing) is also included in the SSR payload.' }
            : { message: 'Heavy client-side rendering detected.', explanation: 'Your site requires JavaScript execution to reveal content. Many AI crawlers do not execute JS.', remediation: 'Implement Server-Side Rendering (SSR) or Static Site Generation (SSG) for core content.' }
        ]
      };

      // 3. SEMANTIC SCHEMA
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
          hasIdentity 
            ? { message: 'Identity schema (Person/Org) detected.', explanation: 'Provides unambiguous entity resolution for the knowledge graph, separating your brand from similar names.', remediation: 'Ensure sameAs properties link to your official social profiles and Wikipedia.' }
            : { message: 'Missing entity identity schema.', explanation: 'LLMs may hallucinate details about your brand or confuse you with similarly named entities.', remediation: 'Inject JSON-LD with @type "Organization" or "Person" defining your official name, logo, and social links.' },
          hasFAQ 
            ? { message: 'FAQPage schema found.', explanation: 'FAQ schema maps directly to generative QA formats, increasing likelihood of being cited for specific questions.', remediation: 'Keep FAQ answers concise and updated to match user search intents.' }
            : { message: 'No FAQPage schema detected.', explanation: 'Missing out on a high-signal structure that directly maps to how LLMs answer user prompts.', remediation: 'Add a Q&A section marked up with JSON-LD FAQPage schema.' }
        ]
      };

      // 4. LLMS.TXT PROTOCOL
      const hasLLMSTxt = await fetch(`${baseUrl}/llms.txt`).then(r => r.ok).catch(() => false);

      results.a2a = { 
        score: hasLLMSTxt ? 100 : 0,
        status: hasLLMSTxt ? 'READY' : 'WARN',
        details: [
          hasLLMSTxt 
            ? { message: 'llms.txt protocol active.', explanation: 'Your domain provides a machine-readable markdown context file tailored specifically for AI agents.', remediation: 'Keep llms.txt updated with your latest core offerings and documentation links.' }
            : { message: 'Missing llms.txt context file.', explanation: 'Agents must scrape standard HTML, risking token waste on navigation/footers and missing core context.', remediation: 'Create an /llms.txt file at your root directory containing a clean markdown summary of your site.' }
        ]
      };

      // 5. BRAND AUTHORITY
      const hasWikiLink = $('a[href*="wikipedia.org"]').length > 0;
      const hasSocialLinks = $('a[href*="linkedin.com"], a[href*="twitter.com"]').length > 0;

      results.brandMentions = {
        score: (hasWikiLink ? 50 : 0) + (hasSocialLinks ? 50 : 0),
        status: hasSocialLinks ? 'READY' : 'WARN',
        details: [
          hasWikiLink 
            ? { message: 'External knowledge graph links found.', explanation: 'Linking to recognized authorities like Wikipedia anchors your content in established semantic graphs.', remediation: 'Continue linking to high-authority source material where relevant.' }
            : { message: 'Lacking external authority anchoring.', explanation: 'Content appears isolated from established knowledge graphs, which may lower its perceived factual weight.', remediation: 'Include outbound links to authoritative sources (e.g., Wikipedia, academic journals, official documentation).' },
          hasSocialLinks 
            ? { message: 'Social entity links present.', explanation: 'Links to recognized platforms help engines verify the real-world existence and footprint of the entity.', remediation: 'Ensure these links match the sameAs URLs in your JSON-LD schema.' }
            : { message: 'No recognized social profiles linked.', explanation: 'Lack of social validation makes it harder for AI to verify the entitys legitimacy.', remediation: 'Add links to your official LinkedIn, Twitter/X, or GitHub profiles in the footer.' }
        ]
      };

      // 6. CONTENT E-E-A-T
      const hasAuthor = $('meta[name="author"]').length > 0 || $('.author, .byline').length > 0;
      const hasDate = $('meta[property="article:published_time"]').length > 0 || $('time').length > 0;

      results.contentQuality = {
        score: (hasAuthor ? 50 : 0) + (hasDate ? 50 : 0),
        status: hasAuthor && hasDate ? 'READY' : 'WARN',
        details: [
          hasAuthor 
            ? { message: 'Author credentials detected.', explanation: 'Clear authorship signals high Experience and Expertise (the E-E in E-E-A-T).', remediation: 'Link the author name to a dedicated author bio page with their credentials.' }
            : { message: 'Missing clear author attribution.', explanation: 'Anonymous content is heavily penalized in modern search and generative AI trust evaluations.', remediation: 'Add a <meta name="author"> tag or a visible byline class linking to an author profile.' },
          hasDate 
            ? { message: 'Content freshness signals found.', explanation: 'Publication dates allow LLMs to weigh the relevance of your facts for time-sensitive queries.', remediation: 'Include both published and last-modified dates for evergreen content.' }
            : { message: 'No publication date signals detected.', explanation: 'Engines cannot determine if your content is obsolete or cutting-edge.', remediation: 'Add a <time> element or article:published_time meta tag.' }
        ]
      };

      // 7. INTENT MATCH
      const hasQuestionH2 = $('h2').map((_, el) => $(el).text()).get().some(text => /\b(how|what|why|when|where|who)\b/i.test(text) || text.includes('?'));
      
      results.intentMatch = {
        score: hasQuestionH2 ? 100 : 30,
        status: hasQuestionH2 ? 'READY' : 'WARN',
        details: [
          hasQuestionH2 
            ? { message: 'Conversational headers (H2) found.', explanation: 'Headers mapped to interrogative pronouns (How, What, Why) perfectly match user generative prompts.', remediation: 'Ensure the paragraph immediately following the header directly answers the question.' }
            : { message: 'Headers lack conversational intent.', explanation: 'Your headings are topical rather than conversational, making it harder for LLMs to align them with user queries.', remediation: 'Rewrite some H2/H3 tags as direct questions (e.g., "What is [Topic]?").' }
        ]
      };

      // 8. STRUCTURAL GEO
      const hasLists = $('ul, ol').length > 0;
      const hasTables = $('table').length > 0;
      const hasSemanticTags = $('article, section, nav, aside').length > 0;

      results.structural = {
        score: (hasLists ? 40 : 0) + (hasTables ? 30 : 0) + (hasSemanticTags ? 30 : 0),
        status: hasLists && hasSemanticTags ? 'READY' : 'WARN',
        details: [
          hasLists || hasTables 
            ? { message: 'Structured data presentation found.', explanation: 'Lists and tables are highly prized by LLMs for extracting comparisons and step-by-step guides.', remediation: 'Use tables for comparative data and ordered lists for tutorials.' }
            : { message: 'Lacking lists or tabular data.', explanation: 'Walls of text are computationally expensive to parse for structured comparisons.', remediation: 'Break up long paragraphs into bulleted lists or summary tables.' },
          hasSemanticTags 
            ? { message: 'Semantic HTML5 regions utilized.', explanation: 'Proper use of <article> and <section> allows scrapers to ignore boilerplate nav/footer content.', remediation: 'Ensure the main content payload is wrapped in a single <article> or <main> tag.' }
            : { message: 'Poor semantic document outline.', explanation: 'Over-reliance on generic <div> tags forces bots to guess where the primary content resides.', remediation: 'Replace wrapper divs with <main>, <article>, and <section> tags.' }
        ]
      };

      // 9. SEMANTIC DEPTH
      const textLength = $('body').text().trim().replace(/\s+/g, ' ').length;
      const hasSufficientLength = textLength > 1500;

      results.semantic = {
        score: hasSufficientLength ? 100 : 40,
        status: hasSufficientLength ? 'READY' : 'WARN',
        details: [
          hasSufficientLength 
            ? { message: 'Sufficient content depth.', explanation: 'Long-form content provides enough token density for LLMs to build strong semantic clusters around your topic.', remediation: 'Maintain depth but ensure high information density (avoid filler text).' }
            : { message: 'Thin content detected.', explanation: 'Insufficient text volume makes it statistically unlikely for your page to be chosen as a primary citation source.', remediation: 'Expand on the topic with comprehensive examples, case studies, or detailed explanations.' }
        ]
      };

      // 10. MEDIA OPTIMIZATION
      const totalImages = $('img').length;
      const imagesWithAlt = $('img[alt]').filter((_, el) => $(el).attr('alt')?.trim() !== '').length;
      const mediaScore = totalImages === 0 ? 100 : Math.round((imagesWithAlt / totalImages) * 100);

      results.media = {
        score: mediaScore,
        status: mediaScore > 80 ? 'READY' : (mediaScore > 0 ? 'WARN' : 'FAILED'),
        details: [
          totalImages === 0 
            ? { message: 'No images present to evaluate.', explanation: 'While not strictly penalized, lacking media misses an opportunity for multi-modal indexing.', remediation: 'Consider adding informative diagrams with descriptive alt text.' }
            : { message: `${imagesWithAlt} of ${totalImages} images have alt text.`, explanation: 'Alt text is the only way Vision-language models (like GPT-4V) index image context within your document.', remediation: mediaScore < 100 ? 'Audit your <img> tags and add descriptive, contextual alt attributes to all non-decorative images.' : 'Ensure your alt text describes the image contextually, not just keywords.' }
        ]
      };

      // 11. SENTIMENT ALIGNMENT
      const hasExclamation = $('p').text().split('!').length > 5;
      
      results.sentiment = {
        score: hasExclamation ? 40 : 100,
        status: hasExclamation ? 'WARN' : 'READY',
        details: [
          hasExclamation 
            ? { message: 'Tone may be too sensational.', explanation: 'LLMs act as objective aggregators and generally filter out overly hyped or sales-heavy language.', remediation: 'Reduce exclamation points and superlative adjectives. Adopt a more objective, encyclopedic tone.' }
            : { message: 'Tone appears objective and neutral.', explanation: 'Factual, neutral language aligns perfectly with how AI models are fine-tuned to respond to users.', remediation: 'Continue prioritizing information transfer over aggressive sales copy.' }
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
