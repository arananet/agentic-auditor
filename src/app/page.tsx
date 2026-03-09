"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>(["// SESSION_LOG_INIT...", "[WAIT] Awaiting target URL..."]);
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
      setLogs(prev => [...prev, "[FATAL] CONNECTION FAILED."]);
    } finally {
      setLoading(false);
    }
  };

  const metricsData = results ? [
    { id: "citability", label: "Citability_Analysis", data: results.citability },
    { id: "schema", label: "Schema_Authority_Check", data: results.schema },
    { id: "technical", label: "Technical_GEO_Vitals", data: results.technical },
    { id: "a2a", label: "A2A_Handshake_Verify", data: results.a2a }
  ] : [];

  return (
    <main className="min-h-screen bg-[#050505] text-[#00FF41] p-6 font-mono relative flex flex-col">
      <header className="flex justify-between items-center mb-12 border-b border-[#00FF41]/20 pb-4">
        <div className="flex items-center gap-3">
          <Terminal className="animate-pulse" />
          <h1 className="text-lg tracking-[0.2em] font-bold uppercase">Agentic_Auditor_v1</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-8 w-full flex-grow">
        <AuditForm url={url} loading={loading} onUrlChange={setUrl} onAudit={handleAudit} />
        {results && <MetricsGrid metrics={metricsData} />}
        
        <div className="border border-[#00FF41]/20 bg-black p-6 h-48 overflow-y-auto text-[11px]">
          {logs.map((log, i) => <p key={i}>{log}</p>)}
        </div>
      </div>

      <footer className="mt-20 border-t border-[#00FF41]/10 pt-8 text-center text-[10px] opacity-40 uppercase">
        Developed by Eduardo Arana and Soda 🥤
      </footer>
    </main>
  );
}
