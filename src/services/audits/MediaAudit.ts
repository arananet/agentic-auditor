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

    // GEO: Text↔media co-location — image/video near the heading it supports
    // Studies cite 156% higher AI selection when text is paired with relevant imagery/video
    let h2Sections = 0;
    let h2WithMedia = 0;
    const coLocationThreshold = 200; // words
    $('h2').each((_, heading) => {
      h2Sections++;
      // Collect content between this H2 and the next H2/H1
      let hasMedia = false;
      let wordsSoFar = 0;
      let sibling = $(heading).next();
      while (sibling.length > 0 && !sibling.is('h1, h2')) {
        // Check if this element or its children contain media
        if (sibling.is('img, video, figure') || sibling.find('img, video, figure').length > 0) {
          hasMedia = true;
        }
        wordsSoFar += sibling.text().trim().split(/\s+/).filter(Boolean).length;
        if (wordsSoFar > coLocationThreshold) break;
        sibling = sibling.next();
      }
      if (hasMedia) h2WithMedia++;
    });
    const coLocationRatio = h2Sections > 0 ? h2WithMedia / h2Sections : 0;

    // Videos — separate check for video content
    const videoCount = $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]').length;

    // Base score from alt text + bonus for figure/figcaption usage + co-location
    const altScore = totalImages === 0 ? 45 : Math.round(altRatio + descriptiveRatio);
    const figureBonus = Math.min(10, figuresWithCaption * 3); // up to 10 bonus pts
    const coLocationBonus = Math.min(15, Math.round(coLocationRatio * 15)); // up to 15 pts
    const videoBonus = Math.min(5, videoCount * 3);
    let totalScore = Math.min(100, altScore + figureBonus + coLocationBonus + videoBonus);
    let finalScore = totalScore;
    
    let explanation = 'Vision-Language Models (VLMs) and multi-modal AI rely heavily on descriptive alt text to "see" images.';
    let remediation = 'Add 4+ word descriptive alt attributes to all content images.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the image alt-text strategy for Vision-Language Models (VLMs).
The page is in "${language}". Alt text may be in ${language} — do not penalize for non-English alt text.
Total images: ${totalImages}. Images with alt text: ${imagesWithAlt}. Images with highly descriptive alt text (>3 words): ${descriptiveAltCount}.
<figure> elements: ${totalFigures}. Figures with <figcaption>: ${figuresWithCaption}.
Text↔media co-location: ${h2WithMedia}/${h2Sections} H2 sections have images/videos within ${coLocationThreshold} words (ratio: ${(coLocationRatio * 100).toFixed(0)}%). GEO studies cite 156% higher AI selection when text is paired with relevant imagery/video near the heading it supports.
Videos found: ${videoCount}.
AI engines prefer images wrapped in <figure> with <figcaption> for contextual understanding. Score 100 if all images have robust descriptive alt text, are wrapped in semantic containers, AND are co-located with their relevant text sections. Penalize if alt text is missing or media is divorced from its supporting text.`;
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
        { message: figuresWithCaption > 0 ? `${figuresWithCaption}/${totalFigures} <figure> elements have <figcaption>.` : totalFigures > 0 ? `${totalFigures} <figure> elements found but none have <figcaption>.` : 'No <figure>/<figcaption> patterns found.', explanation: hasLlmMessage ? explanation : 'AI engines prefer images wrapped in <figure> with <figcaption> — this provides machine-readable contextual captions that alt text alone cannot.', remediation: hasLlmMessage ? remediation : 'Wrap key images in <figure> and add <figcaption> with descriptive captions.', source: { label: 'HTML Living Standard – figure element', url: 'https://html.spec.whatwg.org/multipage/grouping-content.html#the-figure-element' }, location: `<figure>/<figcaption> (${totalFigures} figures, ${figuresWithCaption} with captions)` },
        { message: h2Sections > 0 ? `${h2WithMedia}/${h2Sections} H2 sections (${(coLocationRatio * 100).toFixed(0)}%) have co-located media.` : 'No H2 sections found to assess media co-location.', explanation: hasLlmMessage ? explanation : 'GEO studies cite 156% higher AI selection when text is paired with relevant imagery/video within the same section. Each H2 content block should include a supporting image, video, or figure.', remediation: hasLlmMessage ? remediation : 'Add a relevant image, diagram, or video within each major H2 section. Place media close to the heading it supports, ideally within the first 200 words.', source: { label: 'GEO Multi-modal Content Pairing (Aggarwal et al., 2023)', url: 'https://arxiv.org/abs/2311.09735' }, location: `<h2> sections with <img>/<video>/<figure> (${h2WithMedia}/${h2Sections})` }
      ]
    };
  }
}
