# Data Model: Geo Agentic Auditor

## Entities

### `AuditSource`
- `label`: string — human-readable source name
- `url?`: string — optional hyperlink to the source document

### `AuditFinding`
- `message`: string — short one-line summary
- `explanation`: string — detailed analysis paragraph
- `remediation`: string — actionable fix instruction
- `source?`: AuditSource — research/spec reference (shown in tooltip)
- `location?`: string — DOM location hint (e.g. `<h1>/<h2> — 3 headings`)

### `AuditResult`
- `score`: number (0–100)
- `status`: `'READY'` | `'WARN'` | `'FAILED'`
- `details`: AuditFinding[]

### `AuditResponse`
- `overallScore`: number
- `log`: string[] — live execution log lines
- `citability`: AuditResult
- `technical`: AuditResult
- `schema`: AuditResult
- `a2a`: AuditResult
- `brandMentions`: AuditResult
- `contentQuality`: AuditResult
- `intentMatch`: AuditResult
- `structural`: AuditResult
- `semantic`: AuditResult
- `media`: AuditResult
- `sentiment`: AuditResult

### `Job` (QueueManager)
- `id`: string (UUID)
- `url`: string
- `status`: `'queued'` | `'processing'` | `'completed'` | `'failed'`
- `result?`: AuditResponse
- `error?`: string
- `createdAt`: Date
- `log`: string[] — live per-strategy log lines streamed during processing

## UI-Only Types (components/CategorizedResults.tsx)

### `MetricItem`
- `id`: string — matches AuditResponse key (e.g. `"citability"`, `"schema"`)
- `label`: string — display label (e.g. `"CITABILITY"`)
- `data`: AuditResult
- `description`: string — short human-readable description shown in the UI

### `CategoryDef`
- `id`: string — category identifier (`"agent-access"` | `"content-signals"` | `"structural-gaps"`)
- `title`: string — display title
- `description`: string
- `effort`: string — effort badge label (`"Quick Win"` | `"Editorial"` | `"Development"`)
- `effortColor`: string — Tailwind color class
- `icon`: React element
- `metricIds`: string[] — ordered list of metric IDs belonging to this category

### `CategoryGroup`
Extends `CategoryDef` with:
- `metrics`: MetricItem[] — resolved metric items for this category

### `CATEGORY_DEFS` constant
Three predefined `CategoryDef` entries:
- `agent-access` → Technical + A2A → effort: **Quick Win** (green)
- `content-signals` → Citability, ContentQuality, IntentMatch, Semantic, Sentiment, BrandMentions, Media → effort: **Editorial** (amber)
- `structural-gaps` → Schema + Structural → effort: **Development** (blue)
