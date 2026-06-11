export interface AuditSource {
  label: string;
  url?: string;
}

export interface AuditFinding {
  message: string;
  explanation: string;
  remediation: string;
  source?: AuditSource;
  /** DOM element, file path, or page section where the issue was detected */
  location?: string;
}

export interface AuditResult {
  score: number;
  status: 'READY' | 'WARN' | 'FAILED' | 'SCANNING' | 'WAITING';
  details: AuditFinding[];
  /** Oracle confidence: 'high' = trusted, 'low' = input was suspect, 'overridden' = oracle corrected the score */
  confidence?: 'high' | 'low' | 'overridden';
  /** Oracle flags — human-readable warnings about this agent's output */
  oracleFlags?: string[];
}

export interface AuditResponse {
  overallScore: number;
  citability: AuditResult;
  technical: AuditResult;
  schema: AuditResult;
  a2a: AuditResult;
  brandMentions: AuditResult;
  contentQuality: AuditResult;
  intentMatch: AuditResult;
  structural: AuditResult;
  semantic: AuditResult;
  media: AuditResult;
  sentiment: AuditResult;
  entityAuthority: AuditResult;
  paa: AuditResult;
  sitemap: AuditResult;
  commerceAgent: AuditResult;
  log: string[];
  /** Base64 PNG — first capture right after page load (may show WAF/CAPTCHA) */
  screenshotInitial?: string;
  /** Base64 PNG — final page the auditor actually analyzed (after WAF bypass if needed) */
  screenshotFinal?: string;
  /** Longitudinal memory: trend vs the previous audit of the same URL (Agent Memory Layer). */
  memory?: AuditMemory;
}

/** Canonical audit dimension keys — the 15 IAuditStrategy names. */
export const AUDIT_DIMENSIONS = [
  'citability', 'technical', 'schema', 'a2a', 'brandMentions', 'contentQuality',
  'intentMatch', 'structural', 'semantic', 'media', 'sentiment', 'entityAuthority',
  'paa', 'sitemap', 'commerceAgent',
] as const;

export type AuditDimension = typeof AUDIT_DIMENSIONS[number];

/** Comparison of an audit against the previous audit of the same URL. */
export interface AuditDiff {
  /** Timestamp (epoch ms) of the prior audit, or null on the first-ever audit. */
  previousTs: number | null;
  /** Age of the prior audit in days, or null on the first audit. */
  ageDays: number | null;
  /** current overall − prior overall, or null on the first audit. */
  overallDelta: number | null;
  /** Dimensions whose score rose since the prior audit. */
  improved: string[];
  /** Dimensions whose score fell since the prior audit. */
  regressed: string[];
  /** Per-dimension score change (non-zero entries only). */
  dimensionDeltas: Record<string, number>;
}

/** Memory block attached to AuditResponse.memory. */
export interface AuditMemory {
  /** Oracle ruleset version the scores were produced under (determinism anchor). */
  rulesetVersion: string;
  /** How many times this URL has been audited, including the current run. */
  auditCount: number;
  /** Comparison to the previous audit, or null on the first run. */
  diff: AuditDiff | null;
}
