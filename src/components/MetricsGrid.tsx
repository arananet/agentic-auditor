import { AuditResult } from "@/types";
import { motion } from "framer-motion";

interface Props {
  metrics: { id: string; label: string; data: AuditResult; description: string }[];
}

export const MetricsGrid = ({ metrics }: Props) => (
  <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {metrics.map((m, i) => (
      <motion.div 
        key={m.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.1 }}
        className="card-glass p-8 relative flex flex-col h-full font-mono group transition-colors duration-500 hover:bg-[#151515]"
      >
        <div className="text-[8px] text-white/30 group-hover:text-white/60 transition-colors uppercase tracking-[0.2em] mb-6">
          DATA_RECORD_00{i+1}
        </div>
        
        <h3 className="text-[15px] text-[#D4A373] group-hover:text-[#E5B586] transition-colors mb-5 uppercase tracking-[0.15em] font-normal">
          {m.label.replace(' ', '_')}
        </h3>
        
        <p className="text-[10px] text-white/50 group-hover:text-white/80 transition-colors leading-[1.8] mb-10 flex-grow pr-4">
          {m.description}
        </p>
        
        <div className="bg-[#0A0A0A] border border-white/10 group-hover:border-white/20 transition-colors p-5 mt-auto">
          <div className="text-[7px] text-white/30 group-hover:text-white/50 transition-colors uppercase tracking-[0.2em] mb-5">
            // TECHNICAL_SPECIFICATIONS
          </div>
          
          <div className="flex justify-between items-end mb-6">
            <div>
              <div className="text-[8px] text-white/40 group-hover:text-white/70 transition-colors uppercase tracking-widest mb-2">Status</div>
              <div className={`text-[11px] uppercase tracking-widest ${m.data.status === 'FAILED' ? 'text-red-400 group-hover:text-red-300' : m.data.status === 'WARN' ? 'text-[#D4A373] group-hover:text-[#E5B586]' : 'text-[#8FBC8F] group-hover:text-[#A3D1A3]'} transition-colors`}>
                {m.data.status}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-[8px] text-white/40 group-hover:text-white/70 transition-colors uppercase tracking-widest mb-2">Score</div>
              <div className="text-sm text-white/90 font-light">
                {m.data.score}<span className="text-white/40 group-hover:text-white/60 transition-colors text-xs">/100</span>
              </div>
            </div>
          </div>
          
          {m.data.details && m.data.details.length > 0 && (
            <div className="pt-5 border-t border-white/10 group-hover:border-white/20 transition-colors">
              <div className="text-[8px] text-white/40 group-hover:text-white/70 transition-colors uppercase tracking-widest mb-4">Findings</div>
              <ul className="space-y-3">
                {m.data.details.slice(0, 2).map((detail, idx) => (
                  <li key={idx} className="relative group/tooltip text-[9px] text-white/60 group-hover:text-white/90 transition-colors leading-relaxed flex items-start gap-3 cursor-help">
                    <span className="text-[#D4A373] mt-0.5">-</span> 
                    <span className="border-b border-dashed border-white/20 pb-0.5">{detail.message}</span>
                    
                    {/* Tooltip Bubble */}
                    <div className="absolute bottom-[120%] left-0 w-64 bg-[#151515] border border-[#D4A373]/30 p-4 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] text-left opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200">
                       <div className="text-[#D4A373] text-[9px] font-bold mb-1 uppercase tracking-widest">Analysis</div>
                       <div className="text-white/70 text-[10px] mb-4 leading-relaxed">{detail.explanation}</div>
                       <div className="text-[#8FBC8F] text-[9px] font-bold mb-1 uppercase tracking-widest">Remediation</div>
                       <div className="text-white/70 text-[10px] leading-relaxed">{detail.remediation}</div>
                       
                       {/* Arrow pointing down */}
                       <div className="absolute -bottom-2 left-4 w-4 h-4 bg-[#151515] border-b border-r border-[#D4A373]/30 transform rotate-45"></div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    ))}
  </section>
);
