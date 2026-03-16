import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class StructuralAudit implements IAuditStrategy {
  name = 'structural';

  async execute({ $, html, language }: AuditContext): Promise<AuditResult> {
    const listCount = $('ul, ol').length;
    const tableCount = $('table').length;
    const semanticTagCount = $('article, section, nav, aside, main, header, footer').length;
    const definitionListCount = $('dl').length;
    const detailsSummaryCount = $('details, summary').length;

    const listScore = Math.min(30, listCount * 5);
    const tableScore = Math.min(25, tableCount * 10);
    const semanticScore = Math.min(25, semanticTagCount * 4);
    const extraStructure = Math.min(20, (definitionListCount * 8) + (detailsSummaryCount * 6));
    
    let totalScore = listScore + tableScore + semanticScore + extraStructure;
    let finalScore = totalScore;
    let explanation = 'Lists, tables, and semantic tags are high-signal structural elements for AI parsing.';
    let remediation = 'Break up long paragraphs into bulleted lists or summary tables.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      // Send a real HTML sample (first 4KB of body) so the LLM can see actual DOM structure
      const bodySample = $('body').html()?.slice(0, 4000) || '';
      const structureContext = `Page language: ${language}.
Heuristic counts: Lists (ul/ol): ${listCount}. Tables: ${tableCount}. Semantic HTML5 tags (main, article, section, nav, aside, header, footer): ${semanticTagCount}. Definition lists (dl): ${definitionListCount}. Details/Summary (collapsible): ${detailsSummaryCount}. DOM direct children: ${$('body > *').length}.
HTML sample (first 4KB of <body>):
${bodySample}`;
      const systemPrompt = `Evaluate the structural readiness of a webpage for AI parsing under GEO 2026.
The page is in "${language}". Evaluate the actual HTML structure — do not penalize for language.
AI engines extract data most effectively from lists, tables, definition lists, and semantic HTML5 containers (<main>, <article>, <section>).
You receive both numeric counts and an actual HTML sample. Use the HTML to verify the real DOM structure — some pages use CSS/JS to render lists visually but use <div> chains underneath.
Score 100 if there are ample real semantic elements. Score 0 if the page is mostly flat <div>-soup with no semantic structure.
Provide specific remediation advice.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(structureContext, systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 70 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: listCount > 0 || tableCount > 0 ? `Detected ${listCount} lists, ${tableCount} tables, ${definitionListCount} definition lists.` : 'Content is mostly flat text.', explanation: hasLlmMessage ? explanation : 'Lists and tables are "AI Magnets"—the highest signal structural elements.', remediation: hasLlmMessage ? remediation : 'Break up long paragraphs into bulleted lists or summary tables.', source: { label: 'GEO: Generative Engine Optimization (Aggarwal et al., 2023)', url: 'https://arxiv.org/abs/2311.09735' }, location: '<ul>/<ol>/<table>/<dl> elements' },
        { message: semanticTagCount >= 3 ? 'Clean semantic structure.' : 'Weak semantic structure.', explanation: hasLlmMessage ? explanation : 'Over-using generic <div> tags prevents AI from parsing the "Main Content" accurately.', remediation: hasLlmMessage ? remediation : 'Replace generic containers with <main>, <article>, and <section> tags.', source: { label: 'W3C HTML Living Standard – Content Sectioning', url: 'https://html.spec.whatwg.org/multipage/sections.html' }, location: `<main>/<article>/<section>/<nav>/<aside> (${semanticTagCount} found)` }
      ]
    };
  }
}
