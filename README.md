# Geo Agentic Auditor 🥤

Geo Agentic Auditor is a deterministic, heuristics-based, and LLM-accelerated Generative Engine Optimization (GEO) scanner. It evaluates a website's readiness for next-generation AI agents, LLMs, and RAG pipelines using 11 dedicated metrics.

## Features

- **Heuristic + Semantic Scanning**: Employs continuous density scoring and structural parsing to mimic how search engines (GPTBot, ClaudeBot, Perplexity) see the web.
- **LLM Acceleration (Optional)**: Automatically upgrades from density heuristics to deep semantic NLP classification when configured with Cloudflare Workers AI.
- **Turnstile Protected**: Robust edge-level bot protection ensures the audit tool cannot be abused by automated scraping scripts.
- **Print-to-PDF**: Zero-dependency browser-native technical report generation tailored via `@media print` CSS.
- **SOLID Architecture**: Developed following strict object-oriented patterns using the Strategy Design Pattern.

## Architecture

This project is a Next.js application designed to run on scalable edge/serverless infrastructure. It utilizes `Cheerio` for high-performance DOM parsing without the overhead of heavy headless browsers (like Puppeteer/Playwright), making it lightning-fast and cost-effective.

## Getting Started

### 1. Prerequisites
- Node.js 18+
- npm or pnpm

### 2. Installation
```bash
git clone https://github.com/arananet/agentic-auditor.git
cd agentic-auditor
npm install
```

### 3. Configuration & Secrets

The application operates perfectly in "Heuristic Mode" without any API keys. However, for maximum accuracy, you can enable "Deep Semantic Engine" mode by configuring Cloudflare Workers AI credentials.

Create a `.env.local` file in the root directory (never commit this file). Add the following variables:

```env
# Optional: Cloudflare Workers AI for Deep Semantic Analysis
# Requires a Cloudflare account with Workers AI enabled
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here

# Required for Production: Cloudflare Turnstile Bot Protection
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here
```

**⚠️ Security Notice**: Never expose your `CLOUDFLARE_API_TOKEN` or `TURNSTILE_SECRET_KEY` in client-side code or commit them to a public repository. Always inject them via secure deployment environments (e.g., Vercel, Railway, Cloudflare Pages).

#### Benefits of Configuring the LLM:
Without an LLM, the Sentiment and Intent audits rely on lexical density analysis (word matching). With Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`), the auditor unlocks:
- **Nuanced Stance Analysis**: Understanding if language is authoritative versus passive.
- **Superior Intent Matching**: Accurately distinguishing conversational answers from standard marketing copy.
- **Entity Recognition**: Better interpretation of brand mentions and context.

### 4. Running Locally
```bash
npm run dev
```
Open `http://localhost:3000` to view the auditor.

## 11 GEO Metrics Evaluated

1.  **AI Citability**: Measures density of "Answer Blocks" (X is Y) and statistical evidence.
2.  **Technical Readiness**: Evaluates SSR/SSG vs CSR, and explicitly checks `robots.txt` for AI user-agents.
3.  **Schema Depth**: Detects structured `Organization`, `FAQPage`, and `Article` JSON-LD payloads.
4.  **A2A Handshakes**: Validates the presence of `llms.txt` or `ai.txt` files for direct agent communication.
5.  **Brand Mentions**: Analyzes outbound link authority (Wikipedia, LinkedIn) and "About Us" density.
6.  **Content Quality**: Checks for explicit authorship and freshness (timestamps).
7.  **Intent Match**: Evaluates if headings (`<h2>`, `<h3>`) are structured as conversational interrogatives.
8.  **Structural Integrity**: Counts AI-friendly HTML magnets like lists, tables, and semantic HTML5 tags.
9.  **Semantic Depth**: Evaluates lexical diversity and minimum context-window requirements.
10. **Media Context**: Calculates the ratio of descriptive (4+ word) alt-tags for Vision-Language Models (VLMs).
11. **Brand Sentiment**: Assesses authoritative vocabulary and brand trust markers.

## License

MIT License. See the `LICENSE` file for more details.

Developed with precision and teeth. 🥤
