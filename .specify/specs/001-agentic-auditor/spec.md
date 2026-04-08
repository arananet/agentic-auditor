# 🎯 Geo Agentic Auditor - Specification

## Core Requirements
Develop a fast, headless-browser-powered, continuous heuristic and LLM-accelerated auditing tool designed specifically to evaluate website readiness for Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO). Results are grouped into three effort tiers for actionable prioritisation.

## Features
- **Deterministic Heuristics:** The system must use Cheerio to parse DOM elements (lists, tables, schema, meta tags) to generate continuous density scores rather than binary outcomes.
- **Playwright Rendering:** All page fetches use a Playwright headless Chromium singleton to capture fully-rendered HTML, defeating JavaScript-heavy sites and bot-detection walls.
- **LLM Acceleration:** When Cloudflare Workers AI is configured, the system upgrades from heuristics to deep semantic analysis using `@cf/meta/llama-3.1-8b-instruct` for intent and sentiment evaluation.
- **Rate Limiting:** LLM calls are serialised by a 60 RPM queue-based scheduler inside `LlmAnalyzer`. The API route enforces 10 req/min per IP.
- **Live Log Streaming:** Each audit emits per-strategy progress lines (`[SCAN]`, `[OK]`, `[WARN]`, `[FAIL]`) stored in `Job.log[]` and polled by the UI every 3 s.
- **Client-Side Export:** High-fidelity Print-to-PDF technical report organised by effort category, stamped filename (`GEO_Audit_<host>_<ts>`) directly from the browser.
- **CLI Batch Auditor:** `tsx cli/index.ts` — accepts `--url` or `--urls-file`, outputs `.md` and/or `.pdf` reports locally.
- **Bot Protection:** Cloudflare Turnstile verification on both frontend and backend prevents abuse.
- **SSRF Protection:** Backend validates that submitted URLs are public `http(s)://` URLs, blocking localhost, RFC-1918 ranges, and cloud metadata endpoints.
- **LRU Cache:** `CacheManager` caps at 200 entries, evicting expired entries first then oldest-first.
- **Categorized Results UI:** `CategorizedResults` component groups the 11 metrics into three effort tiers with animated header cards — **Quick Win** (Technical, A2A), **Editorial** (Citability, Brand, ContentQuality, IntentMatch, Semantic, Sentiment, Media), **Development** (Schema, Structural).

## Audit Signal Inventory (current)

### AI Citability
- Answer-block density (X is Y patterns)
- Passage-length scoring (optimal 134–167 words per GEO paper; AEO snippet window 40–60 words)
- `snippetPassageCount` — 40–60 word self-contained passages
- `sourcedStatCount` — attributed statistics ("X% of…", "according to…")
- `expertQuoteCount` — named expert quotes
- `hasDefinitionBlock` — first-paragraph definition sentence
- `evidenceScore` composite: `min(15, sourcedStatCount×5) + min(10, expertQuoteCount×5) + definitionBonus(5) + snippetBonus(min 5)`

### Content E-E-A-T
- Author metadata, publish date, word count
- Meta description (50–300 chars), Open Graph tags (4 properties), `<time datetime>` ISO 8601
- `article:modified_time` freshness recency: excellent (≤30d +8pts), good (≤180d +5pts), stale (+2pts)
- Visible "Last updated" / "Last modified" text detection (`hasVisibleUpdateDate` +5pts)
- `modifiedTimeMeta` present bonus (+2pts)

### Structural GEO
- Lists, tables, semantic HTML5, `<details>`/`<summary>`, table header semantics (`<thead>`, `<th scope>`)
- `faqHeadingCount` — headings matching FAQ/Q&A patterns
- `questionHeadingCount` — headings phrased as natural-language questions (How/What/Why/When/Which/Can/Is/Are/Do/Does)
- `comparisonTableCount` — tables containing comparison keywords (vs/versus/compare/pros/cons/features/pricing)
- `faqBonus = min(10, faqHeadingCount×5 + questionHeadingCount×2)`, `comparisonBonus = min(5, comparisonTableCount×5)`

### Semantic Depth
- Lexical diversity (500-word Heaps'-law-safe sample window)
- Content length vs 1,500-word threshold
- Keyword stuffing detection: non-stopword frequency >3% flags stuffing; `stuffingPenalty = min(10, overusedTerms×3)`; multilingual stopword list (EN/PT/ES/FR/DE/IT)

### Brand Authority
- Outbound authority links across 25+ platforms (social + professional + messaging)
- `highWeightDomains` = [wikipedia.org, reddit.com, youtube.com] — `highWeightBonus = min(10, highWeightLinks×5)`
- `thirdPartyReviewDomains` = [g2.com, capterra.com, trustradius.com, trustpilot.com, quora.com, medium.com, producthunt.com, yelp.com, bbb.org, sitejabber.com] — `reviewBonus = min(5, reviewLinks×3)`
- `socialScore = min(30, totalSocialProof×6)` (was 40)
- About/Contact/Trust page detection (language-aware: EN/PT/ES/FR/DE/IT)

## Technical Stack
- Next.js 14 (Route Handlers, Server Components)
- Playwright Chromium (headless page rendering)
- Cloudflare Workers AI (Llama-3.1-8b) — **Free Tier: 10,000 neurons/day**
- TailwindCSS + Framer Motion
- Cheerio (DOM parsing after Playwright render)
- tsx (CLI runner)

## Free-Tier Notice
The application uses Cloudflare Workers AI on the **Free Tier**, which provides 10,000 neurons per day. Once the daily quota is exhausted, LLM-accelerated audits (Sentiment, Intent) fall back to heuristic scoring automatically.
