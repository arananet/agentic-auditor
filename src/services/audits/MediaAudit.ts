import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class MediaAudit implements IAuditStrategy {
  name = 'media';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const images = $('img');
    const totalImages = images.length;
    let imagesWithAlt = 0;
    let descriptiveAltCount = 0;
    const altTexts: string[] = [];

    images.each((_, img) => {
      const alt = $(img).attr('alt') || '';
      if (alt.trim().length > 0) {
        imagesWithAlt++;
        altTexts.push(alt);
        if (alt.split(' ').length > 3) {
          descriptiveAltCount++;
        }
      }
    });

    const altRatio = totalImages > 0 ? (imagesWithAlt / totalImages) * 50 : 0;
    const descriptiveRatio = totalImages > 0 ? (descriptiveAltCount / totalImages) * 50 : 0;
    
    let totalScore = totalImages === 0 ? 50 : Math.round(altRatio + descriptiveRatio); 
    let finalScore = totalScore;
    
    let explanation = 'Vision-Language Models (VLMs) and multi-modal AI rely heavily on descriptive alt text to "see" images.';
    let remediation = 'Add 4+ word descriptive alt attributes to all content images.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the image alt-text strategy for Vision-Language Models (VLMs). Total images: ${totalImages}. Images with alt text: ${imagesWithAlt}. Images with highly descriptive alt text (>3 words): ${descriptiveAltCount}. Score 100 if all images have robust descriptive alt text summarizing the image contents contextually. Penalize if alt text is missing or too short. Provide feedback on the specific alt text quality.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(altTexts.join('\n').slice(0, 3000) || "No images on page.", systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 80 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: totalImages > 0 ? `${descriptiveAltCount}/${totalImages} images have descriptive alt text.` : 'No images found on the page.', explanation: hasLlmMessage ? explanation : 'Vision-Language Models (VLMs) and multi-modal AI rely heavily on descriptive alt text to "see" images.', remediation: hasLlmMessage ? remediation : 'Add 4+ word descriptive alt attributes to all content images.', source: { label: 'WCAG 2.1 – SC 1.1.1 Non-text Content', url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html' }, location: `<img> elements (${totalImages} total, ${imagesWithAlt} with alt text)` }
      ]
    };
  }
}
