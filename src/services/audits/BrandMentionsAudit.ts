import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class BrandMentionsAudit implements IAuditStrategy {
  name = 'brandMentions';

  /** Language-keyed URL/text patterns for about, trust, and contact pages. */
  private static readonly ABOUT_PATTERNS: Record<string, string[]> = {
    en: ['about', 'who-we-are', 'our-story', 'company', 'sustainability'],
    pt: ['sobre', 'quem-somos', 'nossa-historia', 'institucional', 'empresa', 'sustentabilidade'],
    es: ['sobre', 'quienes-somos', 'nuestra-historia', 'empresa', 'sostenibilidad'],
    fr: ['a-propos', 'qui-sommes', 'notre-histoire', 'entreprise', 'durabilite'],
    de: ['ueber-uns', 'uber-uns', 'unternehmen', 'nachhaltigkeit'],
    it: ['chi-siamo', 'la-nostra-storia', 'azienda', 'sostenibilita'],
  };
  private static readonly TRUST_PATTERNS: Record<string, string[]> = {
    en: ['privacy', 'terms', 'policy', 'faq', 'testimonial', 'press', 'awards', 'certificat'],
    pt: ['privacidade', 'termos', 'condicoes', 'politica', 'faq', 'frete', 'certificad'],
    es: ['privacidad', 'terminos', 'condiciones', 'politica', 'faq', 'certificad'],
    fr: ['confidentialite', 'conditions', 'mentions-legales', 'faq', 'certificat'],
    de: ['datenschutz', 'agb', 'impressum', 'nutzungsbedingungen', 'faq'],
    it: ['privacy', 'termini', 'condizioni', 'faq', 'certificaz'],
  };
  private static readonly CONTACT_PATTERNS: Record<string, string[]> = {
    en: ['contact', 'support', 'help'],
    pt: ['contato', 'atendimento', 'suporte', 'ajuda'],
    es: ['contacto', 'atencion', 'soporte', 'ayuda'],
    fr: ['contact', 'assistance', 'aide'],
    de: ['kontakt', 'hilfe', 'support'],
    it: ['contatto', 'supporto', 'assistenza', 'aiuto'],
  };

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
    // 1. Authority outbound links — broad set of platforms (2026 GEO)
    const authorityDomains = [
      'linkedin.com', 'twitter.com', 'x.com', 'wikipedia.org',
      'facebook.com', 'fb.com', 'fb.me',
      'instagram.com', 'youtube.com', 'tiktok.com',
      'reddit.com', 'github.com', 'glassdoor.com', 'crunchbase.com',
      'wa.me', 'whatsapp.com', 't.me'
    ];
    const thirdPartyReviewDomains = [
      'g2.com', 'capterra.com', 'trustradius.com', 'trustpilot.com',
      'quora.com', 'medium.com', 'producthunt.com', 'yelp.com',
      'bbb.org', 'sitejabber.com'
    ];
    const highWeightDomains = ['wikipedia.org', 'reddit.com', 'youtube.com'];
    const allTrackDomains = [...authorityDomains, ...thirdPartyReviewDomains];
    const authoritySelector = allTrackDomains.map(d => `a[href*="${d}"]`).join(', ');
    const authorityLinks = $(authoritySelector).length;

    // 2. Social icon links — look in footer, header, or any social/share wrapper
    const socialIconLinks = $(
      '[class*="social"] a[href], [class*="share"] a[href], ' +
      'footer a[href], [class*="footer"] a[href], [id*="footer"] a[href], ' +
      '[role="contentinfo"] a[href]'
    ).filter((_, el) => {
      const href = ($(el).attr('href') || '').toLowerCase();
      return authorityDomains.some(d => href.includes(d));
    }).length;

    const totalSocialProof = Math.max(authorityLinks, authorityLinks + socialIconLinks);
    const socialScore = Math.min(30, totalSocialProof * 6);
    const highWeightSelector = highWeightDomains.map(d => `a[href*="${d}"]`).join(', ');
    const highWeightLinks = $(highWeightSelector).length;
    const reviewSelector = thirdPartyReviewDomains.map(d => `a[href*="${d}"]`).join(', ');
    const reviewLinks = $(reviewSelector).length;
    const highWeightBonus = Math.min(10, highWeightLinks * 5);
    const reviewBonus = Math.min(5, reviewLinks * 3);

    // 3. About page detection — language-aware
    const aboutWords = [
      ...(BrandMentionsAudit.ABOUT_PATTERNS[language] || []),
      ...(language !== 'en' ? BrandMentionsAudit.ABOUT_PATTERNS['en'] : [])
    ];
    const aboutSelector = aboutWords.map(w => `a[href*="${w}"]`).join(', ');
    const hasAboutUs = $(aboutSelector).length > 0 ? 30 : 0;

    // 4. Trust markers — language-aware
    const trustWords = [
      ...(BrandMentionsAudit.TRUST_PATTERNS[language] || []),
      ...(language !== 'en' ? BrandMentionsAudit.TRUST_PATTERNS['en'] : [])
    ];
    const trustSelector = trustWords.map(w => `a[href*="${w}"]`).join(', ');
    const hasTrustPage = $(trustSelector).length > 0 ? 15 : 0;

    // 5. Contact info presence — language-aware + WhatsApp + phone patterns
    const contactWords = [
      ...(BrandMentionsAudit.CONTACT_PATTERNS[language] || []),
      ...(language !== 'en' ? BrandMentionsAudit.CONTACT_PATTERNS['en'] : [])
    ];
    const contactHrefSelector = [
      'a[href^="mailto:"]', 'a[href^="tel:"]',
      'a[href*="wa.me"]', 'a[href*="whatsapp"]', 'a[href*="api.whatsapp.com"]',
      ...contactWords.map(w => `a[href*="${w}"]`)
    ].join(', ');
    const hasContactLink = $(contactHrefSelector).length > 0;

    // Detect phone numbers in page text (international formats)
    const bodyText = $.text();
    const hasPhonePattern = /(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/.test(bodyText) ||
      /0800[\s.-]?\d{3}[\s.-]?\d{4}/.test(bodyText);
    const hasContact = (hasContactLink || hasPhonePattern) ? 15 : 0;

    let finalScore = Math.min(100, socialScore + highWeightBonus + reviewBonus + hasAboutUs + hasTrustPage + hasContact);
    let explanation = 'AI engines cross-reference brand entities via Wikipedia, social profiles, and trust signals.';
    let remediation = 'Add outbound authority links and ensure About, Contact, and Privacy pages are linked.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const allLinks = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean).slice(0, 100);
      const pageContext = `Page language: ${language}. Authority links found: ${totalSocialProof}. Social icon links: ${socialIconLinks}. High-weight domains (Wikipedia/Reddit/YouTube): ${highWeightLinks}. Third-party review platform links: ${reviewLinks}. About page: ${hasAboutUs > 0}. Trust pages (privacy/terms/press): ${hasTrustPage > 0}. Contact info: ${hasContact > 0}. Sample outbound links: ${JSON.stringify(allLinks.slice(0, 30))}`;

      const systemPrompt = `Evaluate the site's brand authority and social proof for GEO (Generative Engine Optimization) 2026 standards.
The page is in "${language}". Evaluate the site IN ITS ORIGINAL LANGUAGE — do not penalize for non-English link text or page names.
Brand mentions on YouTube and Reddit correlate ~3x more strongly with AI visibility than traditional backlinks (Ahrefs, Dec 2025, 75K brands).
Third-party review platforms (G2, Capterra, Trustpilot, Trustradius) are also strong AI citation signals.
AI agents cross-reference brand entities via Wikipedia, social media profiles (YouTube, Reddit, LinkedIn), and company data aggregators (Crunchbase, Glassdoor, GitHub).
Score 100 if the site has strong outbound authority links including YouTube/Reddit, third-party review links, a clear About page (may be called "Sobre", "Quem Somos", "Chi Siamo", etc.), contact info (phone, WhatsApp, email), and trust markers (privacy policy, terms, FAQ).
Score 0 if none exist.`;
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
        { message: highWeightLinks > 0 ? `${highWeightLinks} high-weight domain link(s) found (Wikipedia, Reddit, YouTube).` : 'No high-weight domain links detected (Wikipedia, Reddit, YouTube).', explanation: hasLlmMessage ? explanation : 'Links to Wikipedia, Reddit, and YouTube carry the highest AI citation weight — these platforms are primary sources AI engines use to verify brand entities.', remediation: hasLlmMessage ? remediation : 'Add links to your Wikipedia page (if applicable), Reddit community, or YouTube channel. Even a YouTube embed counts.', source: { label: 'Ahrefs (Dec 2025) – High-weight domain AI citations', url: 'https://ahrefs.com/blog/ai-overviews/' }, location: `wikipedia.org, reddit.com, youtube.com <a> links` },
        { message: reviewLinks > 0 ? `${reviewLinks} third-party review platform link(s) found.` : 'No third-party review platform links detected.', explanation: hasLlmMessage ? explanation : 'Review platform links (G2, Capterra, Trustpilot, etc.) are strong trust signals for AI engines evaluating brand credibility.', remediation: hasLlmMessage ? remediation : 'Add links to your profiles on G2, Capterra, Trustpilot, or Trustradius to boost AI-visible credibility.', source: { label: 'GEO 2026 – Third-Party Review Signals', url: 'https://www.seoclarity.net/blog/answer-engine-optimization' }, location: `g2.com, capterra.com, trustpilot.com, etc. <a> links` },
        { message: hasAboutUs > 0 ? 'Clear "About" section detected.' : 'No identifiable "About" page link.', explanation: hasLlmMessage ? explanation : 'Generative engines scrape the About page to synthesize "Who is X" queries.', remediation: hasLlmMessage ? remediation : 'Create and prominently link an "About Us" or "Quem Somos" page.', source: { label: 'Google E-E-A-T – Authoritativeness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: 'navigation / header <a> links' },
        { message: (hasTrustPage + hasContact) > 0 ? 'Trust signals detected (contact, privacy, etc.).' : 'Missing trust markers (contact, privacy, testimonials).', explanation: hasLlmMessage ? explanation : 'Privacy policies, contact info, and testimonials build AI trust scores.', remediation: hasLlmMessage ? remediation : 'Ensure Contact, Privacy, and Terms pages are visibly linked.', source: { label: 'Google E-E-A-T – Trustworthiness', url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content' }, location: '<a href="mailto:">, <a href="tel:">, privacy/terms links' }
      ]
    };
  }
}
