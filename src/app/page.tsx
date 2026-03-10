"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AuditResponse | null>(null);
  const [logs, setLogs] = useState<{type: 'ok'|'warn'|'info', text: string}[]>([
    {type: 'ok', text: 'INITIALIZING ARCHIVE ACCESS...'},
    {type: 'ok', text: 'LOADING SILICON_SOUL_MODULES...'},
    {type: 'info', text: 'WAITING FOR TARGET URL...'}
  ]);

  const handleAudit = async () => {
    if (!url) return;
    setLoading(true);
    setResults(null);
    setLogs(prev => [
      ...prev, 
      {type: 'info', text: `FETCHING TARGET DATA_STREAM FOR ${url.toUpperCase()}...`}
    ]);
    
    try {
      const res = await fetch("/api/audit", { method: "POST", body: JSON.stringify({ url }) });
      const data = await res.json();
      setResults(data);
      
      const newLogs = data.log.map((l: string) => {
        let type: 'ok'|'warn'|'info' = 'info';
        if (l.includes('[+]') || l.includes('Success') || l.includes('Found')) type = 'ok';
        if (l.includes('[-]') || l.includes('Missing') || l.includes('Failed')) type = 'warn';
        return { type, text: l.replace(/\[\+\]|\[-\]/g, '').trim().toUpperCase() };
      });
      
      setLogs(prev => [...prev, ...newLogs, {type: 'ok', text: 'HANDSHAKE_PROTOCOL SUCCESSFUL'}]);
    } catch (e) {
      setLogs(prev => [...prev, {type: 'warn', text: 'CONNECTION_REFUSED OR TIMEOUT'}]);
    } finally {
      setLoading(false);
    }
  };

  const metricsData = results ? [
    { 
      id: "citability", 
      label: "Citability", 
      data: results.citability,
      description: "Analyzes content structure for 'Answer Blocks' that LLMs prefer to extract and cite in their generative responses. High scores indicate strong agent-friendly formatting."
    },
    { 
      id: "schema", 
      label: "Schema", 
      data: results.schema,
      description: "Validates structured JSON-LD data to ensure accurate identity resolution across the global entity graph, preventing collisions and hallucinated associations."
    },
    { 
      id: "technical", 
      label: "Technical", 
      data: results.technical,
      description: "Evaluates raw technical vitals including performance, accessibility, and crawlability metrics that affect how aggressively agents index the domain."
    },
    { 
      id: "a2a", 
      label: "A2A Protocol", 
      data: results.a2a,
      description: "Verifies the presence and validity of Agent-to-Agent communication protocols, specifically robots.txt optimizations and the emerging llms.txt standard."
    }
  ] : [];

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#DCDCDC] p-6 md:p-12 font-mono relative flex flex-col items-center">
      <header className="w-full max-w-7xl flex justify-between items-center mb-16 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 border border-[#D4A373] flex items-center justify-center rounded-sm">
            <div className="w-3 h-3 bg-[#D4A373]" />
          </div>
          <h1 className="text-xl tracking-[0.3em] uppercase text-[#D4A373]">Agentic_Auditor</h1>
        </div>
        <div className="hidden md:flex gap-6 text-[10px] text-white/30 uppercase tracking-widest">
           <span>Sys: v1.3.0</span>
           <span>Net: Secure</span>
        </div>
      </header>

      <div className="w-full max-w-7xl space-y-16">
        <div className="max-w-2xl">
          <AuditForm url={url} loading={loading} onUrlChange={setUrl} onAudit={handleAudit} />
        </div>

        <AnimatePresence>
          {results && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
               <MetricsGrid metrics={metricsData} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="border border-white/10 bg-[#050505] p-6 rounded-sm max-w-3xl">
          <div className="text-[10px] text-[#D4A373] uppercase tracking-widest mb-4">
            SYSTEM_TELEMETRY_LOG
          </div>
          <div className="h-40 overflow-y-auto text-[11px] font-mono space-y-2 scrollbar-hide">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3">
                <span className={`w-12 shrink-0 ${log.type === 'ok' ? 'text-[#8FBC8F]' : log.type === 'warn' ? 'text-[#D4A373]' : 'text-white/40'}`}>
                  [{log.type === 'info' ? 'SYS' : log.type.toUpperCase()}]
                </span>
                <span className="text-white/60">{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="w-full max-w-7xl mt-auto pt-24 pb-8 text-center border-t border-white/5 mt-32">
         <div className="text-[10px] text-white/30 uppercase tracking-[0.3em]">
            DEVELOPED BY <span className="text-[#D4A373] ml-1">EDUARDO ARANA & SODA 🥤</span>
         </div>
      </footer>
    </main>
  );
}
