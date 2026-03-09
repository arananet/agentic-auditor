"use client";

import { useState } from "react";
import { 
  Bot, 
  Globe, 
  Shield, 
  Cpu, 
  Search, 
  Zap, 
  ArrowRight, 
  Layers,
  Cloud,
  Terminal,
  Lock,
  BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuditForm } from "@/components/AuditForm";
import { MetricsGrid } from "@/components/MetricsGrid";
import { AuditResponse } from "@/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AuditResponse | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

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

  return (
    <main className="min-h-screen bg-[#030712] text-white selection:bg-teal-500 selection:text-white">
      {/* Navbar */}
      <nav className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center relative z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-500 rounded-md flex items-center justify-center">
            <Bot className="text-black" size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight">Agentic Auditor</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#" className="hover:text-teal-400 transition-colors">Features</a>
          <a href="#" className="hover:text-teal-400 transition-colors">Enterprise</a>
          <a href="#" className="hover:text-teal-400 transition-colors">Dashboard</a>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-sm text-gray-400 hover:text-white hidden sm:block">Login</button>
          <button className="px-4 py-2 bg-teal-500/10 border border-teal-500/50 text-teal-400 rounded-md text-sm font-bold hover:bg-teal-500 hover:text-black transition-all">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-32 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px] font-bold uppercase tracking-widest mb-8"
        >
          <Zap size={10} fill="currentColor" />
          Now supporting GEO Protocol
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold tracking-tighter mb-8 leading-[1.1]"
        >
          Validate Site Readiness <br/>
          <span className="text-teal-400">Before The Agents Arrive</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-2xl mx-auto text-gray-400 text-lg mb-12"
        >
          Test your Generative Engine Optimization (GEO) and A2A implementations against official specifications. Detect non-compliance and citation gaps before they reach production.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row justify-center gap-4"
        >
          <button 
            onClick={() => document.getElementById('audit-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-3 bg-teal-500 text-black font-bold rounded-md flex items-center justify-center gap-2 hover:bg-teal-400 transition-all"
          >
            Start Testing <ArrowRight size={18} />
          </button>
          <button className="px-8 py-3 bg-white/5 border border-white/10 rounded-md font-bold hover:bg-white/10 transition-all">
            Learn More
          </button>
        </motion.div>
      </section>

      {/* Compliance Grid */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 mb-40">
        {[
          { icon: Search, title: "GEO Compliance", text: "Validate Generative Engine Optimization. Ensure Perplexity and Claude can cite your data accurately.", label: "Audit now →" },
          { icon: Globe, title: "A2A Compliance", text: "Verify Agent-to-Agent implementations. Validate your llms.txt and handshake protocols.", label: "Audit now →" },
          { icon: Shield, title: "Metadata Compliance", text: "Validate JSON-LD identity profiles at /.well-known/ai against official specifications.", label: "Audit now →" }
        ].map((feature, i) => (
          <div key={i} className="card-glass p-8 rounded-xl flex flex-col items-start gap-6 group">
            <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
              <feature.icon size={24} />
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-bold">{feature.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.text}</p>
            </div>
            <button className="text-sm font-bold text-teal-400 hover:text-teal-300 transition-colors mt-auto">
              {feature.label}
            </button>
          </div>
        ))}
      </section>

      {/* Audit Tool Section */}
      <section id="audit-section" className="max-w-5xl mx-auto px-6 py-20 border-t border-white/5">
         <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Run Agentic Audit</h2>
            <p className="text-gray-400">Initialize a deep spectrum scan on any production domain.</p>
         </div>
         
         <div className="space-y-8">
            <AuditForm url={url} loading={loading} onUrlChange={setUrl} onAudit={handleAudit} />
            <AnimatePresence>
               {results && (
                 <motion.div 
                   initial={{ opacity: 0, y: 20 }} 
                   animate={{ opacity: 1, y: 0 }}
                   className="space-y-8"
                 >
                    <MetricsGrid metrics={[
                      { id: "geo", label: "GEO Score", data: results.citability },
                      { id: "a2a", label: "A2A Ready", data: results.a2a },
                      { id: "schema", label: "Schema", data: results.schema },
                      { id: "tech", label: "Technical", data: results.technical }
                    ]} />
                    <div className="bg-black border border-white/10 p-6 rounded-lg font-mono text-[11px] h-48 overflow-y-auto">
                       {logs.map((log, i) => <p key={i} className="mb-1 text-gray-500 italic">{log}</p>)}
                    </div>
                 </motion.div>
               )}
            </AnimatePresence>
         </div>
      </section>

      {/* Why Section */}
      <section className="max-w-7xl mx-auto px-6 py-40 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Agentic Auditor?</h2>
        <p className="text-gray-400 mb-20">Built for architects who care about machine-readable standards.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16 text-left">
          {[
            { icon: Search, title: "Comprehensive Testing", text: "Test against full GEO and A2A specifications, not just happy paths." },
            { icon: Zap, title: "Instant Results", text: "Get detailed compliance reports in seconds, not hours." },
            { icon: BarChart3, title: "Clear Pass/Fail", text: "Unambiguous results with specific failure points for AI engines." },
            { icon: Terminal, title: "Developer First", text: "A2A integration points, API access, and detailed logs." },
            { icon: Lock, title: "Secure Testing", text: "Your audit logs never leave your infrastructure. Encrypted and safe." },
            { icon: Layers, title: "Multi-Protocol", text: "Full support for GEO, A2A, and future-agentic protocols out of the box." }
          ].map((benefit, i) => (
            <div key={i} className="flex gap-6 items-start">
              <div className="p-2 bg-white/5 border border-white/10 rounded-md text-gray-500 shrink-0">
                <benefit.icon size={20} />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold">{benefit.title}</h4>
                <p className="text-sm text-gray-500 leading-relaxed">{benefit.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-20 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
         <div className="text-sm text-gray-500">
            © 2026 Developed by <span className="text-teal-400 font-bold uppercase tracking-widest ml-1">Eduardo Arana & Soda 🥤</span>
         </div>
         <div className="flex gap-8 text-xs text-gray-600 uppercase tracking-widest">
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-white transition-colors">Railway</a>
         </div>
      </footer>
    </main>
  );
}
