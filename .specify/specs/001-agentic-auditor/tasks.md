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
- [x] Implement `LlmAnalyzer.ts` utilizing `llama-3.1-8b-instruct` API.
- [x] Override heuristic scoring for Sentiment and Intent audits when LLM is active.
