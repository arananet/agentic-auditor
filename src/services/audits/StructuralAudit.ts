import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class StructuralAudit implements IAuditStrategy {
  name = 'structural';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const listCount = $('ul, ol').length;
    const tableCount = $('table').length;
    const semanticTagCount = $('article, section, nav, aside, main, header, footer').length;

    const listScore = Math.min(35, listCount * 5);
    const tableScore = Math.min(30, tableCount * 10);
    const semanticScore = Math.min(35, semanticTagCount * 5);
    
    let totalScore = listScore + tableScore + semanticScore;
    let finalScore = totalScore;
    let explanation = 'Lists and tables are "AI Magnets"—the highest signal structural elements.';
    let remediation = 'Break up long paragraphs into bulleted lists or summary tables.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the structural readiness of a webpage for AI based on these counts: Lists: ${listCount}, Tables: ${tableCount}, Semantic HTML5 Tags (main, article, section): ${semanticTagCount}. Score 100 if there are ample lists, tables, and semantic tags. Score 0 if it's mostly flat text. Give feedback on how AI parses DOM structures.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback("Analyze structural metrics", systemPrompt);
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
        { message: listCount > 0 || tableCount > 0 ? `Detected ${listCount} lists and ${tableCount} tables.` : 'Content is mostly flat text.', explanation: hasLlmMessage ? explanation : 'Lists and tables are "AI Magnets"—the highest signal structural elements.', remediation: hasLlmMessage ? remediation : 'Break up long paragraphs into bulleted lists or summary tables.' },
        { message: semanticTagCount >= 3 ? 'Clean semantic structure.' : 'Vague site structure.', explanation: hasLlmMessage ? explanation : 'Over-using generic <div> tags prevents AI from parsing the "Main Content" accurately.', remediation: hasLlmMessage ? remediation : 'Replace generic containers with <main>, <article>, and <section> tags.' }
      ]
    };
  }
}
