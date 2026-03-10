export interface AuditResult {
  score: number;
  status: 'READY' | 'WARN' | 'FAILED' | 'SCANNING' | 'WAITING';
  details: string[];
}

export interface AuditResponse {
  citability: AuditResult;
  technical: AuditResult;
  schema: AuditResult;
  log: string[];
}
