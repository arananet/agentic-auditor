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
  topicalCoverage: AuditResult;
  log: string[];
}
