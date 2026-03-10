"use client";

import { useState } from "react";
import { Bot, Zap, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AuditResponse | null>(null);
  const [logs, setLogs] = useState<string[]>(["[INIT] Establishing handshake with target...", "[SCAN] Probing GEO spectrum..."]);

  const handleAudit = async () => {
    if (!url) return;
    setLoading(true);
    setResults(null);
    setLogs(["[INIT] Establishing handshake with target...", "[SCAN] Probing GEO spectrum..."]);
    try {
      const res = await fetch("/api/audit", { method: "POST", body: JSON.stringify({ url }) });
      const data = await res.json();
      setResults(data);
      setLogs(prev => [...prev, ...data.log]);
    } catch (e) {
      setLogs(prev => [...prev, "[ERROR] Handshake failed."]);
    } finally {
      setLoading(false);
    }
  };

  const metricsData = results ? [
    { 
      id: "citability", 
      label: "CITABILITY", 
      data: results.citability,
      description: "Analyzes content structure for 'Answer Blocks' that LLMs prefer to extract and cite in their generative responses."
    },
    { 
      id: "schema", 
      label: "SEMANTIC_SCHEMA", 
      data: results.schema,
      description: "Validates structured JSON-LD data to ensure accurate identity resolution across the global entity graph."
    },
    { 
      id: "technical", 
      label: "TECHNICAL", 
      data: results.technical,
      description: "Evaluates raw technical vitals including performance, accessibility, and AI crawler directives."
    },
    { 
      id: "llmstxt", 
      label: "LLMS_TXT_PROTOCOL", 
      data: results.a2a,
      description: "Verifies the presence and validity of machine-readable context files for direct AI ingestion."
    },
    { 
      id: "brandMentions", 
      label: "BRAND_AUTHORITY", 
      data: results.brandMentions,
      description: "Scans for entity recognition signals and external knowledge graph links to build trust."
    },
    { 
      id: "contentQuality", 
      label: "CONTENT_EEAT", 
      data: results.contentQuality,
      description: "Evaluates Experience, Expertise, Authoritativeness, and Trustworthiness signals like authorship and dates."
    },
    { 
      id: "intentMatch", 
      label: "INTENT_MATCH", 
      data: results.intentMatch,
      description: "Evaluates if content structure and conversational headers align with generative query patterns."
    },
    { 
      id: "structural", 
      label: "STRUCTURAL_GEO", 
      data: results.structural,
      description: "Analyzes semantic HTML5 layout, list density, and tabular data presentation."
    },
    { 
      id: "semantic", 
      label: "SEMANTIC_DEPTH", 
      data: results.semantic,
      description: "Evaluates content depth and vocabulary richness for effective semantic clustering by LLMs."
    },
    { 
      id: "media", 
      label: "MEDIA_CONTEXT", 
      data: results.media,
      description: "Checks for multi-modal context optimization including descriptive alt text and captions."
    },
    { 
      id: "sentiment", 
      label: "TONE_ALIGNMENT", 
      data: results.sentiment,
      description: "Evaluates objective and factual tone alignment, as LLMs penalize heavily subjective or hyped content."
    }
  ] : [];

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#DCDCDC] selection:bg-[#D4A373] selection:text-black font-mono">
      {/* Navbar */}
      <nav className="max-w-[1400px] mx-auto px-6 py-6 flex justify-between items-center relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#1A1A1A] border border-white/10 rounded-sm flex items-center justify-center">
            <Bot className="text-[#D4A373]" size={18} />
          </div>
          <span className="font-normal text-sm tracking-[0.2em] text-white/80 uppercase">Agentic Auditor</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="px-6 py-2 bg-transparent border border-[#D4A373]/30 text-[#D4A373] text-[10px] uppercase tracking-widest hover:bg-[#D4A373]/10 transition-all">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-24 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 bg-[#1A1A1A] border border-white/5 text-white/40 text-[9px] uppercase tracking-[0.3em] mb-12"
        >
          <Zap size={10} className="text-[#D4A373]" />
          Now supporting 11 GEO Parameters
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-normal tracking-wide mb-8 leading-tight text-white/90"
        >
          Validate Site Readiness <br/>
          <span className="text-[#D4A373] italic">Before The Agents Arrive</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-2xl mx-auto text-white/40 text-xs md:text-sm leading-relaxed mb-16 tracking-wide"
        >
          Test your Generative Engine Optimization (GEO) implementations against 11 official specifications from the geo-seo-claude framework. Detect non-compliance and citation gaps before they reach production.
        </motion.p>
      </section>

      {/* Audit Tool Section */}
      <section id="audit-section" className="max-w-[1400px] mx-auto px-6 pb-32">
         <div className="max-w-3xl mx-auto mb-16">
            <AuditForm url={url} loading={loading} onUrlChange={setUrl} onAudit={handleAudit} />
         </div>
         
         <AnimatePresence>
            {results && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                 <div className="flex items-center gap-4 text-[10px] text-white/30 uppercase tracking-[0.3em] pb-4 border-b border-white/5">
                    <span className="w-2 h-2 rounded-full bg-[#8FBC8F] animate-pulse"></span>
                    Diagnostic_Report_Loaded
                 </div>
                 
                 <MetricsGrid metrics={metricsData} />
                 
                 {/* Raw Logs */}
                 <div className="mt-8 border border-white/5 bg-[#0D0D0D] p-6 font-mono text-[10px] h-40 overflow-y-auto text-white/30 tracking-wider">
                    {logs.map((log, i) => (
                      <p key={i} className={`mb-1 ${log.includes('[ERROR]') ? 'text-red-400/80' : log.includes('[OK]') ? 'text-[#8FBC8F]/80' : ''}`}>
                        {log}
                      </p>
                    ))}
                 </div>
              </motion.div>
            )}
         </AnimatePresence>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center">
         <div className="text-[10px] text-white/30 uppercase tracking-widest">
            Developed by <span className="text-[#D4A373] ml-1">Eduardo Arana & Soda 🥤</span>
         </div>
      </footer>
    </main>
  );
}
