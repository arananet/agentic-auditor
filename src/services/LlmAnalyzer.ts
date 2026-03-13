// Intelligent semantic analysis using Cloudflare Workers AI
export class LlmAnalyzer {
  static isConfigured(): boolean {
    return !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN;
  }

  static async analyzeSemantics(text: string, systemPrompt: string): Promise<number> {
    if (!this.isConfigured()) {
      // Fallback: This path shouldn't be called if not configured, but just in case
      return 50; 
    }

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
              content: `${systemPrompt}\n\nYour job is to return ONLY a numeric score between 0 and 100 representing how well the text meets the criteria. DO NOT return any other text, JSON, conversational fluff, or explanations. Only output the raw number.`
            },
            {
              role: "user",
              content: `Text to analyze:\n\n${text.slice(0, 3000)}\n\nScore (0-100):`
            }
          ]
        })
      });

      if (!response.ok) {
        console.error(`LLM API Error: ${response.statusText}`);
        return 50; // Fallback score
      }

      const result = await response.json();
      const llmOutput = result?.result?.response?.trim() || "";
      // Strip any non-numeric characters just in case the LLM is chatty
      const numericMatch = llmOutput.match(/\d+/);
      const score = numericMatch ? parseInt(numericMatch[0], 10) : NaN;

      if (isNaN(score)) {
        console.warn(`LLM returned non-numeric response: ${llmOutput}`);
        return 50;
      }

      return Math.max(0, Math.min(100, score));
    } catch (e) {
      console.warn('LLM analysis failed.', e);
      return 50;
    }
  }
}
