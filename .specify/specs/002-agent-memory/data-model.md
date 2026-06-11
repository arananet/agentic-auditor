# Data Model: Agent Memory Layer

## Persisted Entities (MemoryService)

### `AuditMemoryRecord`
One row per completed audit. **No HTML/screenshots stored.**
- `url`: string — full audited URL (the memory key)
- `domain`: string — hostname, for domain-level aggregation
- `ts`: number — epoch ms when recorded
- `rulesetVersion`: string — Oracle ruleset the scores were produced under
- `overallScore`: number (0–100)
- `scores`: Record<string, number> — dimension key → score (e.g. `{ schema: 80, commerceAgent: 15 }`)

### `FeedbackRecord`
One row per user reaction to a finding.
- `id`: string (UUID)
- `ts`: number — epoch ms
- `url`: string | null — audited URL the feedback refers to
- `dimension`: string — audit key (must be in `AUDIT_DIMENSIONS`)
- `signal`: `'agree'` | `'disagree'`
- `source`: `'anonymous'` | `'trusted'` — only `trusted` feeds Phase-2 calibration
- `note?`: string — optional free text (capped)

## Response Types (src/types)

### `AuditDiff`
- `previousTs`: number | null — timestamp of the prior audit (null on first audit)
- `ageDays`: number | null — age of the prior audit in days
- `overallDelta`: number | null — current overall − prior overall
- `improved`: string[] — dimensions that rose
- `regressed`: string[] — dimensions that fell
- `dimensionDeltas`: Record<string, number> — per-dimension change (non-zero only)

### `AuditMemory` (attached to `AuditResponse.memory`)
- `rulesetVersion`: string — pinned Oracle ruleset version (determinism anchor)
- `auditCount`: number — how many times this URL has been audited (incl. this run)
- `diff`: AuditDiff | null — comparison to the previous audit, or null on first run

## Oracle Params (src/services/OracleValidator.ts)

### `OracleParams`
Tunable thresholds the Oracle rules read (defaults = the original hardcoded values).
- `version`: string — e.g. `'oracle-1.0.0'`
- `blockedHighScore`: number (60) — "suspiciously high on a blocked page" cutoff
- `thinContentWords`: number (100) — thin-content word threshold
- `entitySchemaMinScore`: number (30) — entityAuthority>x with schema==0 → override
- `paaIntentMinScore`: number (20) — paa>x with intentMatch==0 → override
- `mediaVacuousMinScore`: number (80) — media≥x with 0 images → vacuous-truth flag
- `citabilityThinMaxScore`: number (40) — citability>x on thin content → low confidence

`ORACLE_RULESET_VERSION` + `DEFAULT_ORACLE_PARAMS` are exported; `runOracle(...)` accepts an optional
`OracleParams` (defaults to `DEFAULT_ORACLE_PARAMS`).

## MemoryService API
- `recall(url): AuditMemoryRecord | null` — latest record for a URL
- `history(url, limit?): AuditMemoryRecord[]` — newest-last history
- `diff(url, scores, overall): AuditDiff` — compare a pending result against the latest record
- `remember(record): void` — append (trims history + evicts oldest URL past caps; async write-through)
- `recordFeedback(fb): void` — append feedback
- `feedbackStats(dimension?): { agree: number; disagree: number }` — aggregates for Phase-2
- `getOracleParams(): OracleParams` — current ruleset (defaults today; calibrated in Phase 2)
- `isEnabled(): boolean` — whether durable persistence is active (false → in-memory only)

## Constants (src/types)
- `AUDIT_DIMENSIONS`: readonly string[] — the 15 canonical audit keys (feedback validation, diffing)
