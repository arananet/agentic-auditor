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
      log: [`[OK] INITIALIZING SCAN FOR ${baseUrl}`]
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
            ? { message: 'Clear definition blocks found.', explanation: 'Your page uses direct language that AI can easily quote as a fact.', remediation: 'Keep using simple "X is Y" sentences to describe your core products or services.' }
            : { message: 'Text is too complex for easy quoting.', explanation: 'The content is wordy, making it hard for AI models (like ChatGPT) to find a clear answer to cite.', remediation: 'Add a "Key Facts" or "Summary" section with short, direct sentences.' },
          hasStats 
            ? { message: 'Data-backed claims detected.', explanation: 'Using numbers and percentages makes AI models trust your information more.', remediation: 'Ensure your statistics are up-to-date and cited from reliable sources.' }
            : { message: 'Lacks specific data or metrics.', explanation: 'The content is descriptive but lacks hard data, which can make it feel less authoritative to an AI.', remediation: 'Include specific numbers, such as "90% success rate" or "over 500 clients," to boost trust.' }
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
            ? { message: 'AI Bots are welcome.', explanation: 'Your site explicitly tells AI crawlers they are allowed to read your content.', remediation: 'No action needed. You are visible to the major AI engines.' }
            : { message: 'AI Bots are not explicitly invited.', explanation: 'Major AI crawlers might be ignoring your site because your settings are too generic.', remediation: 'Add "User-agent: GPTBot" and "Allow: /" to your robots.txt file.' },
          !isClientSideRendered \
            ? { message: 'Fast, readable code detected.', explanation: 'Your website code is "Agent-Friendly," meaning AI can read it instantly without waiting.', remediation: 'Maintain this speed by avoiding heavy scripts that block the main content.' }
            : { message: 'Hidden content (JavaScript-heavy).', explanation: 'AI scrapers might see a blank page because your content requires a browser to "load" before it shows up.', remediation: 'Switch to Server-Side Rendering (SSR) so your text is visible in the raw HTML.' }
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
          hasIdentity \
            ? { message: 'Official identity found.', explanation: 'AI knows exactly who you are (an Organization or Person), reducing the risk of being confused with others.', remediation: 'Ensure your official social media links are included in your identity data.' }
            : { message: 'Missing "Who We Are" data.', explanation: 'AI models have to guess your identity, which can lead to mistakes or "hallucinations" about your brand.', remediation: 'Add a Schema.org "Organization" block to your homepage code.' },
          hasFAQ \
            ? { message: 'Q&A format detected.', explanation: 'Providing questions and answers in your code helps AI use your site to answer user questions directly.', remediation: 'Keep your FAQ updated with the most common questions your customers ask.' }
            : { message: 'No FAQ data found.', explanation: 'You are missing out on a huge opportunity to appear in "AI Answer" boxes.', remediation: 'Add an FAQ section and mark it up with FAQPage Schema.' }
        ]
      };

      // 4. LLMS.TXT PROTOCOL
      const hasLLMSTxt = await fetch(`${baseUrl}/llms.txt`).then(r => r.ok).catch(() => false);

      results.a2a = { 
        score: hasLLMSTxt ? 100 : 0,
        status: hasLLMSTxt ? 'READY' : 'WARN',
        details: [
          hasLLMSTxt \
            ? { message: 'Dedicated AI summary found.', explanation: 'You have a "Handshake" file (llms.txt) that gives AI agents a perfect summary of your site.', remediation: 'Make sure this file links to your most important sub-pages.' }
            : { message: 'Missing the "AI Handshake".', explanation: 'Modern AI agents look for an /llms.txt file to understand your site quickly without scraping every page.', remediation: 'Create a simple markdown file at /llms.txt with a brief site overview.' }
        ]
      };

      // 5. BRAND AUTHORITY
      const hasWikiLink = $('a[href*="wikipedia.org"]').length > 0;
      const hasSocialLinks = $('a[href*="linkedin.com"], a[href*="twitter.com"]').length > 0;

      results.brandMentions = {
        score: (hasWikiLink ? 50 : 0) + (hasSocialLinks ? 50 : 0),
        status: hasSocialLinks ? 'READY' : 'WARN',
        details: [
          hasWikiLink \
            ? { message: 'Trusted authority links found.', explanation: 'Linking to high-authority sites like Wikipedia makes AI view your content as more factual.', remediation: 'Continue linking to external, verifiable sources of information.' }
            : { message: 'No external trust signals.', explanation: 'Your site feels like an "island." AI prefers sites that are connected to the wider web of knowledge.', remediation: 'Add outbound links to official sources, industry journals, or Wikipedia.' },
          hasSocialLinks \
            ? { message: 'Social proof detected.', explanation: 'Connected social profiles prove your brand exists in the real world.', remediation: 'Link all your active social platforms in the footer of every page.' }
            : { message: 'No linked social profiles.', explanation: 'Lack of social links makes it harder for AI to verify that your business is legitimate.', remediation: 'Link your official LinkedIn or Twitter/X profiles to verify your brand.' }
        ]
      };

      // 6. CONTENT E-E-A-T
      const hasAuthor = $('meta[name="author"]').length > 0 || $('.author, .byline').length > 0;
      const hasDate = $('meta[property="article:published_time"]').length > 0 || $('time').length > 0;

      results.contentQuality = {
        score: (hasAuthor ? 50 : 0) + (hasDate ? 50 : 0),
        status: hasAuthor && hasDate ? 'READY' : 'WARN',
        details: [
          hasAuthor \
            ? { message: 'Verified author found.', explanation: 'AI trusts content more when it knows a real person with expertise wrote it.', remediation: 'Link the author name to a bio page that lists their experience.' }
            : { message: 'Anonymous content detected.', explanation: 'Content without an author is often seen as lower quality by AI search engines.', remediation: 'Add a clear byline (e.g., "By John Doe") to your articles and pages.' },
          hasDate \
            ? { message: 'Fresh content signals found.', explanation: 'AI knows exactly how old your information is, which is vital for time-sensitive topics.', remediation: 'Always update the "Last Modified" date when you make major changes.' }
            : { message: 'No publication dates found.', explanation: 'AI cannot tell if your information is 5 years old or from yesterday.', remediation: 'Add publication and "Last Updated" dates to your content.' }
        ]
      };

      // 7. INTENT MATCH
      const hasQuestionH2 = $('h2').map((_, el) => $(el).text()).get().some(text => /\b(how|what|why|when|where|who)\b/i.test(text) || text.includes('?'));
      
      results.intentMatch = {
        score: hasQuestionH2 ? 100 : 30,
        status: hasQuestionH2 ? 'READY' : 'WARN',
        details: [
          hasQuestionH2 \
            ? { message: 'Direct question headers found.', explanation: 'Your headings match exactly how users ask AI for help.', remediation: 'Ensure the text right after the question header answers it immediately.' }
            : { message: 'Headers are too generic.', explanation: 'Your titles describe topics, but they don’t "talk" to the user, making them harder for AI to match to queries.', remediation: 'Turn some of your titles into questions like "How does [Topic] work?".' }
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
          hasLists || hasTables \
            ? { message: 'Organized data detected.', explanation: 'Lists and tables are "AI Magnets"—they are the first thing agents look for when summarizing a page.', remediation: 'Use bullet points for features and tables for comparing data.' }
            : { message: 'Content is mostly flat text.', explanation: 'Big blocks of text are hard for AI to scan for key takeaways or "how-to" steps.', remediation: 'Break up long paragraphs into bulleted lists or summary tables.' },
          hasSemanticTags \
            ? { message: 'Clean site structure.', explanation: 'Your code uses proper tags like <main> and <article>, helping AI ignore "junk" like sidebars.', remediation: 'Keep your main content clearly separated from navigation and ads.' }
            : { message: 'Vague site structure.', explanation: 'Over-using generic <div> tags makes it hard for AI to tell where the "real" content starts and ends.', remediation: 'Replace generic containers with <main>, <article>, and <section> tags.' }
        ]
      };

      // 9. SEMANTIC DEPTH
      const textLength = $('body').text().trim().replace(/\s+/g, ' ').length;
      const hasSufficientLength = textLength > 1500;

      results.semantic = {
        score: hasSufficientLength ? 100 : 40,
        status: hasSufficientLength ? 'READY' : 'WARN',
        details: [
          hasSufficientLength \
            ? { message: 'Rich, helpful depth.', explanation: 'You provide enough detail for an AI to truly understand and explain your topic to others.', remediation: 'Keep focusing on deep, useful content rather than short "fluff" pieces.' }
            : { message: 'Content is too thin.', explanation: 'There isn’t enough text for an AI to feel confident citing you as a primary source of information.', remediation: 'Expand your pages to include examples, case studies, or detailed explanations.' }
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
          totalImages === 0 \
            ? { message: 'No images to evaluate.', explanation: 'While not bad, AI models now use images to help explain topics. You might be missing out.', remediation: 'Consider adding helpful diagrams or charts with descriptive labels.' }
            : { message: `${imagesWithAlt} of ${totalImages} images described.`, explanation: 'Images without "alt text" are invisible to AI. Describing them helps AI "see" your content.', remediation: 'Audit your images and add a short description to every important picture.' }
        ]
      };

      // 11. SENTIMENT ALIGNMENT
      const hasExclamation = $('p').text().split('!').length > 5;
      
      results.sentiment = {
        score: hasExclamation ? 40 : 100,
        status: hasExclamation ? 'WARN' : 'READY',
        details: [
          hasExclamation \
            ? { message: 'Tone is a bit sensational.', explanation: 'AI models prefer calm, factual language. Using too many exclamation points or "hype" words can hurt your score.', remediation: 'Adopt a more professional, "Wikipedia-style" tone for your business pages.' }
            : { message: 'Tone is objective and calm.', explanation: 'Neutral, factual writing is exactly what AI models are trained to prioritize.', remediation: 'Maintain this factual tone to ensure your site is viewed as a reliable source.' }
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

      results.log.push(`[OK] ANALYSIS COMPLETE. OVERALL SCORE: ${results.overallScore}/100`);
      return results;
    } catch (e) {
      results.log.push('[ERROR] HANDSHAKE FAILED. SITE UNREACHABLE.');
      return results;
    }
  }
}
