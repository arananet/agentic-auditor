import { Globe } from "lucide-react";

interface Props {
  url: string;
  loading: boolean;
  onUrlChange: (url: string) => void;
  onAudit: () => void;
}

export const AuditForm = ({ url, loading, onUrlChange, onAudit }: Props) => (
  <div className="border border-[#00FF41]/30 bg-[#00FF41]/5 p-8 relative">
    <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[#00FF41]" />
    <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-[#00FF41]" />
    <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-[#00FF41]" />
    <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-[#00FF41]" />
    
    <h2 className="text-sm mb-6 flex items-center gap-2">
      <Globe size={14} /> Initialize Site Scan
    </h2>
    
    <div className="flex flex-col sm:flex-row gap-4">
      <input 
        type="text" 
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://arananet.net"
        className="flex-grow bg-black border border-[#00FF41]/20 p-3 text-sm focus:outline-none focus:border-[#00FF41] transition-colors placeholder:opacity-20"
      />
      <button 
        onClick={onAudit}
        disabled={loading}
        className={`bg-[#00FF41] text-black px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(0,255,65,0.3)] ${loading ? 'opacity-50' : 'hover:bg-[#00FF41]/80'}`}
      >
        {loading ? "Scanning..." : "Execute Audit"}
      </button>
    </div>
  </div>
);
