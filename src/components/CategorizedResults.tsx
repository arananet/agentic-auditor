'use client';

import { AuditResult } from "@/types";
import { MetricsGrid } from "./MetricsGrid";
import { motion } from "framer-motion";
import { Shield, FileText, Code2 } from "lucide-react";

export interface MetricItem {
  id: string;
  label: string;
  data: AuditResult;
  description: string;
}

export interface CategoryGroup {
  id: string;
  title: string;
  effort: string;
  effortColor: string;
  icon: React.ReactNode;
  description: string;
  metrics: MetricItem[];
}

interface Props {
  categories: CategoryGroup[];
}

export const CategorizedResults = ({ categories }: Props) => {
  return (
    <div className="space-y-16 no-print">
      {categories.map((cat, catIdx) => {
        const avgScore = Math.round(
          cat.metrics.reduce((sum, m) => sum + m.data.score, 0) / cat.metrics.length
        );
        const failed = cat.metrics.filter(m => m.data.status === 'FAILED').length;
        const warn = cat.metrics.filter(m => m.data.status === 'WARN').length;
        const ready = cat.metrics.filter(m => m.data.status === 'READY').length;

        return (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: catIdx * 0.15 }}
          >
            {/* Category Header */}
            <div className="mb-8 pb-6 border-b border-white/5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-[#D4A373]/60">
                    {cat.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl text-white/90 uppercase tracking-[0.2em] font-normal">
                        {cat.title}
                      </h3>
                      <span className={`text-[9px] uppercase tracking-[0.2em] px-2.5 py-1 border font-bold ${cat.effortColor}`}>
                        {cat.effort}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed max-w-2xl">
                      {cat.description}
                    </p>
                  </div>
                </div>

                {/* Category Aggregate */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
                    {failed > 0 && (
                      <span className="text-red-400/80 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                        {failed} failed
                      </span>
                    )}
                    {warn > 0 && (
                      <span className="text-[#D4A373]/80 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4A373] inline-block" />
                        {warn} warn
                      </span>
                    )}
                    {ready > 0 && (
                      <span className="text-[#8FBC8F]/80 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8FBC8F] inline-block" />
                        {ready} ready
                      </span>
                    )}
                  </div>
                  <div className="text-right pl-6 border-l border-white/10">
                    <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Avg</div>
                    <div className={`text-2xl font-light ${avgScore >= 75 ? 'text-[#8FBC8F]' : avgScore >= 50 ? 'text-[#D4A373]' : 'text-red-400'}`}>
                      {avgScore}<span className="text-xs text-white/20 ml-0.5">/100</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Metric Cards */}
            <MetricsGrid metrics={cat.metrics} />
          </motion.div>
        );
      })}
    </div>
  );
};

/** Pre-configured category definitions — pass metrics data in page.tsx */
export const CATEGORY_DEFS = [
  {
    id: 'agent-access',
    title: 'Agent Access & Configuration',
    effort: 'Quick Win',
    effortColor: 'text-[#8FBC8F] border-[#8FBC8F]/30 bg-[#8FBC8F]/5',
    icon: <Shield size={22} />,
    description: 'Configuration-level changes your IT/DevOps team can deploy in hours: robots.txt AI crawler whitelist, llms.txt protocol, canonical URLs, sitemaps, and WAF rules to allow AI bots.',
    metricIds: ['technical', 'llmstxt', 'sitemap'],
  },
  {
    id: 'content-signals',
    title: 'Content & Authority Signals',
    effort: 'Editorial',
    effortColor: 'text-[#D4A373] border-[#D4A373]/30 bg-[#D4A373]/5',
    icon: <FileText size={22} />,
    description: 'Content improvements requiring editorial and marketing collaboration: E-E-A-T metadata, content freshness, sourced statistics, expert quotes, citability patterns, PAA optimization, conversational headings, semantic depth, keyword stuffing detection, tone alignment, image alt-text, and third-party brand authority.',
    metricIds: ['contentQuality', 'citability', 'paa', 'intentMatch', 'semantic', 'sentiment', 'brandMentions', 'media'],
  },
  {
    id: 'structural-gaps',
    title: 'Structured Data & Visibility Gaps',
    effort: 'Development',
    effortColor: 'text-[#7BA7BC] border-[#7BA7BC]/30 bg-[#7BA7BC]/5',
    icon: <Code2 size={22} />,
    description: 'HTML and schema changes requiring frontend development: JSON-LD structured data, entity authority signals, semantic HTML elements, table headers, FAQ sections, comparison tables, and SpeakableSpecification.',
    metricIds: ['schema', 'structural', 'entityAuthority'],
  },
] as const;
