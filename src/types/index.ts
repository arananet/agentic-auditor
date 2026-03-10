export interface AuditFinding {
  message: string;
  explanation: string;
  remediation: string;
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
  log: string[];
}
