import { Activity, Shield, Terminal, Zap, Search, Bot, Globe } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050505] text-[#00FF41] p-6 font-mono selection:bg-[#00FF41] selection:text-black relative overflow-hidden">
      {/* Scanline Overlay */}
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

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Search / Input */}
        <div className="border border-[#00FF41]/30 bg-[#00FF41]/5 p-8 relative">
          <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[#00FF41]" />
          <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-[#00FF41]" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-[#00FF41]" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-[#00FF41]" />
          
          <h2 className="text-sm mb-6 flex items-center gap-2">
            <Globe size={14} /> INITIALIZE_SITE_SCAN
          </h2>
          
          <div className="flex gap-4">
            <input 
              type="text" 
              placeholder="https://example.com"
              className="flex-grow bg-black border border-[#00FF41]/20 p-3 text-sm focus:outline-none focus:border-[#00FF41] transition-colors placeholder:opacity-20"
            />
            <button className="bg-[#00FF41] text-black px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#00FF41]/80 transition-all shadow-[0_0_15px_rgba(0,255,65,0.3)]">
              Execute_Audit
            </button>
          </div>
        </div>

        {/* Progress Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Citability_Analysis", status: "READY", score: "--" },
            { label: "Brand_Authority_Check", status: "READY", score: "--" },
            { label: "Technical_GEO_Vitals", status: "READY", score: "--" },
            { label: "A2A_Handshake_Verify", status: "READY", score: "--" }
          ].map((task, i) => (
            <div key={i} className="border border-[#00FF41]/10 p-4 flex justify-between items-center bg-white/5">
              <div className="flex flex-col">
                <span className="text-[10px] opacity-40 uppercase">Task_ID: 0{i+1}</span>
                <span className="text-xs">{task.label}</span>
              </div>
              <div className="text-right">
                 <div className="text-[10px] font-bold">{task.status}</div>
                 <div className="text-lg">{task.score}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Result Area Mockup */}
        <div className="border border-[#00FF41]/20 bg-black p-6 font-mono text-[11px] leading-relaxed opacity-60">
          <div className="text-[#00FF41]/40 mb-2">// SESSION_LOG_INIT...</div>
          <p>[WAIT] Awaiting target URL for agentic evaluation...</p>
          <p>[INFO] GEO metrics loaded from system skills.</p>
          <p>[INFO] A2A Protocol enabled. Listening on /api/a2a.</p>
        </div>
      </div>

      <footer className="mt-20 border-t border-[#00FF41]/10 pt-8 text-center">
        <p className="text-[10px] opacity-30 uppercase tracking-[0.4em] mb-4">
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
