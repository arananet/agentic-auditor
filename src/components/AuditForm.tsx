import { Globe, ArrowRight } from "lucide-react";

interface Props {
  url: string;
  loading: boolean;
  onUrlChange: (url: string) => void;
  onAudit: () => void;
}

export const AuditForm = ({ url, loading, onUrlChange, onAudit }: Props) => (
  <div className="bg-[#111111] border border-white/5 p-2 flex items-center shadow-2xl">
    <div className="px-4 text-white/20">
      <Globe size={16} />
    </div>
    <input 
      type="text" 
      value={url}
      onChange={(e) => onUrlChange(e.target.value)}
      placeholder="https://arananet.net"
      className="flex-grow bg-transparent border-none text-sm text-white/80 focus:outline-none placeholder:text-white/20 tracking-wide font-mono py-4"
    />
    <button 
      onClick={onAudit}
      disabled={loading}
      className={`bg-[#D4A373] text-black px-8 py-4 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${loading ? 'opacity-50' : 'hover:bg-[#E5B586]'}`}
    >
      {loading ? "Scanning..." : "Initialize"} <ArrowRight size={12} />
    </button>
  </div>
);
