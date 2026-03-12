import { IAuditStrategy, AuditContext } from './IAuditStrategy';
import { AuditResult } from '../../types';

export class A2aAudit implements IAuditStrategy {
  name = 'a2a';

  async execute({ baseUrl }: AuditContext): Promise<AuditResult> {
    let score = 0;
    try {
      const llmsRes = await fetch(`${baseUrl}/llms.txt`);
      if (llmsRes.ok && (await llmsRes.text()).length > 100) score += 100;
    } catch(e) {}

    return {
      score,
      status: score === 100 ? 'READY' : 'ERROR',
      details: [
        { message: score === 100 ? 'Valid llms.txt found.' : 'Missing or empty llms.txt.', explanation: 'Agent-to-Agent (A2A) handshakes require standard API texts like llms.txt.', remediation: 'Create a root /llms.txt summarizing the brand.' }
      ]
    };
  }
}
