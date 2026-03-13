# Data Model: Geo Agentic Auditor

## Entities
1. **AuditResponse**
   - `overallScore`: number
   - `citability`: AuditResult
   - `technical`: AuditResult
   ...
2. **AuditResult**
   - `score`: number
   - `status`: 'READY' | 'WARN' | 'FAILED'
   - `details`: Array<{message, explanation, remediation}>
