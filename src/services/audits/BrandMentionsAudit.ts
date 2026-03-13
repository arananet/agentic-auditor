import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class BrandMentionsAudit implements IAuditStrategy {
  name = 'brandMentions';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const text = $('body').text().toLowerCase();
    const links = $('a[href*="linkedin.com"], a[href*="twitter.com"], a[href*="wikipedia.org"]').length;
    
    // Move from binary to continuous scoring
    const socialScore = Math.min(50, links * 10);
    const hasAboutUs = $('a[href*="about"], a:contains("About")').length > 0 ? 50 : 0;
    const totalScore = socialScore + hasAboutUs;

    return {
      score: totalScore,
      status: totalScore >= 75 ? 'READY' : totalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: socialScore > 0 ? 'Social proof links found.' : 'Missing authority outbound links.', explanation: 'AI uses Wikipedia, LinkedIn, and Twitter to cross-reference entities.', remediation: 'Add external links to your company LinkedIn or founder profiles.' },
        { message: hasAboutUs > 0 ? 'Clear "About" section detected.' : 'No identifiable "About" page link.', explanation: 'Generative engines scrape the About page to synthesize "Who is X" queries.', remediation: 'Create and prominently link an "About Us" page.' }
      ]
    };
  }
}
