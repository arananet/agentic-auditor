import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class MediaAudit implements IAuditStrategy {
  name = 'media';

  async execute({ $, language }: AuditContext): Promise<AuditResult> {
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

    // GEO: <figure> + <figcaption> — AI engines prefer images wrapped in semantic figure containers
    const figures = $('figure');
    const totalFigures = figures.length;
    let figuresWithCaption = 0;
    figures.each((_, fig) => {
      if ($(fig).find('figcaption').length > 0) figuresWithCaption++;
    });

    // Base score from alt text + bonus for figure/figcaption usage
    const altScore = totalImages === 0 ? 45 : Math.round(altRatio + descriptiveRatio);
    const figureBonus = Math.min(10, figuresWithCaption * 3); // up to 10 bonus pts
    let totalScore = Math.min(100, altScore + figureBonus);
    let finalScore = totalScore;
    
    let explanation = 'Vision-Language Models (VLMs) and multi-modal AI rely heavily on descriptive alt text to "see" images.';
    let remediation = 'Add 4+ word descriptive alt attributes to all content images.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the image alt-text strategy for Vision-Language Models (VLMs).
The page is in "${language}". Alt text may be in ${language} — do not penalize for non-English alt text.
Total images: ${totalImages}. Images with alt text: ${imagesWithAlt}. Images with highly descriptive alt text (>3 words): ${descriptiveAltCount}.
<figure> elements: ${totalFigures}. Figures with <figcaption>: ${figuresWithCaption}.
AI engines prefer images wrapped in <figure> with <figcaption> for contextual understanding. Score 100 if all images have robust descriptive alt text AND are wrapped in semantic <figure>/<figcaption> containers. Penalize if alt text is missing or too short.`;
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
        { message: totalImages > 0 ? `${descriptiveAltCount}/${totalImages} images have descriptive alt text.` : 'No images found on the page.', explanation: hasLlmMessage ? explanation : 'Vision-Language Models (VLMs) and multi-modal AI rely heavily on descriptive alt text to "see" images.', remediation: hasLlmMessage ? remediation : 'Add 4+ word descriptive alt attributes to all content images.', source: { label: 'WCAG 2.1 – SC 1.1.1 Non-text Content', url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html' }, location: `<img> elements (${totalImages} total, ${imagesWithAlt} with alt text)` },
        { message: figuresWithCaption > 0 ? `${figuresWithCaption}/${totalFigures} <figure> elements have <figcaption>.` : totalFigures > 0 ? `${totalFigures} <figure> elements found but none have <figcaption>.` : 'No <figure>/<figcaption> patterns found.', explanation: hasLlmMessage ? explanation : 'AI engines prefer images wrapped in <figure> with <figcaption> — this provides machine-readable contextual captions that alt text alone cannot.', remediation: hasLlmMessage ? remediation : 'Wrap key images in <figure> and add <figcaption> with descriptive captions.', source: { label: 'HTML Living Standard – figure element', url: 'https://html.spec.whatwg.org/multipage/grouping-content.html#the-figure-element' }, location: `<figure>/<figcaption> (${totalFigures} figures, ${figuresWithCaption} with captions)` }
      ]
    };
  }
}
