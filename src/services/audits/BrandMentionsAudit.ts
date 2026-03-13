import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class BrandMentionsAudit implements IAuditStrategy {
  name = 'brandMentions';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const text = $('body').text().toLowerCase();
    const links = $('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="wikipedia.org"]').length;
    
    const socialScore = Math.min(50, links * 10);
    const hasAboutUs = $('a[href*="about"], a:contains("About")').length > 0 ? 50 : 0;
    
    let finalScore = socialScore + hasAboutUs;
    let explanation = 'AI uses Wikipedia, LinkedIn, and Twitter to cross-reference entities.';
    let remediation = 'Add external links to your company LinkedIn or founder profiles and an About Us page.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the site's brand authority and social proof based on these metrics: The page contains outbound authority links (Wikipedia/LinkedIn/Twitter): ${links}. It has an "About Us" section link: ${hasAboutUs > 0}. AI agents use these to cross-reference entities. Score 100 if strong authority links and an About page exist. Provide specific feedback on brand trust markers.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback("Analyze Brand Mention metrics", systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: socialScore > 0 ? 'Social proof links found.' : 'Missing authority outbound links.', explanation: hasLlmMessage ? explanation : 'AI uses Wikipedia, LinkedIn, and Twitter to cross-reference entities.', remediation: hasLlmMessage ? remediation : 'Add external links to your company LinkedIn or founder profiles.' },
        { message: hasAboutUs > 0 ? 'Clear "About" section detected.' : 'No identifiable "About" page link.', explanation: hasLlmMessage ? explanation : 'Generative engines scrape the About page to synthesize "Who is X" queries.', remediation: hasLlmMessage ? remediation : 'Create and prominently link an "About Us" page.' }
      ]
    };
  }
}
