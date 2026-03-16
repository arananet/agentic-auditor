"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, Zap, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AuditResponse | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [queueInfo, setQueueInfo] = useState<{ position: number, status: string } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // useRef (not useState) to track consumed log lines — avoids React StrictMode
  // double-invoking the updater and appending the same lines twice.
  const knownLogCountRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  const handleAudit = async (token: string) => {
    if (!url) return;
    setLoading(true);
    setResults(null);
    setQueueInfo(null);
    knownLogCountRef.current = 0;
    setLogs(["[INIT] Handshaking with server queue..."]);
    try {
      const res = await fetch("/api/audit", { method: "POST", body: JSON.stringify({ url, token }) });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      setActiveJobId(data.jobId);
      setQueueInfo({ position: data.position, status: data.status });
      setLogs(prev => [...prev, `[QUEUE] Ticket assigned: ${data.jobId}`, `[QUEUE] Position: ${data.position}`]);
    } catch (e: any) {
      setLogs(prev => [...prev, `[ERROR] Connection failure: ${e.message}`]);
      setLoading(false);
    }
  };

  // Auto-scroll the log panel as new lines arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audit?jobId=${activeJobId}`);
        const data = await res.json();
        
        if (data.error && !data.status) {
           setLogs(prev => [...prev, `[ERROR] Queue ticket expired or invalid.`]);
           setActiveJobId(null);
           setLoading(false);
           clearInterval(interval);
           return;
        }

        setQueueInfo({ position: data.position, status: data.status });

        // Stream any new live log lines the server has accumulated since last poll
        const liveLogs: string[] = data.log ?? [];
        const newLines = liveLogs.slice(knownLogCountRef.current);
        if (newLines.length > 0) {
          knownLogCountRef.current = liveLogs.length;
          setLogs(existing => [...existing, ...newLines]);
        }
        
        if (data.status === 'completed') {
           setResults(data.result);
           // If live log was empty (cache hit), fall back to result log
           if (liveLogs.length === 0 && data.result?.log?.length) {
             setLogs(prev => [...prev, ...data.result.log]);
           }
           setActiveJobId(null);
           setLoading(false);
           clearInterval(interval);
        } else if (data.status === 'failed') {
           setLogs(prev => [...prev, `[FATAL] Scan failed: ${data.error}`]);
           setActiveJobId(null);
           setLoading(false);
           clearInterval(interval);
        } else if (data.status === 'queued') {
           setLogs(prev => {
             const last = prev[prev.length - 1];
             if (!last.includes(`Position: ${data.position}`)) {
                return [...prev, `[QUEUE] Waiting in line... Position: ${data.position}`];
             }
             return prev;
           });
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeJobId]);

  const printReport = () => {
    const site = url.replace(/^https?:\/\//, '').replace(/[\/\\?#:*"<>|]+/g, '_').replace(/_+$/, '');
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const prev = document.title;
    document.title = `GEO_Audit_${site}_${ts}`;
    window.print();
    document.title = prev;
  };

  const metricsData = results ? [
    { id: "citability", label: "CITABILITY", data: results.citability, description: "Checks if your content uses simple, direct facts that AI can easily quote." },
    { id: "schema", label: "SEMANTIC_SCHEMA", data: results.schema, description: "Validates 'Identity Data' (JSON-LD) to ensure AI knows who your brand is." },
    { id: "technical", label: "TECHNICAL", data: results.technical, description: "Checks if your site code is fast and readable for AI crawlers." },
    { id: "llmstxt", label: "LLMS_TXT_PROTOCOL", data: results.a2a, description: "Verifies your 'AI Handshake' file (llms.txt) for direct agent ingestion." },
    { id: "brandMentions", label: "BRAND_AUTHORITY", data: results.brandMentions, description: "Analyzes external links to Wikipedia and social media to verify your brand legitimacy." },
    { id: "contentQuality", label: "CONTENT_EEAT", data: results.contentQuality, description: "Scans for clear author names and recent update dates to build AI trust." },
    { id: "intentMatch", label: "INTENT_MATCH", data: results.intentMatch, description: "Checks if your headings use questions like 'How' or 'What' to match user prompts." },
    { id: "structural", label: "STRUCTURAL_GEO", data: results.structural, description: "Analyzes lists, tables, and HTML tags that help AI scan your page." },
    { id: "semantic", label: "SEMANTIC_DEPTH", data: results.semantic, description: "Measures if you provide enough detailed information for deep AI understanding." },
    { id: "media", label: "MEDIA_CONTEXT", data: results.media, description: "Checks if your images have descriptions (alt text) so AI can 'see' them." },
    { id: "sentiment", label: "TONE_ALIGNMENT", data: results.sentiment, description: "Ensures your tone is factual and calm, which AI engines prefer for citations." }
  ] : [];

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#DCDCDC] font-mono">
      <style jsx global>{`
        @media print {
          @page {
             margin: 0;
          }
          nav, section#hero, div#audit-form, .no-print, .log-container {
            display: none !important;
          }
          body, main { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .print-only { display: block !important; }
          .report-page { page-break-after: always; padding: 2cm; min-height: 29.7cm; position: relative; }
          .finding-card { border: 1px solid #eee; padding: 1rem; margin-bottom: 1.5rem; page-break-inside: avoid; }
          .text-accent { color: #8B4513 !important; }
          .text-muted { color: #666 !important; }
          .status-ready { color: #2e7d32 !important; }
          .status-warn { color: #ed6c02 !important; }
          .status-failed { color: #d32f2f !important; }
          h2, h3 { color: black !important; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
          .bg-grey { background: #f9f9f9 !important; }
          .report-footer { position: absolute; bottom: 1cm; left: 2cm; font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 2px; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Navbar */}
      <nav className="max-w-[1400px] mx-auto px-6 py-6 flex justify-between items-center relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A1A1A] border border-white/10 rounded-sm flex items-center justify-center">
            <Bot className="text-[#D4A373]" size={18} />
          </div>
          <span className="font-normal text-sm tracking-[0.2em] text-white/80 uppercase">Geo Agentic Auditor</span>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="max-w-4xl mx-auto px-6 pt-24 pb-24 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] border border-white/5 text-white/40 text-[10px] uppercase tracking-[0.3em] mb-12"
        >
          <Zap size={12} className="text-[#D4A373]" />
          Now supporting 11 GEO Parameters
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl md:text-6xl font-normal tracking-wide mb-8 leading-tight text-white/90"
        >
          Validate Site Readiness <br/>
          <span className="text-[#D4A373] italic">Before The Agents Arrive</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-2xl mx-auto text-white/50 text-sm md:text-base leading-relaxed mb-10 tracking-wide"
        >
          Elevate your website against 11 GEO/SEO specifications. Detect gaps that could affect AI visibility and download a technical remediation report for your technical agency.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A1A0A] border border-[#D4A373]/20 text-[10px] uppercase tracking-[0.2em] mb-16"
        >
          <span className="text-[#D4A373]/60">⚡</span>
          <span className="text-white/40">Powered by Cloudflare Workers AI{" "}<span className="text-[#D4A373]/60">Free Tier</span>{" — limited to "}<span className="text-[#D4A373]/60">10,000 neurons / day</span></span>
        </motion.div>
      </section>

      {/* Audit Tool Section */}
      <section id="audit-section" className="max-w-[1400px] mx-auto px-6 pb-32">
         <div id="audit-form" className="max-w-3xl mx-auto mb-16">
            <AuditForm 
              url={url} 
              loading={loading} 
              queueStatus={queueInfo?.status}
              queuePosition={queueInfo?.position}
              onUrlChange={setUrl} 
              onAudit={(token) => handleAudit(token)} 
            />
         </div>
         
         <AnimatePresence>
            {results && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                 {/* WEB REPORT HEADER */}
                 <div className="flex items-center justify-between pb-4 border-b border-white/5 no-print">
                   <div className="flex items-center gap-4 text-xs text-white/40 uppercase tracking-[0.3em]">
                      <span className="w-2 h-2 rounded-full bg-[#8FBC8F] animate-pulse"></span>
                      Diagnostic_Report_Loaded
                   </div>
                   <button 
                     onClick={printReport}
                     className="flex items-center gap-2 text-xs text-[#D4A373] hover:text-[#E5B586] transition-colors tracking-widest uppercase font-bold border border-[#D4A373]/20 px-4 py-2 bg-[#D4A373]/5"
                   >
                     <FileText size={14} /> Download Technical PDF Report
                   </button>
                 </div>
                 
                 <MetricsGrid metrics={metricsData} />

                 {/* PRINT ONLY: DETAILED TECHNICAL REPORT */}
                 <div className="print-only">
                    {/* PAGE 1: EXECUTIVE SUMMARY */}
                    <div className="report-page">
                       <h1 className="text-4xl font-bold uppercase mb-2">Geo Agentic Auditor</h1>
                       <p className="text-sm text-muted mb-12 italic border-b pb-4">Comprehensive Technical Readiness Report for {url}</p>
                       
                       <div className="mb-12">
                          <h2 className="text-2xl font-normal mb-6">Executive Summary</h2>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="bg-grey p-8 border">
                                <p className="text-xs uppercase font-bold text-gray-500 mb-2">Overall Score</p>
                                <p className="text-7xl font-light">{results.overallScore}/100</p>
                             </div>
                             <div className="bg-grey p-8 border">
                                <p className="text-xs uppercase font-bold text-gray-500 mb-2">Technical Status</p>
                                <p className={`text-3xl font-bold ${results.overallScore >= 80 ? 'status-ready' : 'status-warn'}`}>
                                   {results.overallScore >= 80 ? 'OPTIMIZED' : 'NEEDS ATTENTION'}
                                </p>
                             </div>
                          </div>
                       </div>

                       <div className="prose prose-sm max-w-none">
                          <h3 className="uppercase tracking-widest text-sm font-bold mb-4">Methodology</h3>
                          <p className="text-xs leading-relaxed text-muted">
                             This report was generated using the Geo Agentic Auditor framework. The audit evaluates a domain across 11 technical dimensions required for high-fidelity discovery by Generative AI engines (ChatGPT, Claude, Perplexity, SearchGPT). Unlike traditional SEO, which focuses on human search behavior, this audit focuses on machine-readable context, semantic identity resolution, and authoritative citation triggers.
                          </p>
                       </div>
                       
                       <div className="report-footer">Geo Agentic Auditor</div>
                    </div>

                    {/* PAGE 2-X: DETAILED METRICS */}
                    <div className="report-page">
                       <h2 className="text-2xl mb-8 uppercase">Detailed Analysis & Remediation</h2>
                       
                       {metricsData.map((m, idx) => (
                          <div key={m.id} className="finding-card mb-12">
                             <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold border-none p-0 m-0">{m.label}</h3>
                                <div className="text-right">
                                   <span className="text-xs font-bold mr-2 text-muted uppercase">Score:</span>
                                   <span className="text-xl font-bold">{m.data.score}/100</span>
                                </div>
                             </div>
                             <p className="text-sm italic text-muted mb-6">{m.description}</p>
                             
                             <div className="space-y-6">
                                {m.data.details.map((detail, dIdx) => (
                                   <div key={dIdx} className="bg-gray-50 p-4 border-l-4 border-black">
                                      <p className="font-bold text-sm mb-2">{detail.message}</p>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         <div>
                                            <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Analysis</p>
                                            <p className="text-xs text-muted leading-relaxed">{detail.explanation}</p>
                                         </div>
                                         <div>
                                            <p className="text-[10px] uppercase font-bold text-green-600 mb-1">How To Fix</p>
                                            <p className="text-xs leading-relaxed font-mono p-2 bg-white border border-gray-100">{detail.remediation}</p>
                                         </div>
                                      </div>
                                   </div>
                                ))}
                             </div>
                          </div>
                       ))}
                       <div className="report-footer">Geo Agentic Auditor</div>
                    </div>

                    {/* FINAL PAGE: CREDITS */}
                    <div className="report-page flex flex-col items-center justify-center text-center">
                       <Bot size={48} className="mb-6 text-gray-300" />
                       <h2 className="text-3xl font-bold uppercase tracking-widest mb-4 border-none">Geo Agentic Auditor</h2>
                       <p className="text-sm text-muted max-w-md mb-12">
                          High-fidelity readiness evaluation for the generative search era.
                       </p>
                       <div className="border-t border-gray-100 pt-8">
                          <p className="text-xs text-gray-400 uppercase tracking-[0.4em] mb-2">Developed By</p>
                          <p className="text-xl font-bold">Eduardo Arana & Soda 🥤</p>
                       </div>
                    </div>
                 </div>
                 
                 {/* WEB ONLY: OVERALL SCORE SECTION */}
                 <div className="mt-12 p-8 border border-[#D4A373]/30 bg-[#D4A373]/5 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden no-print">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4A373] opacity-5 blur-[100px] rounded-full pointer-events-none" />
                    
                    <div>
                      <h2 className="text-2xl text-[#D4A373] tracking-[0.2em] uppercase mb-4 font-normal">Overall GEO Readiness</h2>
                      <p className="text-sm text-white/60 max-w-2xl leading-relaxed">
                        This composite score represents your domain's total compatibility with Generative AI engines. Download the Technical PDF for a detailed breakdown of findings and fix instructions.
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-1">Status</div>
                        <div className={`text-base font-bold tracking-widest ${results.overallScore >= 80 ? 'text-[#8FBC8F]' : results.overallScore >= 50 ? 'text-[#D4A373]' : 'text-red-400'}`}>
                          {results.overallScore >= 80 ? 'OPTIMIZED' : results.overallScore >= 50 ? 'NEEDS_WORK' : 'POOR'}
                        </div>
                      </div>
                      
                      <div className="text-7xl font-light text-white tracking-tighter">
                        {results.overallScore}<span className="text-2xl text-white/20 ml-2">/100</span>
                      </div>
                    </div>
                 </div>

                 {/* Raw Logs */}
                 
              </motion.div>
            )}
         </AnimatePresence>

         {/* Extracted Raw Logs outside of results wrapper so queue logs show immediately */}
         {(logs.length > 0 || loading) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                 <div className="log-container mt-8 border border-white/5 bg-[#0D0D0D] p-6 font-mono text-[11px] h-56 overflow-y-auto text-white/40 tracking-wider no-print">
                    {logs.map((log, i) => (
                      <p key={i} className={`mb-1 ${
                        log.includes('[ERROR]') || log.includes('[FATAL]') || log.includes('[FAIL]') ? 'text-red-400/80' :
                        log.includes('[OK]') ? 'text-[#8FBC8F]/80' :
                        log.includes('[WARN]') ? 'text-[#D4A373]/80' :
                        log.includes('[QUEUE]') ? 'text-blue-400/80' :
                        log.includes('[SCAN]') ? 'text-white/25 italic' :
                        ''
                      }`}>
                        {log}
                      </p>
                    ))}
                    <div ref={logEndRef} />
                 </div>
            </motion.div>
         )}

      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center no-print">
         <div className="text-xs text-white/30 uppercase tracking-widest">
            Developed by <span className="text-[#D4A373] ml-1">Eduardo Arana & Soda 🥤</span>
         </div>
      </footer>
    </main>
  );
}
