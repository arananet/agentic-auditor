"use client";

import { useState } from "react";
import { Terminal, Globe, Bot } from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "// SESSION_LOG_INIT...",
    "[WAIT] Awaiting target URL for agentic evaluation...",
  ]);
  
  const [metrics, setMetrics] = useState([
    { id: "citability", label: "Citability_Analysis", status: "WAITING", score: "--" },
    { id: "schema", label: "Schema_Authority_Check", status: "WAITING", score: "--" },
    { id: "technical", label: "Technical_GEO_Vitals", status: "WAITING", score: "--" },
    { id: "a2a", label: "A2A_Handshake_Verify", status: "WAITING", score: "--" }
  ]);

  const handleAudit = async () => {
    if (!url) return;
    
    setLoading(true);
    setLogs(["// SESSION_LOG_INIT...", `[OK] INITIALIZING SCAN FOR ${url}...`]);
    setMetrics(m => m.map(item => ({ ...item, status: "SCANNING", score: "..." })));

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, ...data.log]);
        
        setMetrics([
          { id: "citability", label: "Citability_Analysis", status: data.citability.status, score: `${data.citability.score}/100` },
          { id: "schema", label: "Schema_Authority_Check", status: data.schema.status, score: `${data.schema.score}/100` },
          { id: "technical", label: "Technical_GEO_Vitals", status: data.technical.status, score: `${data.technical.score}/100` },
          { id: "a2a", label: "A2A_Handshake_Verify", status: data.a2a.status, score: `${data.a2a.score}/100` }
        ]);
      } else {
        setLogs(prev => [...prev, `[ERROR] ${data.error}`]);
        setMetrics(m => m.map(item => ({ ...item, status: "ERROR", score: "0" })));
      }
    } catch (e) {
      setLogs(prev => [...prev, "[FATAL] CONNECTION FAILED."]);
      setMetrics(m => m.map(item => ({ ...item, status: "ERROR", score: "0" })));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-[#00FF41] p-6 font-mono selection:bg-[#00FF41] selection:text-black relative overflow-hidden flex flex-col">
      <div className="fixed inset-0 pointer-events-none z-50 mix-blend-overlay opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      <header className="flex justify-between items-center mb-12 border-b border-[#00FF41]/20 pb-4">
        <div className="flex items-center gap-3">
          <Terminal className="animate-pulse" />
          <h1 className="text-lg tracking-[0.2em] font-bold">GEO_AGENTIC_AUDITOR_V1.0</h1>
        </div>
        <div className="text-[10px] opacity-50 uppercase tracking-widest">
          Status: Agent_Link_Active
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-8 w-full flex-grow">
        {/* Search Input */}
        <div className="border border-[#00FF41]/30 bg-[#00FF41]/5 p-8 relative">
          <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[#00FF41]" />
          <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-[#00FF41]" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-[#00FF41]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-[#00FF41]" />
          
          <h2 className="text-sm mb-6 flex items-center gap-2">
            <Globe size={14} /> INITIALIZE_SITE_SCAN
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://arananet.net"
              className="flex-grow bg-black border border-[#00FF41]/20 p-3 text-sm focus:outline-none focus:border-[#00FF41] transition-colors placeholder:opacity-20"
              onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
            />
            <button 
              onClick={handleAudit}
              disabled={loading}
              className={`bg-[#00FF41] text-black px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(0,255,65,0.3)] ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#00FF41]/80'}`}
            >
              {loading ? "Scanning..." : "Execute_Audit"}
            </button>
          </div>
        </div>

        {/* Progress Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.map((task, i) => (
            <div key={task.id} className="border border-[#00FF41]/10 p-4 flex justify-between items-center bg-white/5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-[#00FF41]/5 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
              <div className="flex flex-col relative z-10">
                <span className="text-[10px] opacity-40 uppercase">Task_ID: 0{i+1}</span>
                <span className="text-xs">{task.label}</span>
              </div>
              <div className="text-right relative z-10">
                 <div className={`text-[10px] font-bold ${task.status === 'ERROR' || task.status === 'WARN' ? 'text-red-500' : 'text-[#00FF41]'}`}>{task.status}</div>
                 <div className="text-lg">{task.score}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Telemetry Log */}
        <div className="border border-[#00FF41]/20 bg-black p-6 font-mono text-[11px] leading-relaxed opacity-80 h-48 overflow-y-auto">
          {logs.map((log, i) => (
            <p key={i} className={log.includes('[WARN]') || log.includes('[ERROR]') ? 'text-red-500' : ''}>
              {log}
            </p>
          ))}
        </div>
      </div>

      <footer className="mt-20 border-t border-[#00FF41]/10 pt-8 text-center">
        <p className="text-[10px] opacity-40 uppercase tracking-[0.4em] mb-4">
          Developed by Eduardo Arana and Soda 🥤
        </p>
        <div className="flex justify-center gap-6">
          <Bot size={16} className="opacity-20 hover:opacity-100 transition-opacity cursor-pointer" />
          <Terminal size={16} className="opacity-20 hover:opacity-100 transition-opacity cursor-pointer" />
          <Globe size={16} className="opacity-20 hover:opacity-100 transition-opacity cursor-pointer" />
        </div>
      </footer>
    </main>
  );
}
