import { AuditResult, AuditResponse } from '../types';

// ---------------------------------------------------------------------------
// Oracle Validator — post-execution governance layer
//
// After all 14 audit agents resolve, the Oracle cross-validates their outputs
// to catch:
//   1. Contradictions between related agents
//   2. Anomalous scores on degraded input (WAF/bot-block pages)
//   3. Suspiciously high scores that conflict with peer signals
//   4. Zero-score agents that may have crashed silently
//
// The Oracle never re-runs an agent.  It annotates each AuditResult with:
//   • confidence: 'high' | 'low' | 'overridden'
//   • oracleFlags[]: human-readable warnings
// ---------------------------------------------------------------------------

type AuditKey = keyof Omit<AuditResponse, 'overallScore' | 'log' | 'screenshotInitial' | 'screenshotFinal'>;

interface OracleContext {
  botBlocked: boolean;
  htmlBytes: number;
  wordCount: number;
}

interface OracleVerdict {
  key: AuditKey;
  confidence: 'high' | 'low' | 'overridden';
  flags: string[];
  adjustedScore?: number;
}

export function runOracle(
  results: Partial<AuditResponse>,
  ctx: OracleContext,
  emit: (msg: string) => void
): OracleVerdict[] {
  const verdicts: OracleVerdict[] = [];

  const get = (key: AuditKey): AuditResult | undefined =>
    results[key] as AuditResult | undefined;

  emit(`[ORACLE] ━━━ Post-Execution Governance ━━━`);

  // ── Rule 1: Bot-blocked page degrades ALL agent confidence ────────────
  if (ctx.botBlocked) {
    const auditKeys = Object.keys(results).filter(
      k => k !== 'overallScore' && k !== 'log' && k !== 'screenshotInitial' && k !== 'screenshotFinal'
    ) as AuditKey[];

    for (const key of auditKeys) {
      const res = get(key);
      if (!res) continue;

      const flags: string[] = ['Input degraded: WAF/bot-block page detected — agent analyzed a challenge page, not real content.'];

      // If an agent scored > 60 on a blocked page, that's especially suspect
      if (res.score > 60) {
        flags.push(`Suspiciously high score (${res.score}) on a blocked page — likely evaluating WAF HTML, not site content.`);
      }

      verdicts.push({ key, confidence: 'low', flags });
    }

    emit(`[ORACLE] ⚠ Bot-block detected — all ${verdicts.length} agent results marked LOW confidence.`);
  }

  // ── Rule 2: Thin content cross-check ──────────────────────────────────
  if (ctx.wordCount < 100) {
    const contentDependentAgents: AuditKey[] = [
      'citability', 'semantic', 'intentMatch', 'sentiment', 'paa', 'contentQuality'
    ];

    for (const key of contentDependentAgents) {
      const res = get(key);
      if (!res) continue;

      const existing = verdicts.find(v => v.key === key);
      const flag = `Thin content (${ctx.wordCount} words) — agent had insufficient text to analyze reliably.`;
      if (existing) {
        existing.flags.push(flag);
      } else {
        verdicts.push({ key, confidence: 'low', flags: [flag] });
      }
    }

    emit(`[ORACLE] ⚠ Thin content (${ctx.wordCount}w) — content-dependent agents flagged as LOW confidence.`);
  }

  // ── Rule 3: Schema ↔ EntityAuthority contradiction ────────────────────
  const schema = get('schema');
  const entity = get('entityAuthority');
  if (schema && entity) {
    if (schema.score === 0 && entity.score > 30) {
      const flag = 'Contradiction: entityAuthority scored >30 but schema found 0 JSON-LD blocks — sameAs/WebSite data cannot exist without JSON-LD.';
      const existing = verdicts.find(v => v.key === 'entityAuthority');
      if (existing) {
        existing.confidence = 'overridden';
        existing.flags.push(flag);
        existing.adjustedScore = 0;
      } else {
        verdicts.push({ key: 'entityAuthority', confidence: 'overridden', flags: [flag], adjustedScore: 0 });
      }
      emit(`[ORACLE] ✗ Contradiction: entityAuthority overridden to 0 — no JSON-LD exists for sameAs.`);
    }
  }

  // ── Rule 4: PAA ↔ IntentMatch coherence ───────────────────────────────
  const paa = get('paa');
  const intent = get('intentMatch');
  if (paa && intent) {
    // If intentMatch found 0 question headings but PAA scored > 0, that's contradictory
    if (intent.score === 0 && paa.score > 20) {
      const flag = 'Contradiction: paa scored >20 but intentMatch found 0 question headings — PAA requires question-style H2/H3.';
      const existing = verdicts.find(v => v.key === 'paa');
      if (existing) {
        existing.confidence = 'overridden';
        existing.flags.push(flag);
        existing.adjustedScore = 0;
      } else {
        verdicts.push({ key: 'paa', confidence: 'overridden', flags: [flag], adjustedScore: 0 });
      }
      emit(`[ORACLE] ✗ Contradiction: paa overridden — intentMatch confirms 0 question headings.`);
    }
  }

  // ── Rule 5: Media agent scoring high with 0 images ────────────────────
  const media = get('media');
  if (media && media.score >= 80) {
    const noImages = media.details.some(d => d.message.includes('No images found'));
    if (noImages) {
      const flag = 'Anomaly: media scored ≥80 but found 0 images — high score is a vacuous truth (no images = no violations). Score is technically correct but misleading.';
      const existing = verdicts.find(v => v.key === 'media');
      if (existing) {
        existing.flags.push(flag);
        existing.confidence = 'low';
      } else {
        verdicts.push({ key: 'media', confidence: 'low', flags: [flag] });
      }
      emit(`[ORACLE] ⚠ Anomaly: media scored ${media.score} with 0 images — vacuous truth, marked LOW confidence.`);
    }
  }

  // ── Rule 6: A2A network fetch failures vs genuine misses ──────────────
  const a2a = get('a2a');
  const technical = get('technical');
  if (a2a && technical && a2a.score === 0 && technical.score > 50) {
    const existing = verdicts.find(v => v.key === 'a2a');
    if (!existing) {
      verdicts.push({ key: 'a2a', confidence: 'high', flags: ['Validated: technical agent confirmed network reachability — A2A files are genuinely absent.'] });
      emit(`[ORACLE] ✓ Validated: a2a score of 0 is genuine — site reachable but files missing.`);
    }
  }

  // ── Rule 7: Citability ↔ ContentQuality coherence ─────────────────────
  const citability = get('citability');
  const contentQuality = get('contentQuality');
  if (citability && contentQuality) {
    const thinContent = contentQuality.details.some(d => d.message.toLowerCase().includes('thin content'));
    if (thinContent && citability.score > 40) {
      const flag = 'Anomaly: citability scored >40 but contentQuality flagged thin content — insufficient text makes high citability unlikely.';
      const existing = verdicts.find(v => v.key === 'citability');
      if (existing) {
        existing.flags.push(flag);
        existing.confidence = 'low';
      } else {
        verdicts.push({ key: 'citability', confidence: 'low', flags: [flag] });
      }
      emit(`[ORACLE] ⚠ Anomaly: citability scored ${citability.score} on thin content — marked LOW confidence.`);
    }
  }

  // ── Rule 8: Sitemap ↔ Technical coherence ──────────────────────────────
  const sitemap = get('sitemap');
  if (sitemap && technical) {
    if (technical.score === 0 && sitemap.score > 50) {
      const existing = verdicts.find(v => v.key === 'sitemap');
      if (!existing) {
        verdicts.push({ key: 'sitemap', confidence: 'high', flags: ['Sitemap fetched independently of HTML page — score is reliable even if main page is CSR/blocked.'] });
        emit(`[ORACLE] ✓ Validated: sitemap score is reliable — fetched independently of main page.`);
      }
    }
  }

  // ── Mark remaining agents as HIGH confidence ──────────────────────────
  const allKeys = Object.keys(results).filter(
    k => k !== 'overallScore' && k !== 'log' && k !== 'screenshotInitial' && k !== 'screenshotFinal'
  ) as AuditKey[];

  let highCount = 0;
  for (const key of allKeys) {
    if (!verdicts.find(v => v.key === key)) {
      verdicts.push({ key, confidence: 'high', flags: [] });
      highCount++;
    }
  }

  const lowCount = verdicts.filter(v => v.confidence === 'low').length;
  const overriddenCount = verdicts.filter(v => v.confidence === 'overridden').length;

  emit(`[ORACLE] Verdict: ${highCount} high-confidence, ${lowCount} low-confidence, ${overriddenCount} overridden.`);

  return verdicts;
}
