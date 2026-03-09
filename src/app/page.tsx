"use client";

import { useState } from "react";
import { Terminal, Shield, Cpu, Zap, Search } from "lucide-react";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>(["// Session log initialized...", "[Wait] Awaiting target URL for agentic evaluation..."]);
  const [results, setResults] = useState<AuditResponse | null>(null);

  const handleAudit = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      setResults(data);
      setLogs(prev => [...prev, ...data.log]);
    } catch (e) {
      setLogs(prev => [...prev, "[Fatal] Connection failed."]);
    } finally {
      setLoading(false);
    }
  };

  const metricsData = results ? [
    { id: "citability", label: "Citability Analysis", data: results.citability },
    { id: "schema", label: "Schema Authority", data: results.schema },
    { id: "technical", label: "Technical GEO Vitals", data: results.technical },
    { id: "a2a", label: "A2A Handshake", data: results.a2a }
  ] : [];

  return (
    <main className="min-h-screen bg-[#050505] text-[#00FF41] p-6 md:p-12 font-mono relative flex flex-col items-center">
      <div className="fixed inset-0 pointer-events-none z-50 mix-blend-overlay opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      <header className="w-full max-w-5xl flex justify-between items-center mb-12 border-b border-[#00FF41]/20 pb-4">
        <div className="flex items-center gap-3">
          <Terminal className="animate-pulse" />
          <h1 className="text-lg tracking-[0.2em] font-bold uppercase">Agentic Auditor</h1>
        </div>
      </header>

      <div className="w-full max-w-5xl space-y-12">
        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block border border-[#00FF41]/40 px-3 py-1 text-[10px] mb-4 tracking-widest uppercase bg-[#00FF41]/5">
              GEO // AI-Readiness Protocol
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tighter text-white">
              Verify your site's <span className="text-[#00FF41]">Agent Connectivity.</span>
            </h2>
            <p className="text-sm text-[#00FF41]/70 leading-relaxed">
              The Agentic Auditor is a production-grade diagnostic engine that evaluates how effectively your domain communicates with LLMs and AI Agents.
            </p>
          </div>
          <AuditForm url={url} loading={loading} onUrlChange={setUrl} onAudit={handleAudit} />
        </div>

        {/* Results Area */}
        {results && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <MetricsGrid metrics={metricsData} />
             <div className="border border-[#00FF41]/20 bg-black p-6 h-48 overflow-y-auto text-[11px] scrollbar-hide">
                {logs.map((log, i) => <p key={i}>{log}</p>)}
             </div>
          </div>
        )}

        {/* Explanation Section (The "What it does") */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 border-t border-[#00FF41]/10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#00FF41]">
              <Search size={18} />
              <h3 className="text-xs font-bold uppercase">AI Citability</h3>
            </div>
            <p className="text-[11px] text-[#00FF41]/60 leading-relaxed">
              We analyze your content structure for "Answer Blocks." This ensures Perplexity, SearchGPT, and Claude can extract and cite your data accurately.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#00FF41]">
              <Shield size={18} />
              <h3 className="text-xs font-bold uppercase">Semantic Identity</h3>
            </div>
            <p className="text-[11px] text-[#00FF41]/60 leading-relaxed">
              Validation of JSON-LD Schema. We verify your Person and Organization identities to resolve entity collisions and build deterministic trust with engines.
            </p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#00FF41]">
              <Zap size={18} />
              <h3 className="text-xs font-bold uppercase">Crawler Handshake</h3>
            </div>
            <p className="text-[11px] text-[#00FF41]/60 leading-relaxed">
              Optimization of robots.txt and detection of the llms.txt standard. We ensure AI bots have an explicit map and permission to index your most valuable context.
            </p>
          </div>
        </section>
      </div>

      <footer className="w-full max-w-5xl mt-24 border-t border-[#00FF41]/10 pt-8 pb-12 text-center">
        <p className="text-[10px] opacity-40 uppercase tracking-[0.3em]">
          Developed by Eduardo Arana & Soda 🥤
        </p>
      </footer>
    </main>
  );
}
