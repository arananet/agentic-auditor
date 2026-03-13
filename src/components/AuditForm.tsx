import { Globe, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  url: string;
  loading: boolean;
  queueStatus?: string;
  queuePosition?: number;
  onUrlChange: (url: string) => void;
  onAudit: (token: string) => void;
}

declare global {
  interface Window {
    turnstile: any;
  }
}

export const AuditForm = ({ url, loading, queueStatus, queuePosition, onUrlChange, onAudit }: Props) => {
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Load Turnstile Script
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.turnstile && turnstileRef.current) {
        widgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: "0x4AAAAAACo07B70a2WlqXNQ",
          theme: "dark",
          callback: (receivedToken: string) => {
            setToken(receivedToken);
          },
          'expired-callback': () => {
            setToken(null);
          },
          'error-callback': () => {
            setToken(null);
          },
        });
      }
    };

    return () => {
      if (script.parentNode) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleSubmit = () => {
    if (!token) {
      alert("Please complete the security check.");
      return;
    }
    onAudit(token);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#111111] border border-white/5 p-2 flex flex-col md:flex-row items-stretch md:items-center shadow-2xl relative">
        <div className="hidden md:flex px-4 text-white/20">
          <Globe size={20} />
        </div>
        <input 
          type="text" 
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
          disabled={loading}
          className="flex-grow bg-transparent border-none text-base md:text-lg text-white/80 focus:outline-none placeholder:text-white/20 tracking-wide font-mono py-4 px-4 md:px-0 disabled:opacity-50"
        />
        <button 
          onClick={handleSubmit}
          disabled={loading || !token}
          className={`bg-[#D4A373] text-black px-8 py-4 text-xs font-bold uppercase tracking-widest transition-all flex justify-center items-center gap-2 ${loading || !token ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#E5B586]'}`}
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" /> {queueStatus === 'queued' ? `Queue: ${queuePosition}` : 'Scanning...'}
            </>
          ) : (
            <>
              Initialize <ArrowRight size={14} />
            </>
          )}
        </button>
        
        {/* Progress Bar under button when loading */}
        {loading && (
           <div className="absolute bottom-0 left-0 h-1 bg-[#D4A373]/20 w-full overflow-hidden">
             <div className="h-full bg-[#D4A373] w-1/3 animate-[slide_2s_ease-in-out_infinite]"></div>
           </div>
        )}
      </div>
      
      <div className="flex justify-center md:justify-start min-h-[65px]">
        <div ref={turnstileRef}></div>
      </div>

      <style jsx>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};
