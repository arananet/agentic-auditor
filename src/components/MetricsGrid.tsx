import { AuditResult } from "@/types";

interface Props {
  metrics: { id: string; label: string; data: AuditResult }[];
}

export const MetricsGrid = ({ metrics }: Props) => (
  <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {metrics.map((m, i) => (
      <div key={m.id} className="border border-[#00FF41]/10 p-4 flex justify-between items-center bg-white/5 relative overflow-hidden group">
        <div className="flex flex-col relative z-10">
          <span className="text-[10px] opacity-40 uppercase">Task_ID: 0{i+1}</span>
          <span className="text-xs">{m.label}</span>
        </div>
        <div className="text-right relative z-10">
           <div className={`text-[10px] font-bold ${m.data.status === 'FAILED' ? 'text-red-500' : 'text-[#00FF41]'}`}>{m.data.status}</div>
           <div className="text-lg">{m.data.score}/100</div>
        </div>
      </div>
    ))}
  </section>
);
