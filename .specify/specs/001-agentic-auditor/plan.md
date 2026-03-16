# 📋 Geo Agentic Auditor - Implementation Plan

## Phase 1: Foundation (Completed)
- Set up Next.js app structure.
- Scaffold the 11 GEO metrics.
- Implement the UI/UX dark/amber theme and Print-to-PDF.

## Phase 2: Architecture Upgrade (Completed)
- Implement SOLID principles using the Strategy Pattern for the 11 audits (`IAuditStrategy`).
- Move from binary scoring to continuous density scoring.
- Integrate caching (`CacheManager`) and concurrent execution.

## Phase 3: LLM Integration & Spec-Kit Alignment (Completed)
- [x] Configure Cloudflare Workers AI API calls for `@cf/meta/llama-3.1-8b-instruct`.
- [x] Bootstrap correct `.specify` Spec-Kit directory structure.
- [x] Tailored system prompts for Sentiment and Intent LLM use-cases.

## Phase 4: Security, Performance & CLI (Completed)
- [x] Playwright headless rendering replacing vanilla fetch.
- [x] LLM rate-limiter (60 RPM), LRU cache cap (200 entries).
- [x] API route hardening: SSRF protection, per-IP rate limiting (10 req/min).
- [x] Live log streaming from audit strategies to the UI (3-second poll interval).
- [x] Enhanced audit logic across all 11 strategies (sources, locations, improved scoring).
- [x] CLI batch auditor with Markdown and Playwright-rendered PDF outputs.
- [x] Cloudflare Workers AI Free Tier notice visible on the UI (10,000 neurons/day cap).
