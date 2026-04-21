"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Cpu, Clock, Zap, CheckCircle2, XCircle, AlertTriangle, Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

type AgentStatus = "idle" | "running" | "done" | "failed" | "warn";
type Confidence = "high" | "low" | "overridden" | null;

interface AgentInfo {
  name: string;
  status: AgentStatus;
  score: number | null;
  startedAt: number | null;   // seconds from t0
  finishedAt: number | null;  // seconds from t0
  duration: number | null;    // seconds
  confidence: Confidence;
}

interface OracleSummary {
  high: number;
  low: number;
  overridden: number;
  lines: string[];             // raw [ORACLE] log lines
}

interface SwarmSummary {
  agents: AgentInfo[];
  totalTime: number | null;
  peakConcurrent: number | null;
  isRunning: boolean;
  llmEnabled: boolean;
  oracle: OracleSummary;
}

/** Parse the live log lines into a structured swarm summary. */
function parseSwarm(logs: string[]): SwarmSummary {
  const agents = new Map<string, AgentInfo>();
  let totalTime: number | null = null;
  let peakConcurrent: number | null = null;
  let isRunning = false;
  let llmEnabled = false;
  const oracle: OracleSummary = { high: 0, low: 0, overridden: 0, lines: [] };

  for (const line of logs) {
    // [INFO] Agent Swarm: 13 parallel agents — all LLM calls fire simultaneously.
    if (line.includes("Agent Swarm:") && line.includes("parallel agents")) {
      llmEnabled = true;
    }

    // [SCAN] ⟳ Running citability... (t+0.0s)
    const scanMatch = line.match(/\[SCAN\].*Running (\w+)\.\.\. \(t\+(\d+(?:\.\d+)?)s\)/);
    if (scanMatch) {
      const [, name, tStr] = scanMatch;
      agents.set(name, {
        name,
        status: "running",
        score: null,
        startedAt: parseFloat(tStr),
        finishedAt: null,
        duration: null,
        confidence: null,
      });
      isRunning = true;
    }

    // [OK] ✓ media: 89/100 (18.9s @ t+19.0s)
    // [FAIL] ✗ paa: 0/100 (0.0s @ t+0.0s)
    // [WARN] ⚠ semantic: 51/100 (25.2s @ t+25.2s)
    const resultMatch = line.match(/\[(OK|FAIL|WARN)\].*?(\w+): (\d+)\/100 \((\d+(?:\.\d+)?)s @ t\+(\d+(?:\.\d+)?)s\)/);
    if (resultMatch) {
      const [, level, name, scoreStr, durStr, tStr] = resultMatch;
      const existing = agents.get(name);
      agents.set(name, {
        name,
        status: level === "OK" ? "done" : level === "WARN" ? "warn" : "failed",
        score: parseInt(scoreStr, 10),
        startedAt: existing?.startedAt ?? null,
        finishedAt: parseFloat(tStr),
        duration: parseFloat(durStr),
        confidence: existing?.confidence ?? null,
      });
    }

    // [OK] FINAL GEO SCORE: 22/100 (13 audits in 38.8s)
    const finalMatch = line.match(/FINAL GEO SCORE.*\((\d+) audits in (\d+(?:\.\d+)?)s\)/);
    if (finalMatch) {
      totalTime = parseFloat(finalMatch[2]);
      isRunning = false;
    }

    // [INFO] Swarm peak: 12 concurrent LLM calls.
    const peakMatch = line.match(/Swarm peak: (\d+) concurrent/);
    if (peakMatch) {
      peakConcurrent = parseInt(peakMatch[1], 10);
    }

    // [ORACLE] lines
    if (line.includes("[ORACLE]")) {
      oracle.lines.push(line);

      // [ORACLE] Verdict: 8 high-confidence, 4 low-confidence, 1 overridden.
      const verdictMatch = line.match(/Verdict: (\d+) high-confidence, (\d+) low-confidence, (\d+) overridden/);
      if (verdictMatch) {
        oracle.high = parseInt(verdictMatch[1], 10);
        oracle.low = parseInt(verdictMatch[2], 10);
        oracle.overridden = parseInt(verdictMatch[3], 10);
      }

      // [ORACLE] ✗ Contradiction: entityAuthority overridden to 0
      const overrideMatch = line.match(/Contradiction: (\w+) overridden/);
      if (overrideMatch) {
        const name = overrideMatch[1];
        const agent = agents.get(name);
        if (agent) agent.confidence = "overridden";
      }

      // [ORACLE] ⚠ Anomaly: media scored ... marked LOW confidence.
      // [ORACLE] ⚠ Bot-block detected — all N agent results marked LOW confidence.
      // [ORACLE] ⚠ Thin content — content-dependent agents flagged as LOW confidence.
      if (line.includes("LOW confidence") || line.includes("low-confidence")) {
        // Try to extract specific agent name
        const anomalyMatch = line.match(/Anomaly: (\w+) scored/);
        if (anomalyMatch) {
          const agent = agents.get(anomalyMatch[1]);
          if (agent && agent.confidence !== "overridden") agent.confidence = "low";
        }
        // Bot-block marks all low
        if (line.includes("Bot-block")) {
          agents.forEach(a => { if (a.confidence !== "overridden") a.confidence = "low"; });
        }
        // Thin content marks content-dependent agents
        if (line.includes("Thin content")) {
          const contentAgents = ["citability", "semantic", "intentMatch", "sentiment", "paa", "contentQuality"];
          contentAgents.forEach(n => {
            const a = agents.get(n);
            if (a && a.confidence !== "overridden") a.confidence = "low";
          });
        }
      }

      // [ORACLE] ✓ Validated: a2a score of 0 is genuine
      if (line.includes("Validated:")) {
        const validatedMatch = line.match(/Validated: (\w+)/);
        if (validatedMatch) {
          const agent = agents.get(validatedMatch[1]);
          if (agent) agent.confidence = "high";
        }
      }
    }
  }

  return {
    agents: Array.from(agents.values()),
    totalTime,
    peakConcurrent,
    isRunning,
    llmEnabled,
    oracle,
  };
}

