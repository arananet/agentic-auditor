import { AuditResponse, AuditResult } from '../../src/types';

const STATUS_ICON: Record<string, string> = {
  READY: '✅',
  WARN: '⚠️',
  FAILED: '❌',
  SCANNING: '🔄',
  WAITING: '⏳',
};

const AUDIT_LABELS: Record<keyof Omit<AuditResponse, 'overallScore' | 'log'>, string> = {
  citability: 'AI Citability',
  technical: 'Technical Readiness',
  schema: 'Schema Depth',
  a2a: 'A2A Handshakes',
  brandMentions: 'Brand Authority',
  contentQuality: 'Content E-E-A-T',
  intentMatch: 'Intent Match',
  structural: 'Structural GEO',
  semantic: 'Semantic Depth',
  media: 'Media Context',
  sentiment: 'Tone Alignment',
  entityAuthority: 'Entity Authority',
  paa: 'PAA Optimization',
};

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function renderAudit(key: string, label: string, result: AuditResult): string {
  const icon = STATUS_ICON[result.status] ?? '❓';
  const lines: string[] = [
    `## ${icon} ${label} — ${result.score}/100`,
    '',
    `\`${scoreBar(result.score)}\` ${result.score}%`,
    '',
  ];

  if (result.details.length > 0) {
    lines.push('### Findings', '');
    result.details.forEach(d => {
      lines.push(`#### ${d.message}`, '');
      if (d.explanation) lines.push(`> ${d.explanation}`, '');
      if (d.remediation) lines.push(`**Remediation:** ${d.remediation}`, '');
      if (d.source) {
        const src = d.source.url
          ? `[${d.source.label}](${d.source.url})`
          : d.source.label;
        lines.push(`**Source:** ${src}`, '');
      }
      lines.push('');
    });
  } else {
    lines.push('_No findings — metric is fully optimised._', '');
  }

  return lines.join('\n');
}

export function renderMarkdown(url: string, report: AuditResponse): string {
  const now = new Date().toISOString();
  const hostname = new URL(url).hostname;

  const sections: string[] = [
    `# GEO Audit Report`,
    '',
    `| | |`,
    `|---|---|`,
    `| **URL** | ${url} |`,
    `| **Host** | ${hostname} |`,
    `| **Date** | ${now} |`,
    `| **Overall Score** | **${report.overallScore}/100** |`,
    '',
    '---',
    '',
    '## Score Overview',
    '',
    '| Metric | Score | Status |',
    '|---|:---:|:---:|',
  ];

  const auditKeys = Object.keys(AUDIT_LABELS) as Array<keyof typeof AUDIT_LABELS>;

  for (const key of auditKeys) {
    const result = report[key];
    if (!result) continue;
    const icon = STATUS_ICON[result.status] ?? '';
    sections.push(`| ${AUDIT_LABELS[key]} | ${result.score}/100 | ${icon} ${result.status} |`);
  }

  sections.push('', '---', '');

  for (const key of auditKeys) {
    const result = report[key];
    if (!result) continue;
    sections.push(renderAudit(key, AUDIT_LABELS[key], result));
    sections.push('---', '');
  }

  sections.push('## Execution Log', '', '```');
  report.log.forEach(l => sections.push(l));
  sections.push('```', '');

  return sections.join('\n');
}
