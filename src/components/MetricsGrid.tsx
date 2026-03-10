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
        <div className="text-[8px] text-white/20 uppercase tracking-[0.2em] mb-6">
          DATA_RECORD_00{i+1}
        </div>
        
        <h3 className="text-[15px] text-[#D4A373] mb-5 uppercase tracking-[0.15em] font-normal">
          {m.label.replace(' ', '_')}
        </h3>
        
        <p className="text-[10px] text-white/40 leading-[1.8] mb-10 flex-grow pr-4">
          {m.description}
        </p>
        
        <div className="bg-[#0A0A0A] border border-white/5 p-5 mt-auto">
          <div className="text-[7px] text-white/20 uppercase tracking-[0.2em] mb-5">
            // TECHNICAL_SPECIFICATIONS
          </div>
          
          <div className="flex justify-between items-end mb-6">
            <div>
              <div className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Status</div>
              <div className={`text-[11px] uppercase tracking-widest ${m.data.status === 'FAILED' ? 'text-red-400' : m.data.status === 'WARN' ? 'text-[#D4A373]' : 'text-[#8FBC8F]'}`}>
                {m.data.status}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Score</div>
              <div className="text-sm text-white/90 font-light">
                {m.data.score}<span className="text-white/30 text-xs">/100</span>
              </div>
            </div>
          </div>
          
          {m.data.details && m.data.details.length > 0 && (
            <div className="pt-5 border-t border-white/5">
              <div className="text-[8px] text-white/30 uppercase tracking-widest mb-4">Findings</div>
              <ul className="space-y-3">
                {m.data.details.slice(0, 2).map((detail, idx) => (
                  <li key={idx} className="text-[9px] text-white/50 leading-relaxed flex items-start gap-3">
                    <span className="text-[#D4A373] mt-0.5">-</span> 
                    <span className="">{detail.replace(/\[|\]/g, '')}</span>
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
