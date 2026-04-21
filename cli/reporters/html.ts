import { AuditResponse, AuditResult } from '../../src/types';

const STATUS_COLOR: Record<string, string> = {
  READY: '#16a34a',
  WARN: '#d97706',
  FAILED: '#dc2626',
  SCANNING: '#2563eb',
  WAITING: '#6b7280',
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

function auditCard(label: string, result: AuditResult): string {
  const color = STATUS_COLOR[result.status] ?? '#6b7280';
  const findings = result.details.map(d => `
    <div class="finding">
      <p class="finding-msg">${escHtml(d.message)}</p>
      ${d.explanation ? `<p class="finding-exp">${escHtml(d.explanation)}</p>` : ''}
      ${d.remediation ? `<p class="finding-rem"><strong>Remediation:</strong> ${escHtml(d.remediation)}</p>` : ''}
      ${d.source ? `<p class="finding-src"><strong>Source:</strong> ${d.source.url ? `<a href="${escHtml(d.source.url)}" target="_blank" rel="noopener noreferrer">${escHtml(d.source.label)}</a>` : escHtml(d.source.label)}</p>` : ''}
    </div>`).join('');

  return `
  <div class="card">
    <div class="card-header" style="border-left: 4px solid ${color}">
      <span class="card-label">${escHtml(label)}</span>
      <span class="card-score" style="color:${color}">${result.score}/100</span>
      <span class="card-status" style="background:${color}">${result.status}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${result.score}%;background:${color}"></div></div>
    ${findings ? `<div class="findings">${findings}</div>` : ''}
  </div>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderHtml(url: string, report: AuditResponse): string {
  const now = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const hostname = new URL(url).hostname;

  const scoreColor = report.overallScore >= 75 ? '#16a34a' : report.overallScore >= 50 ? '#d97706' : '#dc2626';

  const auditKeys = Object.keys(AUDIT_LABELS) as Array<keyof typeof AUDIT_LABELS>;

  const summaryRows = auditKeys.map(key => {
    const r = report[key];
    if (!r) return '';
    const c = STATUS_COLOR[r.status] ?? '#6b7280';
    return `<tr><td>${escHtml(AUDIT_LABELS[key])}</td><td style="color:${c};font-weight:600">${r.score}/100</td><td><span class="badge" style="background:${c}">${r.status}</span></td></tr>`;
  }).join('');

  const cards = auditKeys.map(key => {
    const r = report[key];
    return r ? auditCard(AUDIT_LABELS[key], r) : '';
  }).join('');

  const logLines = report.log.map(l => escHtml(l)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GEO Audit — ${escHtml(hostname)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#f8f8f8;padding:24px}
  h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .meta{color:#555;font-size:12px;margin-bottom:20px}
  .hero{display:flex;align-items:center;gap:24px;margin-bottom:28px;background:#fff;padding:20px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .big-score{font-size:52px;font-weight:800;line-height:1}
  .summary-table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:28px}
  .summary-table th{background:#1a1a1a;color:#fff;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  .summary-table td{padding:8px 12px;border-bottom:1px solid #eee}
  .badge{display:inline-block;color:#fff;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
  .card{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:16px;overflow:hidden}
  .card-header{display:flex;align-items:center;gap:10px;padding:12px 16px}
  .card-label{flex:1;font-weight:600;font-size:14px}
  .card-score{font-size:18px;font-weight:800}
  .card-status{color:#fff;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
  .progress-bar{height:4px;background:#eee}
  .progress-fill{height:4px;transition:width .3s}
  .findings{padding:12px 16px;border-top:1px solid #eee}
  .finding{margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f0f0f0}
  .finding:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
  .finding-msg{font-weight:600;margin-bottom:4px}
  .finding-exp{color:#555;font-size:12px;margin-bottom:4px;font-style:italic}
  .finding-rem{font-size:12px;color:#1a1a1a}
  .finding-src{font-size:11px;color:#4a6fa5;margin-top:4px}
  .finding-src a{color:#4a6fa5;text-decoration:underline}
  .log{background:#1a1a1a;color:#a8ff78;font-family:monospace;font-size:11px;padding:16px;border-radius:8px;white-space:pre-wrap;word-break:break-all;margin-top:28px}
  @media print{body{padding:12px;background:#fff}.log{font-size:9px}}
</style>
</head>
<body>
  <h1>GEO Audit Report</h1>
  <p class="meta">URL: <strong>${escHtml(url)}</strong> &nbsp;|&nbsp; Generated: ${escHtml(now)}</p>

  <div class="hero">
    <div class="big-score" style="color:${scoreColor}">${report.overallScore}</div>
    <div>
      <div style="font-size:14px;font-weight:600;color:#555">Overall GEO Score</div>
      <div style="font-size:12px;color:#888">out of 100</div>
    </div>
  </div>

  <table class="summary-table">
    <thead><tr><th>Metric</th><th>Score</th><th>Status</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>

  ${cards}

  <div class="log">${logLines}</div>
</body>
</html>`;
}
