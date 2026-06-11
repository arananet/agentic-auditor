import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuditDiff } from '../types';
import { DEFAULT_ORACLE_PARAMS, OracleParams } from './OracleValidator';

// ---------------------------------------------------------------------------
// Agent Memory Layer — durable longitudinal store (Phase 1)
//
// Remembers per-dimension scores for every completed audit so the system can
// surface trends, diff runs, and (Phase 2) calibrate the Oracle from feedback.
// Only derived scores are stored — never HTML or screenshots.
//
// Backend is abstracted: this default implementation keeps an in-memory source
// of truth with debounced, atomic write-through to a JSON file. A Cloudflare D1
// or Postgres backend can replace it behind the same API. All filesystem work is
// guarded — if the path is unwritable the service degrades to in-memory only.
// ---------------------------------------------------------------------------

export interface AuditMemoryRecord {
  url: string;
  domain: string;
  ts: number;
  rulesetVersion: string;
  overallScore: number;
  scores: Record<string, number>;
}

export interface FeedbackRecord {
  id: string;
  ts: number;
  url: string | null;
  dimension: string;
  signal: 'agree' | 'disagree';
  source: 'anonymous' | 'trusted';
  note?: string;
}

interface PersistShape {
  version: 1;
  audits: Record<string, AuditMemoryRecord[]>; // url -> history (newest last)
  feedback: FeedbackRecord[];
}

const MAX_URLS = 1000;
const MAX_HISTORY_PER_URL = 20;
const MAX_FEEDBACK = 5000;
const WRITE_DEBOUNCE_MS = 1000;

class MemoryService {
  private audits = new Map<string, AuditMemoryRecord[]>();
  private feedback: FeedbackRecord[] = [];
  private loaded = false;
  private persistent = false;
  private dir: string;
  private file: string;
  private writeTimer: NodeJS.Timeout | null = null;
  private shutdownHooked = false;

  constructor() {
    this.dir = process.env.MEMORY_DB_PATH || path.join(process.cwd(), '.memory');
    this.file = path.join(this.dir, 'memory.json');
  }

  /** Lazy load from disk on first access — avoids filesystem work at import time. */
  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.persistent = true;
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as PersistShape;
        if (parsed && parsed.version === 1) {
          this.audits = new Map(Object.entries(parsed.audits || {}));
          this.feedback = Array.isArray(parsed.feedback) ? parsed.feedback : [];
        }
      }
      this.registerShutdownFlush();
    } catch {
      // Unwritable path (e.g. read-only FS) — run in-memory only.
      this.persistent = false;
    }
  }

  /**
   * Flush any pending debounced write when the process exits. This makes the
   * short-lived CLI (runAudit → process.exit) persist its record. We only hook
   * 'exit' (sync, non-intrusive) — not SIGTERM/SIGINT — so Next.js keeps owning
   * graceful shutdown on the server.
   */
  private registerShutdownFlush(): void {
    if (this.shutdownHooked) return;
    this.shutdownHooked = true;
    process.once('exit', () => {
      if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
      this.flush();
    });
  }

  /** True when durable persistence is active; false means in-memory only. */
  isEnabled(): boolean {
    this.ensureLoaded();
    return this.persistent;
  }

  private scheduleSave(): void {
    if (!this.persistent) return;
    if (this.writeTimer) return; // coalesce bursts
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, WRITE_DEBOUNCE_MS);
    this.writeTimer.unref?.();
  }

  /** Atomic write: temp file + rename, so a crash can't truncate the store. */
  private flush(): void {
    if (!this.persistent) return;
    const shape: PersistShape = {
      version: 1,
      audits: Object.fromEntries(this.audits),
      feedback: this.feedback,
    };
    try {
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(shape), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch {
      this.persistent = false; // stop trying once writes fail
    }
  }

  private domainOf(url: string): string {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  recall(url: string): AuditMemoryRecord | null {
    this.ensureLoaded();
    const hist = this.audits.get(url);
    return hist && hist.length ? hist[hist.length - 1] : null;
  }

  history(url: string, limit = MAX_HISTORY_PER_URL): AuditMemoryRecord[] {
    this.ensureLoaded();
    const hist = this.audits.get(url) || [];
    return hist.slice(-limit);
  }

  /** Compare a pending result against the latest stored record for the URL. */
  diff(url: string, scores: Record<string, number>, overall: number): AuditDiff {
    const prev = this.recall(url);
    if (!prev) {
      return { previousTs: null, ageDays: null, overallDelta: null, improved: [], regressed: [], dimensionDeltas: {} };
    }
    const dimensionDeltas: Record<string, number> = {};
    const improved: string[] = [];
    const regressed: string[] = [];
    const keys = new Set([...Object.keys(scores), ...Object.keys(prev.scores)]);
    for (const k of keys) {
      const delta = (scores[k] ?? 0) - (prev.scores[k] ?? 0);
      if (delta === 0) continue;
      dimensionDeltas[k] = delta;
      (delta > 0 ? improved : regressed).push(k);
    }
    return {
      previousTs: prev.ts,
      ageDays: Math.round(((Date.now() - prev.ts) / 86_400_000) * 10) / 10,
      overallDelta: overall - prev.overallScore,
      improved,
      regressed,
      dimensionDeltas,
    };
  }

  remember(record: AuditMemoryRecord): void {
    this.ensureLoaded();
    const hist = this.audits.get(record.url) || [];
    hist.push(record);
    while (hist.length > MAX_HISTORY_PER_URL) hist.shift();
    this.audits.set(record.url, hist);
    this.evictIfNeeded();
    this.scheduleSave();
  }

  /** Evict the URL with the oldest most-recent record once over the URL cap. */
  private evictIfNeeded(): void {
    if (this.audits.size <= MAX_URLS) return;
    let oldestUrl: string | null = null;
    let oldestTs = Infinity;
    for (const [url, hist] of this.audits) {
      const latest = hist[hist.length - 1]?.ts ?? 0;
      if (latest < oldestTs) { oldestTs = latest; oldestUrl = url; }
    }
    if (oldestUrl) this.audits.delete(oldestUrl);
  }

  recordFeedback(input: Omit<FeedbackRecord, 'id' | 'ts'>): FeedbackRecord {
    this.ensureLoaded();
    const fb: FeedbackRecord = { id: crypto.randomUUID(), ts: Date.now(), ...input };
    this.feedback.push(fb);
    while (this.feedback.length > MAX_FEEDBACK) this.feedback.shift();
    this.scheduleSave();
    return fb;
  }

  /** Aggregate feedback counts — input for Phase-2 Oracle calibration. */
  feedbackStats(dimension?: string): { agree: number; disagree: number } {
    this.ensureLoaded();
    let agree = 0, disagree = 0;
    for (const f of this.feedback) {
      if (dimension && f.dimension !== dimension) continue;
      if (f.signal === 'agree') agree++; else disagree++;
    }
    return { agree, disagree };
  }

  /**
   * Current Oracle ruleset. Phase 1 always returns the baked-in defaults; Phase 2
   * will return calibrated params derived from trusted feedback, with a new version.
   */
  getOracleParams(): OracleParams {
    return DEFAULT_ORACLE_PARAMS;
  }
}

// Global singleton — mirrors CacheManager / QueueManager.
export const globalMemory = new MemoryService();