// ---- Small sub-components ----

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (!confidence) return null;
  switch (confidence) {
    case "high":
      return <ShieldCheck size={10} className="text-[#8FBC8F]/50" aria-label="Oracle: High confidence" />;
    case "low":
      return <ShieldAlert size={10} className="text-[#D4A373]" aria-label="Oracle: Low confidence" />;
    case "overridden":
      return <ShieldX size={10} className="text-red-400" aria-label="Oracle: Score overridden" />;
  }
}

function StatusIcon({ status }: { status: AgentStatus }) {
  switch (status) {
    case "running":
      return <Loader2 size={12} className="animate-spin text-[#D4A373]" />;
    case "done":
      return <CheckCircle2 size={12} className="text-[#8FBC8F]" />;
    case "warn":
      return <AlertTriangle size={12} className="text-[#D4A373]" />;
    case "failed":
      return <XCircle size={12} className="text-red-400" />;
    default:
      return <div className="w-3 h-3 rounded-full bg-white/10" />;
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-white/20";
  if (score >= 75) return "text-[#8FBC8F]";
  if (score >= 40) return "text-[#D4A373]";
  return "text-red-400";
}

function barColor(status: AgentStatus): string {
  switch (status) {
    case "done": return "bg-[#8FBC8F]";
    case "warn": return "bg-[#D4A373]";
    case "failed": return "bg-red-400/80";
    case "running": return "bg-[#D4A373] animate-pulse";
    default: return "bg-white/10";
  }
}

interface Props {
  logs: string[];
}

export const AgentSwarmPanel = ({ logs }: Props) => {
  const swarm = useMemo(() => parseSwarm(logs), [logs]);

  // Don't render until at least one agent is dispatched
  if (swarm.agents.length === 0) return null;

  const completedCount = swarm.agents.filter(a => a.status !== "running" && a.status !== "idle").length;
  const totalAgents = swarm.agents.length;
  const runningCount = swarm.agents.filter(a => a.status === "running").length;
  const maxTime = swarm.totalTime ?? Math.max(...swarm.agents.map(a => a.finishedAt ?? a.startedAt ?? 0), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 border border-white/5 bg-[#0D0D0D] overflow-hidden no-print"
    >
      {/* Header bar */}
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[#D4A373]" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50 font-bold">Agent Swarm Monitor</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider text-white/30">
          {swarm.isRunning ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4A373] animate-pulse" />
              {runningCount} active
            </span>
          ) : swarm.totalTime !== null ? (
            <span className="flex items-center gap-1.5 text-[#8FBC8F]/60">
              <Zap size={10} />
              Complete
            </span>
          ) : null}
        </div>
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 border-b border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/25 mb-1">Agents</div>
          <div className="text-sm font-bold text-white/70">{completedCount}<span className="text-white/20">/{totalAgents}</span></div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/25 mb-1">Peak Parallel</div>
          <div className="text-sm font-bold text-white/70">
            {swarm.peakConcurrent ?? runningCount ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/25 mb-1">Wall Time</div>
          <div className="text-sm font-bold text-white/70">
            {swarm.totalTime !== null ? `${swarm.totalTime.toFixed(1)}s` : swarm.isRunning ? <Loader2 size={12} className="animate-spin inline text-[#D4A373]" /> : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/25 mb-1">LLM Engine</div>
          <div className="text-sm font-bold text-white/70">
            {swarm.llmEnabled ? (
              <span className="text-[#8FBC8F]">Active</span>
            ) : (
              <span className="text-white/30">Heuristic</span>
            )}
          </div>
        </div>
      </div>

      {/* Agent grid — Gantt-style timeline */}
      <div className="px-5 py-4 space-y-1.5">
        <AnimatePresence>
          {swarm.agents.map((agent) => {
            const startPct = agent.startedAt !== null ? (agent.startedAt / maxTime) * 100 : 0;
            const widthPct = agent.duration !== null
              ? Math.max((agent.duration / maxTime) * 100, 2)
              : agent.status === "running"
                ? 100 - startPct
                : 2;

            return (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 group"
              >
                {/* Agent name */}
                <div className="w-28 md:w-36 flex items-center gap-2 shrink-0">
                  <StatusIcon status={agent.status} />
                  <span className="text-[10px] text-white/40 truncate tracking-wide">{agent.name}</span>
                </div>

                {/* Timeline bar */}
                <div className="flex-1 h-5 bg-white/[0.02] rounded-sm relative overflow-hidden">
                  <motion.div
                    className={`absolute top-0.5 bottom-0.5 rounded-sm ${barColor(agent.status)}`}
                    initial={{ width: 0 }}
                    animate={{
                      left: `${startPct}%`,
                      width: `${widthPct}%`,
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    style={{ opacity: agent.status === "running" ? 0.6 : 0.4 }}
                  />
                </div>

                {/* Score + confidence + time */}
                <div className="w-28 md:w-32 flex items-center justify-end gap-1.5 shrink-0">
                  <ConfidenceBadge confidence={agent.confidence} />
                  {agent.score !== null ? (
                    <span className={`text-[10px] font-bold ${scoreColor(agent.score)}`}>
                      {agent.score}/100
                    </span>
                  ) : agent.status === "running" ? (
                    <span className="text-[10px] text-white/15">···</span>
                  ) : null}
                  {agent.duration !== null && (
                    <span className="text-[9px] text-white/20">{agent.duration.toFixed(1)}s</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Timeline axis + legend */}
      <div className="px-5 pb-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-28 md:w-36 shrink-0" />
          <div className="flex-1 flex justify-between text-[8px] text-white/15 tracking-wider">
            <span>0s</span>
            <span>{(maxTime * 0.25).toFixed(0)}s</span>
            <span>{(maxTime * 0.5).toFixed(0)}s</span>
            <span>{(maxTime * 0.75).toFixed(0)}s</span>
            <span>{maxTime.toFixed(0)}s</span>
          </div>
          <div className="w-28 md:w-32 shrink-0" />
        </div>
        <div className="flex items-center gap-3 text-[9px] text-white/20 tracking-wide">
          <Clock size={10} className="text-white/15 shrink-0" />
          <span>Each bar shows the execution time of an individual audit agent — from dispatch to result. Overlapping bars indicate parallel execution.</span>
        </div>
      </div>

      {/* Oracle Governance Verdict */}
      {swarm.oracle.lines.length > 0 && (
        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} className="text-[#8FBC8F]/60" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/50 font-bold">Oracle Governance</span>
          </div>

          {/* Confidence summary badges */}
          <div className="flex items-center gap-4 mb-3">
            {swarm.oracle.high > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] text-[#8FBC8F]/60">
                <ShieldCheck size={10} /> {swarm.oracle.high} trusted
              </span>
            )}
            {swarm.oracle.low > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] text-[#D4A373]">
                <ShieldAlert size={10} /> {swarm.oracle.low} low confidence
              </span>
            )}
            {swarm.oracle.overridden > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] text-red-400">
                <ShieldX size={10} /> {swarm.oracle.overridden} overridden
              </span>
            )}
          </div>

          {/* Oracle log lines */}
          <div className="space-y-1">
            {swarm.oracle.lines.map((line, i) => {
              const isError = line.includes('✗') || line.includes('overridden');
              const isWarn = line.includes('⚠') || line.includes('LOW') || line.includes('Anomaly');
              const isOk = line.includes('✓') || line.includes('Validated');
              const cleanLine = line.replace('[ORACLE] ', '');
              return (
                <p key={i} className={`text-[10px] tracking-wide ${
                  isError ? 'text-red-400/70' : isWarn ? 'text-[#D4A373]/70' : isOk ? 'text-[#8FBC8F]/60' : 'text-white/25'
                }`}>
                  {cleanLine}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
};
