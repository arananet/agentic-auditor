# Research Document

## Cloudflare Workers AI Integration
- Validated `@cf/meta/llama-3.1-8b-instruct` for fast inference.
- Standard fetch with `Authorization: Bearer` to the REST API is the cleanest implementation for Next.js Route Handlers.
- **Free Tier:** 10,000 neurons/day. Each inference call consumes neurons proportional to token count. When the quota is exhausted, `LlmAnalyzer` returns an error and the auditor falls back to heuristic scoring automatically.

## Page Rendering Strategy: Playwright over Cheerio-only
- The original implementation used vanilla `fetch` + Cheerio for fast, serverless-compatible parsing.
- However, many enterprise sites require JavaScript execution to render meaningful content. Vanilla fetch returns blank or partial HTML.
- Selected **Playwright Chromium** (headless singleton) for page rendering. The rendered HTML is then parsed by Cheerio.
- A separate `fetchTextFile()` helper uses native `fetch` (no browser) for plain-text resources (robots.txt, llms.txt) where JavaScript execution is unnecessary.
- Playwright adds ~250 MB to the Docker image but is kept in `serverComponentsExternalPackages` so Next.js does not bundle it.

## Robots.txt Parsing
- The original implementation used a simplistic regex on the full file. This causes false positives/negatives for bots when a disallow rule appears in a different user-agent block.
- Replaced with a proper block-level parser (`parseRobotsBlocks` + `isBotAllowed`) that correctly handles multi-agent groups per RFC 9309.

## Lexical Diversity / Heaps' Law
- Measuring unique words across an entire long page unfairly penalises rich content (Heaps' law: vocabulary grows sub-linearly with corpus size).
- Fixed: lexical diversity is now measured on a 500-word sample window from the beginning of the body text.

## CLI Tooling
- `tsx` is used as the runtime for the CLI (no transpilation step needed). It is a dev dependency.
- The CLI reuses `AuditorService` directly, so it has full feature parity with the web app.
- PDF generation reuses Playwright (already a dependency) via a dynamic import to avoid loading the browser for `--format md`.

## AEO Citation Signals (Phase 5)
- **Princeton GEO paper (Aggarwal et al., KDD 2024):** Quantified GEO strategy lifts — sourced citations +40%, statistics +37%, expert quotes +30%, authoritative tone +25%, keyword stuffing −10%. The paper defines the academic foundation for the entire citability scoring model.
- **AEO snippet window (seoClarity):** Featured snippet extraction optimal window is 40–60 words — shorter than the GEO passage window (134–167w). Both windows are now tracked: `snippetPassageCount` for AEO, passage scoring for GEO.
- **Definition blocks:** First-paragraph definitions ("X is a Y that…") are a primary AEO extraction target. Detected via regex on `<p>` elements within 0–200 chars of the document start.
- **Sourced statistics:** Attributed numeric claims ("according to X, Y%…") signal evidentiary quality. Pattern: `/\d+\.?\d*\s*%.*?(according|source|study|report|research)/i` or equivalent.
- **Expert quotes:** Named-attribution quotes signal authoritative sourced content. Pattern: named person + quote verb + quotation marks.

## Content Freshness Recency (Phase 5)
- **SE Ranking (2025), 129K domain study:** Pages updated within 30 days are cited 3.2× more often by ChatGPT than older content.
- `article:modified_time` is the primary machine-readable freshness signal. Falls back to `article:published_time` if modified time is absent.
- Visible text patterns ("Last updated", "Updated on", "Modified", multilingual variants) are detected in `body.text()` as a secondary freshness signal.
- Freshness tiers: excellent (≤30 days, +8 pts), good (≤180 days, +5 pts), stale (>180 days, +2 pts), unknown (+0 pts). `modifiedTimeMeta` present gives an additional +2 pts.

## Keyword Stuffing Detection (Phase 5)
- Princeton GEO study (KDD 2024) found keyword stuffing reduces AI engine visibility by ~10%.
- Detection approach: after removing multilingual stopwords (EN/PT/ES/FR/DE/IT, ~200 tokens), compute per-word frequency over all content words. Any non-stopword exceeding 3% frequency is flagged.
- Top 5 overused terms are reported. `stuffingPenalty = min(10, overusedTerms.length × 3)` subtracted from `totalScore`, floored at 0.
- Stopword set is inlined (no external dependency) to keep the audit self-contained.

## Brand Authority: High-Weight Domains & Review Platforms (Phase 5)
- **Ahrefs (Dec 2025), 75K brands:** YouTube and Reddit carry highest AI citation weight among social platforms, followed by Wikipedia. These three are broken out as `highWeightDomains` and scored separately: +5 pts per link, capped at +10.
- **Third-party review platforms** (G2, Capterra, TrustRadius, Trustpilot, Quora, Medium, ProductHunt, Yelp, BBB, SiteJabber): reviewed as strong external social proof for AI credibility assessment. +3 pts per link, capped at +5.
- `socialScore` cap reduced from 40 to 30 to accommodate the new bonus categories without inflating the composite beyond 100.

## UI Categorisation (Phase 5)
- Flat `MetricsGrid` replaced with `CategorizedResults` which groups the 11 metrics by implementation effort.
- **Quick Win** (green): metrics fixable with config/files alone — Technical (robots.txt, sitemaps, canonical) and A2A (llms.txt, agent.json).
- **Editorial** (amber): metrics requiring content/copy changes — Citability, ContentQuality, IntentMatch, Semantic, Sentiment, BrandMentions, Media.
- **Development** (blue): metrics requiring structural/code changes — Schema (JSON-LD), Structural (HTML semantics, FAQ, tables).
- The same category structure is reflected in the print PDF report, with effort level noted per section.
