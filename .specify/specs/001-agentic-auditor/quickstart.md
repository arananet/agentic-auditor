# Quickstart

## Web App
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret key
   - `CF_AI_ACCOUNT_ID` — Cloudflare account ID for Workers AI
   - `CF_AI_API_TOKEN` — Cloudflare API token with Workers AI permissions
3. Install Playwright browsers: `npx playwright install chromium`
4. `npm run dev` — starts on http://localhost:3000

> **Note:** The app uses the Cloudflare Workers AI **Free Tier** (10,000 neurons/day). LLM-accelerated analysis (Sentiment, Intent) will fall back to heuristics once the daily quota is reached.

## CLI Batch Auditor
```bash
# Single URL, both Markdown + PDF output
npm run audit:cli -- --url https://www.example.com --output ./reports

# Batch from file, Markdown only
npm run audit:cli -- --urls-file cli/urls.example.txt --format md

# PDF only
npm run audit:cli -- --url https://www.example.com --format pdf
```

## Docker
```bash
docker build -t geo-auditor .
docker run -p 3000:3000 --env-file .env.local geo-auditor
```
