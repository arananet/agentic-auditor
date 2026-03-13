import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class SemanticAudit implements IAuditStrategy {
  name = 'semantic';

  async execute({ $ }: AuditContext): Promise<AuditResult> {
    const textLength = $('body').text().trim().replace(/\s+/g, ' ').length;
    const hasSufficientLength = textLength > 1500;
    
    const words = $('body').text().toLowerCase().split(/\W+/);
    const uniqueWords = new Set(words);
    const lexicalDiversity = Math.min(50, Math.floor((uniqueWords.size / words.length) * 100));
    
    const lengthScore = hasSufficientLength ? 50 : Math.floor((textLength / 1500) * 50);
    let totalScore = lengthScore + lexicalDiversity;
    let finalScore = totalScore;
    let explanation = 'High vocabulary diversity signals expert-level content rather than keyword stuffing.';
    let remediation = 'Use synonyms, deep industry terms, and LSI keywords natively.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the semantic depth and lexical diversity of the following text snippet. High scores (80-100) require expert-level vocabulary, deep context, and substantial topic coverage. Low scores (0-40) are given to repetitive, thin, generic, or keyword-stuffed text. Provide feedback on the semantic richness. Lexical Diversity Ratio: ${lexicalDiversity}%.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback($('body').text().replace(/\s+/g, ' ').slice(0, 3000), systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 40 ? 'WARN' : 'FAILED',
      details: [
        { message: lengthScore >= 40 ? 'Adequate semantic length.' : 'Content length too short.', explanation: hasLlmMessage ? explanation : 'LLMs require dense context windows to properly index an entity.', remediation: hasLlmMessage ? remediation : 'Ensure core landing pages exceed 300 words.' },
        { message: `Lexical Diversity Score: ${lexicalDiversity}/50`, explanation: hasLlmMessage ? explanation : 'High vocabulary diversity signals expert-level content rather than keyword stuffing.', remediation: hasLlmMessage ? remediation : 'Use synonyms and LSI (Latent Semantic Indexing) keywords natively.' }
      ]
    };
  }
}
