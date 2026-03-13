import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';

export class A2aAudit implements IAuditStrategy {
  name = 'a2a';

  async execute({ baseUrl }: AuditContext): Promise<AuditResult> {
    let score = 0;
    let llmsText = "";
    try {
      const llmsRes = await fetch(`${baseUrl}/llms.txt`);
      if (llmsRes.ok) {
        llmsText = await llmsRes.text();
        if (llmsText.length > 100) score += 100;
      }
    } catch(e) {}

    let finalScore = score;
    let explanation = 'Agent-to-Agent (A2A) handshakes require standard API texts like llms.txt.';
    let remediation = 'Create a root /llms.txt summarizing the brand.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const systemPrompt = `Evaluate the following llms.txt file content for Agent-to-Agent (A2A) readiness. Score 100 if it contains clear brand instructions, links, and context for an AI agent. Score 0 if missing or unhelpful.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(llmsText.slice(0, 3000) || "No llms.txt found.", systemPrompt);
      if (llmResult) {
        finalScore = Math.round((finalScore * 0.2) + (llmResult.score * 0.8));
        explanation = `LLM Analysis: ${llmResult.explanation}`;
        remediation = llmResult.remediation;
        hasLlmMessage = true;
      }
    }

    return {
      score: finalScore,
      status: finalScore >= 75 ? 'READY' : finalScore >= 50 ? 'WARN' : 'FAILED',
      details: [
        { message: score === 100 ? 'Valid llms.txt found.' : 'Missing or empty llms.txt.', explanation: hasLlmMessage ? explanation : 'Agent-to-Agent (A2A) handshakes require standard API texts like llms.txt.', remediation: hasLlmMessage ? remediation : 'Create a root /llms.txt summarizing the brand.' }
      ]
    };
  }
}
