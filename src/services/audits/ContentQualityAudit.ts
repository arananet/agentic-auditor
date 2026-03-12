import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class ContentQualityAudit implements IAuditStrategy {
  name = 'contentQuality';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const hasAuthorMeta = $('meta[name="author"]').length > 0 || $('.author, .byline').length > 0;
    const hasPublishDate = $('time').length > 0 || $('meta[property="article:published_time"]').length > 0;
    
    const wordCount = $('body').text().split(/\s+/).filter(w => w.length > 0).length;
    const wordDensityScore = Math.min(50, Math.floor(wordCount / 50)); // Max 50 points for 2500 words

    let score = wordDensityScore;
    if (hasAuthorMeta) score += 25;
    if (hasPublishDate) score += 25;

    return {
      score,
      status: score >= 75 ? 'READY' : score >= 50 ? 'WARN' : 'ERROR',
      details: [
        { message: hasAuthorMeta ? 'Authorship defined.' : 'Missing explicit author metadata.', explanation: 'E-E-A-T signals require transparent authorship.', remediation: 'Add <meta name="author"> or visible author bylines.' },
        { message: hasPublishDate ? 'Content freshness indicated.' : 'Missing publish dates.', explanation: 'AI agents prioritize recent data over evergreen content without a timestamp.', remediation: 'Use HTML5 <time> tags for articles.' },
        { message: wordDensityScore >= 40 ? 'Rich content depth.' : 'Thin content detected.', explanation: 'AI models struggle to summarize pages with fewer than 1,000 words of substantive text.', remediation: 'Expand core pages to exceed 1,500 words with in-depth answers.' }
      ]
    };
  }
}
