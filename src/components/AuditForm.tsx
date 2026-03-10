import { Globe } from "lucide-react";

interface Props {
  url: string;
  loading: boolean;
  onUrlChange: (url: string) => void;
  onAudit: () => void;
}

export const AuditForm = ({ url, loading, onUrlChange, onAudit }: Props) => (
  <div className="border border-white/10 bg-[#0A0A0A] p-8 relative">
    <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-[#D4A373]" />
    <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-[#D4A373]" />
    <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-[#D4A373]" />
    <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-[#D4A373]" />
    
    <h2 className="text-sm mb-6 flex items-center gap-2 text-white/70 uppercase tracking-widest font-mono">
      <Globe size={14} className="text-[#D4A373]" /> Initialize Target
    </h2>
    
    <div className="flex flex-col sm:flex-row gap-4">
      <input 
        type="text" 
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://arananet.net"
        className="flex-grow bg-[#050505] border border-white/10 p-3 text-sm font-mono focus:outline-none focus:border-[#D4A373] transition-colors text-white/80 placeholder:opacity-30"
      />
      <button 
        onClick={onAudit}
        disabled={loading}
        className={`bg-transparent border border-[#D4A373] text-[#D4A373] px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all hover:bg-[#D4A373]/10 font-mono ${loading ? 'opacity-50' : ''}`}
      >
        {loading ? "Scanning..." : "Execute"}
      </button>
    </div>
  </div>
);
