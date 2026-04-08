# Tasks: Geo Agentic Auditor

## Phase 1: Setup & Constitution
- [x] Scaffold Next.js application.
- [x] Configure TailwindCSS and dark/amber theme.
- [x] Create `.specify/memory/constitution.md` based on SOLID principles.

## Phase 2: Core Heuristic Engine
- [x] Implement `IAuditStrategy` interface.
- [x] Build 11 deterministic auditing strategies.
- [x] Implement concurrent execution via `Promise.all` in `auditor.service.ts`.

## Phase 3: Cloudflare & LLM Integration
- [x] Integrate Cloudflare Turnstile bot protection on frontend/backend.
- [x] Implement `LlmAnalyzer.ts` utilising `@cf/meta/llama-3.1-8b-instruct` API.
- [x] Override heuristic scoring for Sentiment and Intent audits when LLM is active.

## Phase 4: Architecture Hardening & v2 Features
- [x] Replace `fetch` with Playwright headless Chromium singleton (`fetchWithTimeout.ts`).
- [x] Add `fetchTextFile()` helper for plain-text files (robots.txt, llms.txt) — no browser overhead.
- [x] Add 60 RPM rate-limiter queue in `LlmAnalyzer`.
- [x] Add `MAX_CACHE_SIZE=200` LRU cap in `CacheManager`.
- [x] Add `Job.log[]` live streaming in `QueueManager`; `onLog` callback in `AuditorService`.
- [x] Add `AuditSource` interface and `source`/`location` optional fields to `AuditFinding`.
- [x] Harden `TechnicalAudit` with full robots.txt block parser and 16 AI crawler tokens.
- [x] Extend `SchemaAudit` to 14 priority schema types with recursive `extractTypes()` and microdata.
- [x] Improve `CitabilityAudit` with passage-length scoring (134–167 words optimal window).
- [x] Extend `A2aAudit` to check `llms-full.txt` and `agent.json` in addition to `llms.txt`.
- [x] Extend `BrandMentionsAudit` authority domains to 12 + social/trust marker detection.
- [x] Fix `SemanticAudit` lexical diversity with 500-word Heaps'-law-safe sampling window.
- [x] Fix `SentimentAudit` heuristic baseline (removed `+50` offset).
- [x] Fix `ContentQualityAudit` word count to use `<main>/<article>` only.
- [x] Add SSRF protection and per-IP rate limiting to API route.
- [x] Upgrade `MetricsGrid` to React `useState` tooltip pattern with source/location display.
- [x] Add live log streaming + auto-scroll + `knownLogCountRef` dedup to `page.tsx`.
- [x] Add Cloudflare Workers AI Free Tier notice (10,000 neurons/day) to hero section.
- [x] Add `printReport()` filename stamping (`GEO_Audit_<host>_<ts>`).
- [x] Create CLI batch auditor (`cli/index.ts`) with Markdown and PDF reporters.

## Phase 5: AEO/GEO Signal Enrichment & UI Categorisation
- [x] `CitabilityAudit` — Add `snippetPassageCount` (40–60w passages), `sourcedStatCount`, `expertQuoteCount`, `hasDefinitionBlock`; compute `evidenceScore`, `definitionBonus`, `snippetBonus`; add 3 new detail entries; update LLM systemPrompt with Princeton GEO stats.
- [x] `ContentQualityAudit` — Add `modifiedTimeMeta`, `publishTimeMeta`, `freshnessLevel` recency classification; add `hasVisibleUpdateDate` regex; rescale scoring weights; add freshness detail entry; update LLM systemPrompt with SE Ranking stat.
- [x] `StructuralAudit` — Add `faqHeadingCount`, `questionHeadingCount`, `comparisonTableCount` detection; recalibrate score caps; update `structureContext` and `systemPrompt`; add FAQ and comparison detail entries.
- [x] `SemanticAudit` — Add multilingual stopword set; compute `wordFreq`, `topOverusedWords`, `isKeywordStuffed`, `stuffingPenalty`; apply penalty to `totalScore`; add stuffing detail entry; update LLM systemPrompt.
- [x] `BrandMentionsAudit` — Add `thirdPartyReviewDomains`, `highWeightDomains`; merge into `allTrackDomains`; compute `highWeightLinks`, `reviewLinks`, `highWeightBonus`, `reviewBonus`; recalibrate `socialScore` to max 30; add 2 new detail entries; update LLM context and systemPrompt.
- [x] `CategorizedResults.tsx` — New component; exports `CATEGORY_DEFS`, `MetricItem`, `CategoryGroup`; renders 3 animated category cards with effort badges and per-metric score/status rows.
- [x] `MetricsGrid.tsx` — Update location indicator icon `⚆` → `⦿`.
- [x] `page.tsx` — Import `CategorizedResults`/`CATEGORY_DEFS`/`MetricItem`/`CategoryGroup`; type `metricsData` as `MetricItem[]`; update all 11 metric descriptions; compute `metricsMap` + `categoryGroups`; replace `<MetricsGrid>` with `<CategorizedResults categories={categoryGroups} />`; update print PDF section to loop by `categoryGroups` with effort level output.
- [x] Ko-fi support button added inline to footer alongside credit line.
