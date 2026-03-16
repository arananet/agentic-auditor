import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class BrandMentionsAudit implements IAuditStrategy {
  name = 'brandMentions';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    // 1. Authority outbound links — broad set of platforms (2026 GEO)
    const authorityDomains = [
      'linkedin.com', 'twitter.com', 'x.com', 'wikipedia.org',
      'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com',
      'reddit.com', 'github.com', 'glassdoor.com', 'crunchbase.com'
    ];
    const authoritySelector = authorityDomains.map(d => `a[href*="${d}"]`).join(', ');
    const authorityLinks = $(authoritySelector).length;

    // 2. Social icon links in footer/header (common pattern)
    const socialIconLinks = $('[class*="social"] a, footer a[aria-label], [class*="footer"] a[href*="linkedin"], [class*="footer"] a[href*="instagram"], [class*="footer"] a[href*="facebook"], [class*="footer"] a[href*="youtube"], [class*="footer"] a[href*="x.com"], [class*="footer"] a[href*="twitter"]').length;

    const totalSocialProof = authorityLinks + socialIconLinks;
    const socialScore = Math.min(40, totalSocialProof * 8);

    // 3. About page detection — broader selectors
    const hasAboutUs = $(
      'a[href*="about"], a[href*="sobre"], a[href*="quem-somos"], a[href*="who-we-are"], ' +
      'a:contains("About"), a:contains("Sobre"), a:contains("Quem Somos"), a:contains("Who We Are")'
    ).length > 0 ? 30 : 0;

    // 4. Trust markers: testimonials, press, privacy, certifications
    const hasTrustPage = $(
      'a[href*="privacy"], a[href*="terms"], a[href*="testimonial"], a[href*="press"], ' +
      'a[href*="awards"], a[href*="certificat"], a:contains("Testimonials"), a:contains("Press")'
    ).length > 0 ? 15 : 0;

    // 5. Contact info presence
    const hasContact = $(
      'a[href^="mailto:"], a[href^="tel:"], a[href*="contact"], a:contains("Contact")'
    ).length > 0 ? 15 : 0;

    let finalScore = Math.min(100, socialScore + hasAboutUs + hasTrustPage + hasContact);
    let explanation = 'AI engines cross-reference brand entities via Wikipedia, social profiles, and trust signals.';
    let remediation = 'Add outbound authority links and ensure About, Contact, and Privacy pages are linked.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      // Send actual page link summary so the LLM can evaluate real brand authority signals
      const allLinks = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean).slice(0, 100);
      const pageContext = `Authority links found: ${totalSocialProof}. Social icon links: ${socialIconLinks}. About page: ${hasAboutUs > 0}. Trust pages (privacy/terms/press): ${hasTrustPage > 0}. Contact info: ${hasContact > 0}. Sample outbound links: ${JSON.stringify(allLinks.slice(0, 30))}`;

      const systemPrompt = `Evaluate the site's brand authority and social proof for GEO (Generative Engine Optimization) 2026 standards. Brand mentions on YouTube and Reddit correlate ~3x more strongly with AI visibility than traditional backlinks (Ahrefs, Dec 2025, 75K brands). AI agents cross-reference brand entities via Wikipedia, social media profiles (YouTube, Reddit, LinkedIn), and company data aggregators (Crunchbase, Glassdoor, GitHub). Score 100 if the site has strong outbound authority links including YouTube/Reddit, a clear About page, contact info, and trust markers. Score 0 if none exist.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(pageContext, systemPrompt);
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
        { message: totalSocialProof > 0 ? `${totalSocialProof} social/authority links found.` : 'Missing authority outbound links.', explanation: hasLlmMessage ? explanation : 'Brand mentions on YouTube and Reddit correlate ~3x more strongly with AI visibility than traditional backlinks (Ahrefs Dec 2025, 75K brands). AI uses Wikipedia, social profiles, and aggregators to cross-reference entities.', remediation: hasLlmMessage ? remediation : 'Add links to YouTube, Reddit, LinkedIn, Wikipedia, and X/Twitter. YouTube and Reddit carry the highest AI citation weight.', source: { label: 'Ahrefs (Dec 2025) – Brand mentions vs backlinks in AI visibility; Google E-E-A-T', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: `outbound <a> links (${authorityLinks} authority, ${socialIconLinks} social icons)` },
        { message: hasAboutUs > 0 ? 'Clear "About" section detected.' : 'No identifiable "About" page link.', explanation: hasLlmMessage ? explanation : 'Generative engines scrape the About page to synthesize "Who is X" queries.', remediation: hasLlmMessage ? remediation : 'Create and prominently link an "About Us" or "Quem Somos" page.', source: { label: 'Google E-E-A-T – Authoritativeness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: 'navigation / header <a> links' },
        { message: (hasTrustPage + hasContact) > 0 ? 'Trust signals detected (contact, privacy, etc.).' : 'Missing trust markers (contact, privacy, testimonials).', explanation: hasLlmMessage ? explanation : 'Privacy policies, contact info, and testimonials build AI trust scores.', remediation: hasLlmMessage ? remediation : 'Ensure Contact, Privacy, and Terms pages are visibly linked.', source: { label: 'Google E-E-A-T – Trustworthiness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: '<a href="mailto:">, <a href="tel:">, privacy/terms links' }
      ]
    };
  }
}
