import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';
import { fetchTextFile } from '../fetchWithTimeout';

export class A2aAudit implements IAuditStrategy {
  name = 'a2a';

  async execute({ baseUrl }: AuditContext): Promise<AuditResult> {
    let llmsScore = 0;
    let llmsText = "";
    let llmsFullText = "";
    let agentJson = "";
    const findings: string[] = [];

    // 1. /llms.txt — plain text, no JS rendering needed
    try {
      const text = await fetchTextFile(`${baseUrl}/llms.txt`, 10000);
      if (text.length > 100 && !text.toLowerCase().includes('<!doctype')) {
        llmsText = text;
        llmsScore += 40;
        findings.push('Valid llms.txt found.');
      }
    } catch(e) {}

    // 2. /llms-full.txt (2026 extended format)
    try {
      const text = await fetchTextFile(`${baseUrl}/llms-full.txt`, 10000);
      if (text.length > 200 && !text.toLowerCase().includes('<!doctype')) {
        llmsFullText = text;
        llmsScore += 30;
        findings.push('Extended llms-full.txt found.');
      }
    } catch(e) {}

    // 3. /.well-known/agent.json (A2A protocol 2026)
    try {
      const text = await fetchTextFile(`${baseUrl}/.well-known/agent.json`, 10000);
      if (text.startsWith('{') && text.length > 20) {
        agentJson = text;
        llmsScore += 30;
        findings.push('A2A agent.json discovered.');
      }
    } catch(e) {}

    let finalScore = Math.min(100, llmsScore);
    let explanation = 'Agent-to-Agent (A2A) protocols require llms.txt, llms-full.txt, and agent.json for AI discovery.';
    let remediation = 'Create /llms.txt, /llms-full.txt, and /.well-known/agent.json for full A2A readiness.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const a2aContext = `llms.txt (${llmsText.length} chars): ${llmsText.slice(0, 800)}. llms-full.txt (${llmsFullText.length} chars): ${llmsFullText.slice(0, 800)}. agent.json: ${agentJson.slice(0, 800)}`;
      const systemPrompt = `Evaluate the A2A (Agent-to-Agent) readiness for GEO 2026. The three key files are: 1) /llms.txt — a concise brand summary for LLMs. 2) /llms-full.txt — a detailed version with full product/service context. 3) /.well-known/agent.json — a structured manifest for AI agent discovery. Score 100 if all three exist with quality content. Score 0 if none exist.`;
      const llmResult = await LlmAnalyzer.analyzeWithFeedback(a2aContext, systemPrompt);
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
        { message: llmsText ? 'Valid llms.txt found.' : 'Missing or empty llms.txt.', explanation: hasLlmMessage ? explanation : 'llms.txt provides a concise brand summary for AI ingestion.', remediation: hasLlmMessage ? remediation : 'Create /llms.txt summarizing your brand for LLMs.', source: { label: 'llmstxt.org – LLM Text Standard', url: 'https://llmstxt.org' }, location: `${baseUrl}/llms.txt` },
        { message: llmsFullText ? 'Extended llms-full.txt found.' : 'Missing llms-full.txt.', explanation: hasLlmMessage ? explanation : 'llms-full.txt provides detailed product/service context for deep AI analysis.', remediation: hasLlmMessage ? remediation : 'Create /llms-full.txt with detailed brand, product, and service information.', source: { label: 'llmstxt.org – LLM Text Standard', url: 'https://llmstxt.org' }, location: `${baseUrl}/llms-full.txt` },
        { message: agentJson ? 'A2A agent.json discovered.' : 'Missing /.well-known/agent.json.', explanation: hasLlmMessage ? explanation : 'agent.json is the 2026 A2A discovery manifest for AI agents.', remediation: hasLlmMessage ? remediation : 'Create /.well-known/agent.json with agent capabilities and contact endpoints.', source: { label: 'Google A2A Protocol', url: 'https://google.github.io/A2A/' }, location: `${baseUrl}/.well-known/agent.json` }
      ]
    };
  }
}
