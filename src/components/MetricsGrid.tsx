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
        className="card-glass p-6 relative flex flex-col h-full font-mono group"
      >
        <div className="text-[9px] text-white/30 uppercase tracking-[0.2em] mb-4">
          DATA_RECORD_00{i+1}
        </div>
        
        <h3 className="text-xl text-[#D4A373] mb-4 uppercase tracking-wider font-normal">
          {m.label.replace(' ', '_')}
        </h3>
        
        <p className="text-[11px] text-white/50 leading-relaxed mb-8 flex-grow">
          {m.description}
        </p>
        
        <div className="border border-white/5 bg-black/40 p-4 mt-auto">
          <div className="text-[8px] text-white/30 uppercase tracking-widest mb-3">
            // TECHNICAL_SPECIFICATIONS
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[9px] text-white/40 uppercase mb-1">Status</div>
              <div className={`text-xs uppercase ${m.data.status === 'FAILED' ? 'text-red-400' : 'text-[#8FBC8F]'}`}>
                {m.data.status}
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-[9px] text-white/40 uppercase mb-1">Score</div>
              <div className="text-sm text-white/80">
                {m.data.score}/100
              </div>
            </div>
          </div>
          
          {m.data.details && m.data.details.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="text-[9px] text-white/40 uppercase mb-2">Findings</div>
              <ul className="space-y-1">
                {m.data.details.slice(0, 2).map((detail, idx) => (
                  <li key={idx} className="text-[9px] text-white/60 flex gap-2">
                    <span className="text-[#D4A373]">-</span> 
                    <span className="truncate">{detail.replace(/\[|\]/g, '')}</span>
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
