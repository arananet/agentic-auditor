"use client";

import { useState, useRef } from "react";
import { Bot, Zap, ArrowRight, Download, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AuditResponse | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleAudit = async () => {
    if (!url) return;
    setLoading(true);
    setResults(null);
    setLogs(["[INIT] Handshaking with target domain...", "[SCAN] Probing GEO spectrum levels..."]);
    try {
      const res = await fetch("/api/audit", { method: "POST", body: JSON.stringify({ url }) });
      const data = await res.json();
      setResults(data);
      setLogs(prev => [...prev, ...data.log]);
    } catch (e) {
      setLogs(prev => [...prev, "[ERROR] Connection failure."]);
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => {
    window.print();
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
          nav, section#hero, div#audit-form, .no-print {
            display: none !important;
          }
          main { background: white !important; color: black !important; }
          .print-only { display: block !important; }
          .card-glass { border: 1px solid #eee !important; background: white !important; page-break-inside: avoid; }
          .text-white { color: black !important; }
          .text-accent, h3 { color: #8B4513 !important; }
          .border-white\\/5 { border-color: #ddd !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Navbar */}
      <nav className="max-w-[1400px] mx-auto px-6 py-6 flex justify-between items-center relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A1A1A] border border-white/10 rounded-sm flex items-center justify-center">
            <Bot className="text-[#D4A373]" size={18} />
          </div>
          <span className="font-normal text-sm tracking-[0.2em] text-white/80 uppercase">Agentic Auditor</span>
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
          className="max-w-2xl mx-auto text-white/50 text-sm md:text-base leading-relaxed mb-16 tracking-wide"
        >
          Evaluate your domain against 11 specifications from the Geo Agentic Auditor framework. Detect gaps in AI visibility and download a Technical Remediation Report for your team.
        </motion.p>
      </section>

      {/* Audit Tool Section */}
      <section id="audit-section" className="max-w-[1400px] mx-auto px-6 pb-32">
         <div id="audit-form" className="max-w-3xl mx-auto mb-16">
            <AuditForm url={url} loading={loading} onUrlChange={setUrl} onAudit={handleAudit} />
         </div>
         
         <AnimatePresence>
            {results && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                 {/* PRINT HEADER */}
                 <div className="print-only mb-12 border-b-2 border-black pb-8">
                    <h1 className="text-4xl font-bold uppercase tracking-tighter mb-2">GEO Agentic Auditor</h1>
                    <p className="text-xl italic mb-8">Technical Readiness Report: {url}</p>
                    <div className="grid grid-cols-2 gap-8 bg-gray-50 p-6 border border-gray-200">
                       <div>
                          <p className="text-xs uppercase font-bold text-gray-500">Overall Readiness Score</p>
                          <p className="text-5xl font-light">{results.overallScore}/100</p>
                       </div>
                       <div>
                          <p className="text-xs uppercase font-bold text-gray-500">Status</p>
                          <p className={`text-2xl ${results.overallScore >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
                             {results.overallScore >= 80 ? 'OPTIMIZED' : 'NEEDS ATTENTION'}
                          </p>
                       </div>
                    </div>
                 </div>

                 <div className="flex items-center justify-between pb-4 border-b border-white/5 no-print">
                   <div className="flex items-center gap-4 text-xs text-white/40 uppercase tracking-[0.3em]">
                      <span className="w-2 h-2 rounded-full bg-[#8FBC8F] animate-pulse"></span>
                      Diagnostic_Report_Loaded
                   </div>
                   <button 
                     onClick={printReport}
                     className="flex items-center gap-2 text-xs text-[#D4A373] hover:text-[#E5B586] transition-colors tracking-widest uppercase font-bold"
                   >
                     <FileText size={14} /> Download Technical PDF Report
                   </button>
                 </div>
                 
                 <MetricsGrid metrics={metricsData} />
                 
                 {/* OVERALL SCORE SECTION */}
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
                 <div className="mt-8 border border-white/5 bg-[#0D0D0D] p-6 font-mono text-[11px] h-40 overflow-y-auto text-white/40 tracking-wider no-print">
                    {logs.map((log, i) => (
                      <p key={i} className={`mb-1 ${log.includes('[ERROR]') ? 'text-red-400/80' : log.includes('[OK]') ? 'text-[#8FBC8F]/80' : ''}`}>
                        {log}
                      </p>\
                    ))}\
                 </div>
              </motion.div>
            )}\
         </AnimatePresence>
      </section>\
\
      {/* Footer */}\
      <footer className=\"border-t border-white/5 py-12 text-center no-print\">\
         <div className=\"text-xs text-white/30 uppercase tracking-widest\">\
            Developed by <span className=\"text-[#D4A373] ml-1\">Eduardo Arana & Soda 🥤</span>\
         </div>\
      </footer>\
    </main>\
  );\
}\
