import { Globe, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  url: string;
  loading: boolean;
  onUrlChange: (url: string) => void;
  onAudit: (token: string) => void;
}

declare global {
  interface Window {
    onloadTurnstileCallback: () => void;
    turnstile: any;
  }
}

export const AuditForm = ({ url, loading, onUrlChange, onAudit }: Props) => {
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

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
          sitekey: "0x4AAAAAAA4Y6Yf2x6C8_XlI", // Using the Cloudflare Always Pass testing key
          theme: "dark",
          callback: (token: string) => {
            // Token is ready
          },
        });
      }
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = () => {
    const token = window.turnstile.getResponse(widgetId.current);
    if (!token && !process.env.NEXT_PUBLIC_DEV_MODE) {
      alert("Please complete the security check.");
      return;
    }
    onAudit(token);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#111111] border border-white/5 p-2 flex flex-col md:flex-row items-stretch md:items-center shadow-2xl">
        <div className="hidden md:flex px-4 text-white/20">
          <Globe size={20} />
        </div>
        <input 
          type="text" 
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
          className="flex-grow bg-transparent border-none text-base md:text-lg text-white/80 focus:outline-none placeholder:text-white/20 tracking-wide font-mono py-4 px-4 md:px-0"
        />
        <button 
          onClick={handleSubmit}
          disabled={loading}
          className={`bg-[#D4A373] text-black px-8 py-4 text-xs font-bold uppercase tracking-widest transition-all flex justify-center items-center gap-2 ${loading ? 'opacity-50' : 'hover:bg-[#E5B586]'}`}
        >
          {loading ? "Scanning..." : "Initialize"} <ArrowRight size={14} />
        </button>
      </div>
      
      {/* Turnstile Widget Container */}
      <div className="flex justify-center md:justify-start">
        <div ref={turnstileRef}></div>
      </div>
    </div>
  );
};
