"use client";

import { useState } from "react";
import { Bot, Zap, ArrowRight, Download } from "lucide-react";
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

  const generateReport = () => {
    if (!results) return;

    let markdown = `# Agentic Audit Report for ${url}\n\n`;
    markdown += `**Overall GEO Readiness Score:** ${results.overallScore}/100\n\n`;
    markdown += `---\n\n`;

    const metrics = [
      { label: "CITABILITY", data: results.citability },
      { label: "SEMANTIC SCHEMA", data: results.schema },
      { label: "TECHNICAL", data: results.technical },
      { label: "LLMS.TXT PROTOCOL", data: results.a2a },
      { label: "BRAND AUTHORITY", data: results.brandMentions },
      { label: "CONTENT E-E-A-T", data: results.contentQuality },
      { label: "INTENT MATCH", data: results.intentMatch },
      { label: "STRUCTURAL GEO", data: results.structural },
      { label: "SEMANTIC DEPTH", data: results.semantic },
      { label: "MEDIA CONTEXT", data: results.media },
      { label: "TONE ALIGNMENT", data: results.sentiment }
    ];

    metrics.forEach(m => {
      markdown += `## ${m.label} - Score: ${m.data.score}/100 (${m.data.status})\n\n`;
      m.data.details.forEach(d => {
        markdown += `### Finding: ${d.message}\n`;
        markdown += `**Analysis:** ${d.explanation}\n\n`;
        markdown += `**Remediation:**\n\`\`\`\n${d.remediation}\n\`\`\`\n\n`;
      });
      markdown += `---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const domain = url.replace(/^https?:\/\//, '').split('/')[0];
    a.download = `geo_audit_${domain}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
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
      </nav>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-24 text-center relative">
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
                 <div className="flex items-center justify-between pb-4 border-b border-white/5">
                   <div className="flex items-center gap-4 text-xs text-white/40 uppercase tracking-[0.3em]">
                      <span className="w-2 h-2 rounded-full bg-[#8FBC8F] animate-pulse"></span>
                      Diagnostic_Report_Loaded
                   </div>
                   <button 
                     onClick={generateReport}
                     className="flex items-center gap-2 text-xs text-[#D4A373] hover:text-[#E5B586] transition-colors tracking-widest uppercase"
                   >
                     <Download size={14} /> Download Technical Report
                   </button>
                 </div>
                 
                 <MetricsGrid metrics={metricsData} />
                 
                 {/* OVERALL SCORE SECTION */}
                 <div className="mt-12 p-8 border border-[#D4A373]/30 bg-[#D4A373]/5 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4A373] opacity-5 blur-[100px] rounded-full pointer-events-none" />
                    
                    <div>
                      <h2 className="text-2xl text-[#D4A373] tracking-[0.2em] uppercase mb-4">Overall GEO Readiness</h2>
                      <p className="text-sm text-white/60 max-w-2xl leading-relaxed">
                        This composite score represents your domain's total compatibility with Generative AI engines. Scores above 80 indicate high probability of accurate citation and entity resolution. Download the Technical Report for remediation steps.
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
                 <div className="mt-8 border border-white/5 bg-[#0D0D0D] p-6 font-mono text-[11px] h-40 overflow-y-auto text-white/40 tracking-wider">
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
         <div className="text-xs text-white/30 uppercase tracking-widest">
            Developed by <span className="text-[#D4A373] ml-1">Eduardo Arana & Soda 🥤</span>
         </div>
      </footer>
    </main>
  );
}
