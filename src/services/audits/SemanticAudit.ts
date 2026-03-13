import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class SemanticAudit implements IAuditStrategy {
  name = 'semantic';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const textLength = $('body').text().trim().replace(/\s+/g, ' ').length;
    const hasSufficientLength = textLength > 1500;
    
    // Continuous keyword density tracking
    const words = $('body').text().toLowerCase().split(/\W+/);
    const uniqueWords = new Set(words);
    const lexicalDiversity = Math.min(50, Math.floor((uniqueWords.size / words.length) * 100));
    
    const lengthScore = hasSufficientLength ? 50 : Math.floor((textLength / 1500) * 50);
    const totalScore = lengthScore + lexicalDiversity;

    return {
      score: totalScore,
      status: totalScore >= 75 ? 'READY' : totalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: lengthScore >= 40 ? 'Adequate semantic length.' : 'Content length too short.', explanation: 'LLMs require dense context windows to properly index an entity.', remediation: 'Ensure core landing pages exceed 300 words.' },
        { message: `Lexical Diversity Score: ${lexicalDiversity}/50`, explanation: 'High vocabulary diversity signals expert-level content rather than keyword stuffing.', remediation: 'Use synonyms and LSI (Latent Semantic Indexing) keywords natively.' }
      ]
    };
  }
}
