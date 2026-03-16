# 🎯 Geo Agentic Auditor - Specification

## Core Requirements
Develop a fast, headless-browser-powered, continuous heuristic and LLM-accelerated auditing tool designed specifically to evaluate website readiness for Generative Engine Optimization (GEO).

## Features
- **Deterministic Heuristics:** The system must use Cheerio to parse DOM elements (lists, tables, schema, meta tags) to generate continuous density scores rather than binary outcomes.
- **Playwright Rendering:** All page fetches use a Playwright headless Chromium singleton to capture fully-rendered HTML, defeating JavaScript-heavy sites and bot-detection walls.
- **LLM Acceleration:** When Cloudflare Workers AI is configured, the system upgrades from heuristics to deep semantic analysis using `@cf/meta/llama-3.1-8b-instruct` for intent and sentiment evaluation.
- **Rate Limiting:** LLM calls are serialised by a 60 RPM queue-based scheduler inside `LlmAnalyzer`. The API route enforces 10 req/min per IP.
- **Live Log Streaming:** Each audit emits per-strategy progress lines (`[SCAN]`, `[OK]`, `[WARN]`, `[FAIL]`) stored in `Job.log[]` and polled by the UI every 3 s.
- **Client-Side Export:** High-fidelity Print-to-PDF technical report with a stamped filename (`GEO_Audit_<host>_<ts>`) directly from the browser.
- **CLI Batch Auditor:** `tsx cli/index.ts` — accepts `--url` or `--urls-file`, outputs `.md` and/or `.pdf` reports locally.
- **Bot Protection:** Cloudflare Turnstile verification on both frontend and backend prevents abuse.
- **SSRF Protection:** Backend validates that submitted URLs are public `http(s)://` URLs, blocking localhost, RFC-1918 ranges, and cloud metadata endpoints.
- **LRU Cache:** `CacheManager` caps at 200 entries, evicting expired entries first then oldest-first.

## Technical Stack
- Next.js 14 (Route Handlers, Server Components)
- Playwright Chromium (headless page rendering)
- Cloudflare Workers AI (Llama-3.1-8b) — **Free Tier: 10,000 neurons/day**
- TailwindCSS + Framer Motion
- Cheerio (DOM parsing after Playwright render)
- tsx (CLI runner)

## Free-Tier Notice
The application uses Cloudflare Workers AI on the **Free Tier**, which provides 10,000 neurons per day. Once the daily quota is exhausted, LLM-accelerated audits (Sentiment, Intent) fall back to heuristic scoring automatically.
