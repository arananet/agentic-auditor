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

    // GEO: Table header semantics — AI engines parse tables more accurately with proper headers
    const tablesWithThead = $('table').filter((_, tbl) => $(tbl).find('thead').length > 0).length;
    const thCount = $('th').length;
    const scopedThCount = $('th[scope]').length;

    // AEO: FAQ section detection — dedicated FAQ content sections with Q&A pairs
    const headings = $('h1, h2, h3, h4').map((_, el) => $(el).text().trim()).get();
    const faqHeadingCount = headings.filter(h =>
      /\b(faq|frequently\s+asked|perguntas\s+frequentes|preguntas\s+frecuentes|foire\s+aux\s+questions|häufig\s+gestellte|domande\s+frequenti)\b/i.test(h)
    ).length;
    // Count question-pattern headings (H2/H3 starting with interrogative words)
    const questionHeadingCount = $('h2, h3').filter((_, el) => {
      const t = $(el).text().trim();
      return /^(what|how|why|when|where|who|which|can|does|is|are|should|will|do)\b/i.test(t) ||
        /\?$/.test(t);
    }).length;

    // AEO: Comparison table detection — tables with "vs" or comparison patterns
    const comparisonTableCount = $('table').filter((_, tbl) => {
      const text = $(tbl).text().toLowerCase();
      return /\bvs\.?\b|\bversus\b|\bcompar/i.test(text) ||
        $(tbl).find('th').length >= 3; // multi-column comparison format
    }).length;

    const listScore = Math.min(25, listCount * 5);
    const tableHeaderBonus = tableCount > 0 ? Math.min(8, tablesWithThead * 4 + (scopedThCount > 0 ? 4 : 0)) : 0;
    const tableScore = Math.min(20, tableCount * 8);
    const semanticScore = Math.min(20, semanticTagCount * 4);
    const extraStructure = Math.min(7, (definitionListCount * 4) + (detailsSummaryCount * 3));
    // AEO: FAQ and question headings
    const faqBonus = Math.min(10, (faqHeadingCount * 5) + (questionHeadingCount * 2));
    // AEO: Comparison table bonus
    const comparisonBonus = Math.min(5, comparisonTableCount * 5);
    
    let totalScore = Math.min(100, listScore + tableScore + semanticScore + extraStructure + tableHeaderBonus + faqBonus + comparisonBonus);
    let finalScore = totalScore;
    let explanation = 'Lists, tables, and semantic tags are high-signal structural elements for AI parsing.';
    let remediation = 'Break up long paragraphs into bulleted lists or summary tables.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      // Send a real HTML sample (first 4KB of body) so the LLM can see actual DOM structure
      const bodySample = $('body').html()?.slice(0, 4000) || '';
      const structureContext = `Page language: ${language}.
Heuristic counts: Lists (ul/ol): ${listCount}. Tables: ${tableCount} (${tablesWithThead} with <thead>, ${thCount} <th> elements, ${scopedThCount} with scope attribute). Semantic HTML5 tags (main, article, section, nav, aside, header, footer): ${semanticTagCount}. Definition lists (dl): ${definitionListCount}. Details/Summary (collapsible): ${detailsSummaryCount}. FAQ section headings: ${faqHeadingCount}. Question-phrased headings (H2/H3): ${questionHeadingCount}. Comparison tables (vs/feature): ${comparisonTableCount}. DOM direct children: ${$('body > *').length}.
HTML sample (first 4KB of <body>):
${bodySample}`;
      const systemPrompt = `Evaluate the structural readiness of a webpage for AI parsing under GEO 2026.
The page is in "${language}". Evaluate the actual HTML structure — do not penalize for language.
AI engines extract data most effectively from lists, tables, definition lists, and semantic HTML5 containers (<main>, <article>, <section>).
Tables should have proper header semantics: <thead>, <th> with scope attributes (scope="col"/"row") for AI to parse tabular data accurately.
FAQ sections with natural-language question headings (H2/H3) are high-signal for AEO snippet extraction — Perplexity specifically favors pages with FAQ schema and structured Q&A.
Comparison tables (~33% of AI engine citations come from comparison-format content) are strongly preferred by AI engines.
You receive both numeric counts and an actual HTML sample. Use the HTML to verify the real DOM structure — some pages use CSS/JS to render lists visually but use <div> chains underneath.
Score 100 if there are ample real semantic elements with proper table headers, FAQ sections, and comparison content. Score 0 if the page is mostly flat <div>-soup with no semantic structure.
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
        { message: semanticTagCount >= 3 ? 'Clean semantic structure.' : 'Weak semantic structure.', explanation: hasLlmMessage ? explanation : 'Over-using generic <div> tags prevents AI from parsing the "Main Content" accurately.', remediation: hasLlmMessage ? remediation : 'Replace generic containers with <main>, <article>, and <section> tags.', source: { label: 'W3C HTML Living Standard – Content Sectioning', url: 'https://html.spec.whatwg.org/multipage/sections.html' }, location: `<main>/<article>/<section>/<nav>/<aside> (${semanticTagCount} found)` },
        ...(tableCount > 0 ? [{ message: tablesWithThead > 0 && thCount > 0 ? `Tables have proper headers (${tablesWithThead} with <thead>, ${thCount} <th>${scopedThCount > 0 ? `, ${scopedThCount} with scope` : ''}).` : 'Tables lack proper header semantics.', explanation: hasLlmMessage ? explanation : 'AI engines parse tabular data more accurately when tables use <thead>, <th>, and scope attributes to define row/column relationships.', remediation: hasLlmMessage ? remediation : 'Add <thead> with <th scope="col"> for column headers and <th scope="row"> for row headers.', source: { label: 'W3C – Table headers', url: 'https://www.w3.org/WAI/tutorials/tables/' }, location: `<table> elements (${tableCount} total)` }] : []),
        { message: faqHeadingCount > 0 || questionHeadingCount > 0 ? `FAQ/Q&A structure detected: ${faqHeadingCount} FAQ section heading(s), ${questionHeadingCount} question-phrased heading(s).` : 'No FAQ sections or question-phrased headings detected.', explanation: hasLlmMessage ? explanation : 'Perplexity and other AI engines favor pages with explicit FAQ sections and question-phrased headings for AEO snippet extraction.', remediation: hasLlmMessage ? remediation : 'Add a "Frequently Asked Questions" section with H2/H3 headings phrased as natural-language questions.', source: { label: 'AEO Content Patterns – FAQ & Question Headings', url: 'https://www.seoclarity.net/blog/answer-engine-optimization' }, location: '<h2>/<h3> FAQ and question headings' },
        ...(comparisonTableCount > 0 ? [{ message: `${comparisonTableCount} comparison table(s) detected — strong AI citation signal.`, explanation: hasLlmMessage ? explanation : 'Comparison-format content accounts for ~33% of AI engine citations. Tables with feature comparisons are highly extractable.', remediation: hasLlmMessage ? remediation : 'Ensure comparison tables have clear column headers and consistent row structure.', source: { label: 'ZipTie – AI Citation Content Analysis', url: 'https://ziptie.dev/research/ai-content-types' }, location: `<table> comparison elements (${comparisonTableCount} found)` }] : [])
      ]
    };
  }
}
