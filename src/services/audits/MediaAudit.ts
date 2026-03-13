import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class MediaAudit implements IAuditStrategy {
  name = 'media';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const images = $('img');
    const totalImages = images.length;
    let imagesWithAlt = 0;
    let descriptiveAltCount = 0;

    images.each((_, img) => {
      const alt = $(img).attr('alt') || '';
      if (alt.trim().length > 0) {
        imagesWithAlt++;
        if (alt.split(' ').length > 3) {
          descriptiveAltCount++;
        }
      }
    });

    const altRatio = totalImages > 0 ? (imagesWithAlt / totalImages) * 50 : 0;
    const descriptiveRatio = totalImages > 0 ? (descriptiveAltCount / totalImages) * 50 : 0;
    
    const totalScore = totalImages === 0 ? 50 : Math.round(altRatio + descriptiveRatio); // Penalty for zero images but not 0 score.

    return {
      score: totalScore,
      status: totalScore >= 80 ? 'READY' : totalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: totalImages > 0 ? `${descriptiveAltCount}/${totalImages} images have descriptive alt text.` : 'No images found on the page.', explanation: 'Vision-Language Models (VLMs) and multi-modal AI rely heavily on descriptive alt text to "see" images.', remediation: 'Add 4+ word descriptive alt attributes to all content images.' }
      ]
    };
  }
}
