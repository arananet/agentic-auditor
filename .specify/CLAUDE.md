# Claude Agent Guide — Geo Agentic Auditor

## Project Summary
Next.js 14 GEO audit tool. Evaluates any public URL across 11 dimensions for readiness by generative AI engines (ChatGPT, Claude, Perplexity). Uses Playwright for rendering, Cheerio for parsing, and Cloudflare Workers AI (free tier) for LLM-accelerated scoring.

## Key Architectural Rules
- **Never use SSO / next-auth.** This is a public Cloudflare-stack app. Authentication is Cloudflare Turnstile only.
- **Never remove Turnstile.** Both `AuditForm.tsx` (client widget) and `route.ts` (server verification) must validate the token.
- **Keep Cloudflare Workers AI.** Do not substitute NesGen or any other LLM endpoint. The LLM backend is `@cf/meta/llama-3.1-8b-instruct` via REST + Bearer token.
- **LLM free tier cap.** Cloudflare Workers AI Free Tier = 10,000 neurons/day. The UI displays this limit in the hero section. `LlmAnalyzer` must degrade gracefully to heuristics on quota errors.
- **Strategy Pattern is mandatory.** All audit logic must live in `IAuditStrategy` implementations under `src/services/audits/`. No audit logic in `auditor.service.ts`.
- **Playwright singleton.** `fetchWithTimeout` owns the browser singleton. No audit strategy should launch its own browser. Plain-text resources use `fetchTextFile()` (native fetch, no browser).
- **Rate limits matter.** API route: 10 req/min per IP. LlmAnalyzer: 60 RPM queue. QueueManager: MAX_QUEUE_SIZE=50. CacheManager: MAX_CACHE_SIZE=200.

## File Map
| File | Role |
|---|---|
| `src/services/auditor.service.ts` | Orchestrates all audits, manages cache, emits live logs |
| `src/services/fetchWithTimeout.ts` | Playwright singleton; `fetchTextFile()` for plain text |
| `src/services/LlmAnalyzer.ts` | Cloudflare Workers AI caller with 60 RPM rate limiter |
| `src/services/QueueManager.ts` | Job queue singleton, URL dedup, live log storage |
| `src/services/CacheManager.ts` | LRU cache (200 entries max) |
| `src/services/audits/*.ts` | 11 IAuditStrategy implementations |
| `src/app/api/audit/route.ts` | POST (enqueue) + GET (poll) with SSRF + Turnstile + rate limit |
| `src/components/AuditForm.tsx` | Turnstile widget + URL input |
| `src/components/MetricsGrid.tsx` | 11-card grid with React state tooltips + source/location |
| `src/app/page.tsx` | Main page: live log polling, auto-scroll, print report |
| `cli/index.ts` | CLI batch auditor entry point |
| `cli/reporters/` | Markdown and PDF reporters |

## Environment Variables
```
TURNSTILE_SECRET_KEY=     # Cloudflare Turnstile secret
CF_AI_ACCOUNT_ID=         # Cloudflare account ID
CF_AI_API_TOKEN=          # Cloudflare API token (Workers AI:Read)
```

## Running Locally
```bash
npm install
npx playwright install chromium
npm run dev
```
