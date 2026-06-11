# 🧠 Agent Memory Layer — Specification

## Core Requirement
Give the agent mesh (15 `IAuditStrategy` agents) and the Oracle a **durable memory** so the
system can remember past audits, surface trends, capture feedback, and — over time — calibrate
its own governance rules. Memory must improve the product **without breaking reproducibility**:
a single audit, scored under a pinned ruleset version, must stay deterministic.

## Goals
- **Remember** every completed audit (per-dimension scores, overall score, timestamp) keyed by URL.
- **Diff** each new audit against the previous one for the same URL (trend, improved/regressed dimensions).
- **Capture feedback** on individual findings (`agree`/`disagree`) via a public endpoint.
- **Version the Oracle ruleset** so scoring is reproducible per version and improvable across versions.
- Stay inside the project mandates: graceful degradation, Strategy Pattern, Cloudflare-AI-only LLM.

## Non-Goals (this phase)
- No online learning on the request path. Calibration is **offline and batched** (Phase 2).
- No retrieval-augmented prompting / vector memory (Phase 3).
- No user accounts. Feedback is anonymous and treated as a **weak** signal.

## Phases
| Phase | Scope | Status |
|---|---|---|
| **1 — Longitudinal memory** | `MemoryService` (durable store), run-diffing, `memory` attached to `AuditResponse`, `[MEMORY]` log lines, Oracle ruleset versioning | **Implemented** |
| **1b — Feedback capture** | `POST /api/feedback` stores per-finding `agree`/`disagree` signals | **Implemented** |
| **2 — Oracle calibration** | Offline job recomputes Oracle thresholds/weights from *trusted* feedback, writes a new versioned ruleset | Planned |
| **3 — Retrieval memory (RAG)** | Embed analyzed content + outcomes; retrieve similar past cases to inform scoring / few-shot the LLM | Planned (needs labeled outcomes) |

## Determinism Contract
- Every audit pins a `rulesetVersion` (`memory.rulesetVersion`). Given the same input HTML and the
  same ruleset version, scores are identical — memory never mutates scores on the hot path.
- The Oracle reads its thresholds from an `OracleParams` object (default = the previously hardcoded
  values, version `oracle-1.0.0`). Phase 2 may emit `oracle-1.1.0`, etc. — never silently change v1.
- Memory influences the system only through (a) the additive `memory` trend block and (b) versioned
  params chosen *before* a run — not through per-request score mutation.

## Storage
- Backend is abstracted behind the `MemoryService` API so a Cloudflare D1 / Postgres adapter can drop
  in later. The default implementation is a **file-backed JSON store** (in-memory source of truth with
  debounced, atomic write-through) under `MEMORY_DB_PATH` (default `<cwd>/.memory`).
- **Railway note:** the container filesystem is ephemeral; for cross-deploy durability, mount a volume
  at `MEMORY_DB_PATH` or implement a D1/Postgres `MemoryService` backend. The service degrades to
  in-memory-only if the path is unwritable (constitution: graceful degradation).
- Caps: `MAX_URLS` 1000 (evict oldest), `MAX_HISTORY_PER_URL` 20, `MAX_FEEDBACK` 5000.

## Privacy & Abuse
- **Store derived scores only** — never raw HTML or screenshots. Footprint is small and non-sensitive.
- Feedback is rate-limited (30/min per IP) and stored as `source: 'anonymous'`. Phase 2 calibration
  must consume only `source: 'trusted'` (maintainer/benchmark) signals to resist poisoning of a public tool.

## Risks
- **No ground-truth label.** True correctness = "did AI engines actually cite/transact?", which is external
  and unobservable here. Phase 2 calibration therefore targets weak signals (feedback, longitudinal
  consistency), and the product framing must say so — this is calibration, not learned ground truth.
- **Poisoning.** Mitigated by trust-weighting (anonymous = weak) and offline/batched recalibration.
- **Free-tier budget.** Phase 3 embeddings would draw on the 10k-neuron/day cap; must degrade gracefully.
