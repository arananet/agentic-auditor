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
  log: string[];
  /** Base64 PNG — first capture right after page load (may show WAF/CAPTCHA) */
  screenshotInitial?: string;
  /** Base64 PNG — final page the auditor actually analyzed (after WAF bypass if needed) */
  screenshotFinal?: string;
}
