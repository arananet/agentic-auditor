import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';
import { LlmAnalyzer } from '../LlmAnalyzer';
import { fetchTextFile } from '../fetchWithTimeout';

export class A2aAudit implements IAuditStrategy {
  name = 'a2a';

  async execute({ baseUrl, $ }: AuditContext): Promise<AuditResult> {
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
        llmsScore += 35;
        findings.push('Valid llms.txt found.');
      }
    } catch(e) {}

    // 1b. llms.txt structural validation per llmstxt.org spec
    let llmsTxtStructure = { hasH1: false, hasBlurb: false, hasH2Sections: false, hasLinks: false };
    const llmsTxtIssues: string[] = [];
    if (llmsText) {
      const lines = llmsText.split('\n');
      const h1Match = lines.find(l => /^#\s+\S/.test(l));
      llmsTxtStructure.hasH1 = !!h1Match;
      if (!h1Match) llmsTxtIssues.push('Missing H1 title (# Title)');

      // Blurb: first non-empty, non-heading line after H1
      const h1Index = h1Match ? lines.indexOf(h1Match) : -1;
      if (h1Index >= 0) {
        const afterH1 = lines.slice(h1Index + 1).find(l => l.trim().length > 0 && !/^#/.test(l));
        llmsTxtStructure.hasBlurb = !!afterH1 && afterH1.trim().length >= 20;
        if (!llmsTxtStructure.hasBlurb) llmsTxtIssues.push('Missing blurb paragraph after H1');
      }

      // H2 sections
      const h2Lines = lines.filter(l => /^##\s+\S/.test(l));
      llmsTxtStructure.hasH2Sections = h2Lines.length > 0;
      if (!llmsTxtStructure.hasH2Sections) llmsTxtIssues.push('Missing H2 section headings (## Section)');

      // Links (markdown link format)
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/;
      llmsTxtStructure.hasLinks = lines.some(l => linkPattern.test(l));
      if (!llmsTxtStructure.hasLinks) llmsTxtIssues.push('Missing link lists ([Label](URL))');

      // Bonus for well-structured llms.txt
      const structureCount = [llmsTxtStructure.hasH1, llmsTxtStructure.hasBlurb, llmsTxtStructure.hasH2Sections, llmsTxtStructure.hasLinks].filter(Boolean).length;
      llmsScore += Math.min(5, structureCount * 1);
    }

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
        llmsScore += 20;
        findings.push('A2A agent.json discovered.');
      }
    } catch(e) {}

    // 4. RSL 1.0 licensing (/.well-known/rsl.xml)
    let hasRsl = false;
    try {
      const text = await fetchTextFile(`${baseUrl}/.well-known/rsl.xml`, 10000);
      if (text.length > 50 && (text.includes('<rsl') || text.includes('<?xml'))) {
        hasRsl = true;
        llmsScore += 5;
        findings.push('RSL 1.0 licensing found.');
      }
    } catch(e) {}

    // 5. AI-specific meta robots tags
    const aiMetaRobots = $ ? ($('meta[name="robots"]').attr('content') || '') : '';
    const hasAiMetaDirectives = /\b(noai|noimageai)\b/i.test(aiMetaRobots);
    // Also check for explicit AI opt-in/opt-out in individual meta tags
    const hasAiMetaTag = $ ? ($('meta[name="robots"][content*="noai"], meta[name="robots"][content*="noimageai"]').length > 0) : false;

    // 6. X-Robots-Tag AI-specific headers (check via HEAD request)
    let xRobotsTagAi = '';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const headRes = await fetch(baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GEO-Auditor/1.0)' },
      });
      clearTimeout(timer);
      const xRobots = headRes.headers.get('x-robots-tag') || '';
      if (/\b(noai|noimageai)\b/i.test(xRobots)) {
        xRobotsTagAi = xRobots;
      }
    } catch(e) {}

    // Track AI content rights signals
    const aiLicensingSignals = [hasRsl, hasAiMetaDirectives || hasAiMetaTag, xRobotsTagAi.length > 0].filter(Boolean).length;

    let finalScore = Math.min(100, llmsScore);
    let explanation = 'Agent-to-Agent (A2A) protocols require llms.txt, llms-full.txt, and agent.json for AI discovery.';
    let remediation = 'Create /llms.txt, /llms-full.txt, and /.well-known/agent.json for full A2A readiness.';
    let hasLlmMessage = false;

    if (LlmAnalyzer.isConfigured()) {
      const a2aContext = `llms.txt (${llmsText.length} chars): ${llmsText.slice(0, 800)}. llms-full.txt (${llmsFullText.length} chars): ${llmsFullText.slice(0, 800)}. agent.json: ${agentJson.slice(0, 800)}. llms.txt structure: H1=${llmsTxtStructure.hasH1}, blurb=${llmsTxtStructure.hasBlurb}, H2 sections=${llmsTxtStructure.hasH2Sections}, links=${llmsTxtStructure.hasLinks}. Issues: ${llmsTxtIssues.join('; ') || 'None'}. RSL 1.0: ${hasRsl}. AI meta robots: ${aiMetaRobots || 'None'}. X-Robots-Tag AI: ${xRobotsTagAi || 'None'}.`;
      const systemPrompt = `Evaluate the A2A (Agent-to-Agent) readiness for GEO 2026. The key files are: 1) /llms.txt — a concise brand summary for LLMs, must follow llmstxt.org spec: H1 title, blurb paragraph, H2 sections with link lists. 2) /llms-full.txt — detailed version. 3) /.well-known/agent.json — AI agent discovery manifest. 4) /.well-known/rsl.xml — RSL 1.0 AI content licensing. Also evaluate AI content rights signals: meta name="robots" with noai/noimageai, X-Robots-Tag headers. Score 100 if all exist with quality content. Score 0 if none exist.`;
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
        ...(llmsText ? [{
          message: llmsTxtIssues.length === 0 ? 'llms.txt follows llmstxt.org spec structure (H1, blurb, H2 sections, links).' : `llms.txt structure issues: ${llmsTxtIssues.join('; ')}.`,
          explanation: hasLlmMessage ? explanation : 'A well-structured llms.txt must follow the llmstxt.org spec: H1 title, single blurb paragraph, H2 section groups with markdown link lists. Presence alone is a weak signal; malformed llms.txt is common.',
          remediation: hasLlmMessage ? remediation : 'Structure your llms.txt with: # Brand Name (H1), a brief description paragraph, then ## Sections with - [Link Label](URL) lists.',
          source: { label: 'llmstxt.org – Specification', url: 'https://llmstxt.org' },
          location: `${baseUrl}/llms.txt — structure validation`
        }] : []),
        { message: llmsFullText ? 'Extended llms-full.txt found.' : 'Missing llms-full.txt.', explanation: hasLlmMessage ? explanation : 'llms-full.txt provides detailed product/service context for deep AI analysis.', remediation: hasLlmMessage ? remediation : 'Create /llms-full.txt with detailed brand, product, and service information.', source: { label: 'llmstxt.org – LLM Text Standard', url: 'https://llmstxt.org' }, location: `${baseUrl}/llms-full.txt` },
        { message: agentJson ? 'A2A agent.json discovered.' : 'Missing /.well-known/agent.json.', explanation: hasLlmMessage ? explanation : 'agent.json is the 2026 A2A discovery manifest for AI agents.', remediation: hasLlmMessage ? remediation : 'Create /.well-known/agent.json with agent capabilities and contact endpoints.', source: { label: 'Google A2A Protocol', url: 'https://google.github.io/A2A/' }, location: `${baseUrl}/.well-known/agent.json` },
        { message: hasRsl ? 'RSL 1.0 licensing detected (/.well-known/rsl.xml).' : 'No RSL 1.0 licensing found.', explanation: hasLlmMessage ? explanation : 'RSL 1.0 (Responsible Source Licensing) at /.well-known/rsl.xml is the emerging AI content opt-in/opt-out signal AI crawlers will honor post-2026.', remediation: hasLlmMessage ? remediation : 'Create /.well-known/rsl.xml to declare your AI content licensing preferences.', source: { label: 'RSL 1.0 – Responsible Source Licensing', url: 'https://responsiblesourcelicensing.org/' }, location: `${baseUrl}/.well-known/rsl.xml` },
        { message: hasAiMetaDirectives || xRobotsTagAi ? `AI content rights signals detected: ${hasAiMetaDirectives ? 'meta robots noai/noimageai' : ''}${xRobotsTagAi ? ` X-Robots-Tag: ${xRobotsTagAi}` : ''}.` : 'No AI-specific robots directives found (noai, noimageai).', explanation: hasLlmMessage ? explanation : 'meta name="robots" content="noai, noimageai" and X-Robots-Tag AI-specific headers are emerging opt-in/opt-out signals for AI crawlers. Sites should explicitly declare their AI content policy.', remediation: hasLlmMessage ? remediation : 'If opting out of AI training: add <meta name="robots" content="noai, noimageai">. If opting in: ensure no conflicting signals. Configure X-Robots-Tag header for server-level control.', source: { label: 'AI Content Rights – Meta robots directives', url: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag' }, location: '<meta name="robots"> / X-Robots-Tag HTTP header' }
      ]
    };
  }
}
