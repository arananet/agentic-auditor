import { AuditResult } from "@/types";
import { motion } from "framer-motion";

interface Props {
  metrics: { id: string; label: string; data: AuditResult }[];
}

export const MetricsGrid = ({ metrics }: Props) => (
  <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {metrics.map((m, i) => (
      <motion.div 
        key={m.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.1 }}
        className="relative group border border-[#00FF41]/20 bg-black/40 backdrop-blur-md p-6 rounded-sm overflow-hidden transition-all hover:border-[#00FF41]/50 hover:shadow-[0_0_30px_rgba(0,255,65,0.1)]"
      >
        <div className="absolute top-0 right-0 p-2 opacity-10 font-bold text-[40px] leading-none select-none">
          0{i+1}
        </div>
        <div className="flex flex-col relative z-10">
          <span className="text-[9px] text-[#00FF41]/40 uppercase tracking-[0.3em] mb-1">Telemetry_Stream_{m.id}</span>
          <span className="text-sm font-bold text-white group-hover:text-[#00FF41] transition-colors uppercase">{m.label}</span>
        </div>
        <div className="mt-6 flex items-end justify-between relative z-10">
           <div className={`h-1 flex-grow bg-white/5 mr-4 relative`}>
              <div 
                className={`absolute inset-y-0 left-0 transition-all duration-1000 ${m.data.status === 'FAILED' ? 'bg-red-500' : 'bg-[#00FF41]'}`}
                style={{ width: `${m.data.score}%` }}
              />
           </div>
           <div className="text-right">
              <div className={`text-[10px] font-bold ${m.data.status === 'FAILED' ? 'text-red-500' : 'text-[#00FF41]'}`}>[ {m.data.status} ]</div>
              <div className="text-2xl font-bold tracking-tighter">{m.data.score}<span className="text-xs opacity-30">/100</span></div>
           </div>
        </div>
      </motion.div>
    ))}
  </section>
);
