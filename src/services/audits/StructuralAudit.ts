import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class StructuralAudit implements IAuditStrategy {
  name = 'structural';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const listCount = $('ul, ol').length;
    const tableCount = $('table').length;
    const semanticTagCount = $('article, section, nav, aside, main, header, footer').length;

    // Continuous points system
    const listScore = Math.min(35, listCount * 5);
    const tableScore = Math.min(30, tableCount * 10);
    const semanticScore = Math.min(35, semanticTagCount * 5);
    
    const totalScore = listScore + tableScore + semanticScore;

    return {
      score: totalScore,
      status: totalScore >= 70 ? 'READY' : totalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: listCount > 0 || tableCount > 0 ? `Detected ${listCount} lists and ${tableCount} tables.` : 'Content is mostly flat text.', explanation: 'Lists and tables are "AI Magnets"—the highest signal structural elements.', remediation: 'Break up long paragraphs into bulleted lists or summary tables.' },
        { message: semanticTagCount >= 3 ? 'Clean semantic structure.' : 'Vague site structure.', explanation: 'Over-using generic <div> tags prevents AI from parsing the "Main Content" accurately.', remediation: 'Replace generic containers with <main>, <article>, and <section> tags.' }
      ]
    };
  }
}
