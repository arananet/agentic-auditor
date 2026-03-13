// Intelligent semantic analysis using Cloudflare Workers AI
export class LlmAnalyzer {
  static isConfigured(): boolean {
    return !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN;
  }

  static async analyzeSemantics(text: string, criteria: string): Promise<number> {
    if (!this.isConfigured()) {
      // Fallback: Advanced continuous density scoring (better than binary regex)
      const words = text.split(/\s+/).length;
      if (words < 10) return 0;
      
      const keywords = criteria.split(' ');
      let matches = 0;
      keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        matches += (text.match(regex) || []).length;
      });
      
      const density = matches / words;
      // Cap at 100, scale non-linearly
      return Math.min(100, Math.round((density * 1000) * 1.5));
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
              content: "You are an expert AI auditor evaluating website text for Generative Engine Optimization (GEO). Your job is to return ONLY a numeric score between 0 and 100 representing how well the text meets the criteria. DO NOT return any other text, JSON, or explanations. Only the number."
            },
            {
              role: "user",
              content: `Criteria: ${criteria}\n\nText to analyze: ${text.slice(0, 3000)}\n\nScore (0-100):`
            }
          ]
        })
      });

      if (!response.ok) {
        console.error(`LLM API Error: ${response.statusText}`);
        return 50; // Fallback score
      }

      const result = await response.json();
      const llmOutput = result?.result?.response?.trim();
      const score = parseInt(llmOutput, 10);

      if (isNaN(score)) {
        console.warn(`LLM returned non-numeric response: ${llmOutput}`);
        return 50;
      }

      return Math.max(0, Math.min(100, score));
    } catch (e) {
      console.warn('LLM analysis failed, falling back to heuristics.', e);
      return 50;
    }
  }
}
