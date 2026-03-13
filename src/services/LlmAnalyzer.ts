export interface LlmResult {
  score: number;
  explanation: string;
  remediation: string;
}

// Intelligent semantic analysis using Cloudflare Workers AI
export class LlmAnalyzer {
  static isConfigured(): boolean {
    return !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN;
  }

  static async analyzeSemantics(text: string, systemPrompt: string): Promise<number> {
    const res = await this.analyzeWithFeedback(text, systemPrompt);
    return res ? res.score : 50;
  }

  static async analyzeWithFeedback(text: string, systemPrompt: string): Promise<LlmResult | null> {
    if (!this.isConfigured()) return null;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `${systemPrompt}\n\nYou MUST return your response as a valid JSON object containing EXACTLY three keys: "score" (a number between 0 and 100), "explanation" (a short string explaining the score), and "remediation" (a short string with actionable advice to improve). DO NOT return any markdown formatting, backticks, or conversational text. Return ONLY the raw JSON object.`
            },
            {
              role: "user",
              content: `Text to analyze:\n\n${text.slice(0, 3000)}`
            }
          ]
        })
      });

      if (!response.ok) {
        console.error(`LLM API Error: ${response.statusText}`);
        return null;
      }

      const result = await response.json();
      let llmOutput = result?.result?.response?.trim() || "";
      
      // Clean potential markdown blocks
      if (llmOutput.startsWith('```json')) {
        llmOutput = llmOutput.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (llmOutput.startsWith('```')) {
        llmOutput = llmOutput.replace(/^```/, '').replace(/```$/, '').trim();
      }

      const parsed = JSON.parse(llmOutput);
      
      return {
        score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 50,
        explanation: parsed.explanation || 'Analyzed via Deep Semantic Engine.',
        remediation: parsed.remediation || 'Enhance semantic depth and intent match.'
      };
    } catch (e) {
      console.warn('LLM feedback analysis failed.', e);
      return null;
    }
  }
}
