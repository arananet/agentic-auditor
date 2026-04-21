export interface LlmResult {
  score: number;
  explanation: string;
  remediation: string;
}

// ---------------------------------------------------------------------------
// Rate limiter: max 60 requests per minute (1 per second minimum gap)
// A global queue serialises all LLM calls so bursts from concurrent audits
// never exceed the Cloudflare AI endpoint limit.
// ---------------------------------------------------------------------------
const RATE_LIMIT_RPM = 60;
const MIN_INTERVAL_MS = Math.ceil(60_000 / RATE_LIMIT_RPM); // 1000 ms

let lastCallAt = 0;
let rateLimitQueue = Promise.resolve();

// ── Swarm concurrency tracking ──────────────────────────────────────────
let activeSlots = 0;
let peakSlots = 0;

/** Returns { activeCalls, peakConcurrent } for the Agent Swarm Monitor. */
export function swarmStats() {
  return { activeCalls: activeSlots, peakConcurrent: peakSlots };
}

/** Reset peak counter — call at the start of each audit run. */
export function resetSwarmStats() {
  activeSlots = 0;
  peakSlots = 0;
}

function scheduleCall<T>(fn: () => Promise<T>): Promise<T> {
  rateLimitQueue = rateLimitQueue.then(async () => {
    const now = Date.now();
    const wait = MIN_INTERVAL_MS - (now - lastCallAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCallAt = Date.now();
  });

  // We chain the actual work after the rate-limit delay, but return its result
  // independently so callers get their own promise.
  return new Promise<T>((resolve, reject) => {
    rateLimitQueue = rateLimitQueue.then(() => {
      activeSlots++;
      if (activeSlots > peakSlots) peakSlots = activeSlots;
      return fn()
        .then(resolve, reject)
        .finally(() => { activeSlots--; });
    });
  });
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

    return scheduleCall(() => this._doFetch(text, systemPrompt));
  }

  private static async _doFetch(text: string, systemPrompt: string): Promise<LlmResult | null> {
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
