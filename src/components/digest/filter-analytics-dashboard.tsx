"use client";

// ===================================================================
// FilterAnalyticsDashboard — Advanced Data Viz for AI Filter Results
//
// All pure CSS/SVG visualizations (no chart library):
//   • Pass Rate Ring (conic-gradient)
//   • Confidence Gauge (SVG arc)
//   • Semantic Score Bar (animated gradient)
//   • Confidence Distribution Histogram (flex bars)
//   • Sentiment Pie (conic-gradient)
//   • Domain Heatmap (grid cells)
//   • Source Distribution (horizontal bars)
//   • Content Type Breakdown (icon grid)
//   • Top Keywords Cloud (weighted tags)
//   • Query Expansion Terms (pills)
//   • Processing Metrics (stat cards)
// ===================================================================

import { motion } from "framer-motion";
import {
  Activity, Brain, BarChart3, Target, Zap, Clock, Globe,
  TrendingUp, AlertTriangle, ShieldCheck, MessageSquare,
  BookOpen, Video, Users, Sparkles, Hash, Cpu, Layers,
  PieChart, Signal, Flame,
} from "lucide-react";
import type { FilterAnalytics } from "@/lib/digest/digest-filter-engine";
import { useDigest } from "@/hooks/use-digest";
import { cn } from "@/lib/utils";

// ── Sub-Components ──────────────────────────────────────

function PassRateRing({ rate }: { rate: number }) {
  const color = rate > 60 ? "#22c55e" : rate > 30 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center relative"
        style={{
          background: `conic-gradient(${color} ${rate * 3.6}deg, rgba(255,255,255,0.04) ${rate * 3.6}deg)`,
        }}
      >
        <div className="w-12 h-12 rounded-full bg-black/90 flex items-center justify-center">
          <span className="text-sm font-mono font-bold" style={{ color }}>{rate}%</span>
        </div>
      </div>
      <span className="text-[8px] font-mono text-white/30 tracking-wider">PASS RATE</span>
    </div>
  );
}

function ConfidenceArc({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct > 70 ? "#22c55e" : pct > 40 ? "#f59e0b" : "#ef4444";
  const r = 30;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - value);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="70" height="42" viewBox="0 0 70 42">
        {/* Background arc */}
        <path
          d="M 5 37 A 30 30 0 0 1 65 37"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d="M 5 37 A 30 30 0 0 1 65 37"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
        />
        <text x="35" y="35" textAnchor="middle" fill={color} fontSize="14" fontFamily="monospace" fontWeight="bold">
          {pct}
        </text>
      </svg>
      <span className="text-[8px] font-mono text-white/30 tracking-wider">AVG CONFIDENCE</span>
    </div>
  );
}

function SemanticBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color = pct > 70 ? "#a78bfa" : pct > 40 ? "#06b6d4" : "#64748b";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-16 h-16 flex flex-col items-center justify-center">
        <div className="text-xl font-mono font-bold" style={{ color, textShadow: `0 0 8px ${color}40` }}>
          {score}
        </div>
        <div className="w-14 h-1.5 rounded-full bg-white/[0.06] mt-1 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8 }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${color}40, ${color})` }}
          />
        </div>
      </div>
      <span className="text-[8px] font-mono text-white/30 tracking-wider">SEMANTIC SCORE</span>
    </div>
  );
}

function ConfidenceHistogram({ buckets }: { buckets: number[] }) {
  const max = Math.max(...buckets, 1);
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <BarChart3 className="h-3 w-3 text-cyan-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">CONFIDENCE DISTRIBUTION</span>
      </div>
      <div className="flex items-end gap-0.5 h-14">
        {buckets.map((count, i) => {
          const height = (count / max) * 100;
          const hue = i * 12; // green → amber → red spectrum
          const color = i < 3 ? "#ef4444" : i < 5 ? "#f59e0b" : i < 7 ? "#22c55e" : "#06b6d4";
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(height, 4)}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="w-full rounded-t"
                style={{ background: color, opacity: 0.7, minHeight: "2px" }}
              />
              <span className="text-[6px] font-mono text-white/15">{i * 10}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SentimentPie({ breakdown }: { breakdown: { positive: number; neutral: number; negative: number } }) {
  const total = breakdown.positive + breakdown.neutral + breakdown.negative;
  if (total === 0) return null;

  const posP = (breakdown.positive / total) * 100;
  const neuP = (breakdown.neutral / total) * 100;
  const negP = (breakdown.negative / total) * 100;

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <MessageSquare className="h-3 w-3 text-purple-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">SENTIMENT MIX</span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-full shrink-0"
          style={{
            background: `conic-gradient(#22c55e ${posP * 3.6}deg, #06b6d4 ${posP * 3.6}deg ${(posP + neuP) * 3.6}deg, #ef4444 ${(posP + neuP) * 3.6}deg)`,
            boxShadow: "0 0 12px rgba(34,197,94,0.1), 0 0 12px rgba(239,68,68,0.1)",
          }}
        />
        <div className="space-y-1 flex-1 min-w-0">
          {[
            { label: "Positive", count: breakdown.positive, color: "#22c55e", icon: TrendingUp },
            { label: "Neutral", count: breakdown.neutral, color: "#06b6d4", icon: ShieldCheck },
            { label: "Negative", count: breakdown.negative, color: "#ef4444", icon: AlertTriangle },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: s.color }} />
                <span className="text-[9px] font-mono text-white/50 flex-1 truncate">{s.label}</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: s.color }}>{s.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DomainHeatmap({ domains }: { domains: { domain: string; count: number; avgScore: number }[] }) {
  if (domains.length === 0) return null;
  const maxScore = Math.max(...domains.map((d) => d.avgScore), 1);

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Globe className="h-3 w-3 text-amber-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">DOMAIN HEATMAP</span>
      </div>
      <div className="space-y-1">
        {domains.slice(0, 6).map((d) => {
          const intensity = d.avgScore / maxScore;
          const color = intensity > 0.7 ? "#f59e0b" : intensity > 0.4 ? "#06b6d4" : "#64748b";
          return (
            <div key={d.domain} className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-white/40 w-24 truncate">{d.domain}</span>
              <div className="flex-1 h-3 rounded bg-white/[0.04] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${intensity * 100}%` }}
                  transition={{ duration: 0.6 }}
                  className="h-full rounded"
                  style={{
                    background: `linear-gradient(90deg, ${color}30, ${color})`,
                    boxShadow: `inset 0 0 6px ${color}40`,
                  }}
                />
              </div>
              <span className="text-[9px] font-mono font-bold shrink-0 w-6 text-right" style={{ color }}>
                {d.count}
              </span>
              <span className="text-[7px] font-mono text-white/20 shrink-0 w-6 text-right">
                {d.avgScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceBars({ sources }: { sources: { source: string; count: number }[] }) {
  if (sources.length === 0) return null;
  const maxCount = Math.max(...sources.map((s) => s.count), 1);

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Signal className="h-3 w-3 text-emerald-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">TOP SOURCES</span>
      </div>
      <div className="space-y-1">
        {sources.slice(0, 5).map((s) => {
          const pct = (s.count / maxCount) * 100;
          return (
            <div key={s.source} className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-white/40 w-28 truncate">{s.source}</span>
              <div className="flex-1 h-2.5 rounded bg-white/[0.04] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full rounded bg-emerald-500/60"
                />
              </div>
              <span className="text-[9px] font-mono font-bold text-emerald-400 shrink-0 w-5 text-right">{s.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContentTypeGrid({ types }: { types: { type: string; count: number }[] }) {
  if (types.length === 0) return null;
  const iconMap: Record<string, { icon: typeof BookOpen; color: string }> = {
    article: { icon: BookOpen, color: "#f59e0b" },
    video: { icon: Video, color: "#ef4444" },
    social: { icon: Users, color: "#3b82f6" },
    research: { icon: Brain, color: "#a78bfa" },
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Layers className="h-3 w-3 text-pink-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">CONTENT TYPE</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {types.map((t) => {
          const config = iconMap[t.type] || { icon: BookOpen, color: "#64748b" };
          const Icon = config.icon;
          return (
            <div
              key={t.type}
              className="flex items-center gap-2 p-2 rounded-lg border border-white/[0.04] bg-white/[0.02]"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: config.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-mono text-white/50 capitalize truncate">{t.type}</div>
                <div className="text-sm font-mono font-bold" style={{ color: config.color }}>{t.count}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KeywordCloud({ keywords }: { keywords: { keyword: string; count: number }[] }) {
  if (keywords.length === 0) return null;
  const maxCount = Math.max(...keywords.map((k) => k.count), 1);

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Hash className="h-3 w-3 text-amber-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">TOP MATCHED KEYWORDS</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {keywords.slice(0, 12).map((k) => {
          const intensity = k.count / maxCount;
          const size = intensity > 0.7 ? "text-[10px]" : intensity > 0.4 ? "text-[9px]" : "text-[8px]";
          const opacity = 0.3 + intensity * 0.7;
          return (
            <span
              key={k.keyword}
              className={cn(
                "px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/5 font-mono text-amber-300 font-bold",
                size
              )}
              style={{ opacity }}
            >
              {k.keyword}
              <span className="ml-1 text-amber-400/40">{k.count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function QueryExpansionPills({ terms }: { terms: string[] }) {
  if (terms.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Sparkles className="h-3 w-3 text-violet-400/60" />
        <span className="text-[8px] font-mono text-white/30 tracking-[0.15em]">QUERY EXPANSION</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {terms.slice(0, 15).map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/15 text-[8px] font-mono text-violet-300/70"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────

export function FilterAnalyticsDashboard() {
  const { filterActive, filterAnalytics } = useDigest();

  if (!filterActive || !filterAnalytics) return null;

  const a = filterAnalytics;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-[0.15em]">FILTER ANALYTICS</span>
        <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/20 to-transparent" />
      </div>

      {/* Top Row: Big 3 Metrics */}
      <div className="flex items-center justify-around p-3 bg-black/40 border border-white/[0.06] rounded-xl">
        <PassRateRing rate={a.passRate} />
        <ConfidenceArc value={a.avgConfidence} />
        <SemanticBar score={a.avgSemanticScore} />
      </div>

      {/* Processing Stats */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="p-2 bg-black/30 border border-white/[0.04] rounded-lg text-center">
          <div className="text-[8px] font-mono text-white/20 mb-0.5">INPUT</div>
          <div className="text-sm font-mono font-bold text-white/70">{a.totalInput}</div>
        </div>
        <div className="p-2 bg-black/30 border border-white/[0.04] rounded-lg text-center">
          <div className="text-[8px] font-mono text-white/20 mb-0.5">MATCHED</div>
          <div className="text-sm font-mono font-bold text-amber-400">{a.totalOutput}</div>
        </div>
        <div className="p-2 bg-black/30 border border-white/[0.04] rounded-lg text-center">
          <div className="flex items-center justify-center gap-0.5 text-[8px] font-mono text-white/20 mb-0.5">
            <Cpu className="h-2 w-2" /> ENGINE
          </div>
          <div className="text-[9px] font-mono font-bold text-cyan-400 truncate">{a.engineUsed}</div>
        </div>
      </div>

      {/* Confidence Distribution */}
      <div className="p-3 bg-black/30 border border-white/[0.04] rounded-xl">
        <ConfidenceHistogram buckets={a.confidenceDistribution} />
      </div>

      {/* Sentiment + Content Types */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 bg-black/30 border border-white/[0.04] rounded-xl">
          <SentimentPie breakdown={a.sentimentBreakdown} />
        </div>
        <div className="p-3 bg-black/30 border border-white/[0.04] rounded-xl">
          <ContentTypeGrid types={a.contentTypeBreakdown} />
        </div>
      </div>

      {/* Domain Heatmap */}
      <div className="p-3 bg-black/30 border border-white/[0.04] rounded-xl">
        <DomainHeatmap domains={a.domainBreakdown} />
      </div>

      {/* Source Bars */}
      <div className="p-3 bg-black/30 border border-white/[0.04] rounded-xl">
        <SourceBars sources={a.sourceBreakdown} />
      </div>

      {/* Keywords + Query Expansion */}
      <div className="p-3 bg-black/30 border border-white/[0.04] rounded-xl space-y-3">
        <KeywordCloud keywords={a.topKeywords} />
        <QueryExpansionPills terms={a.queryExpansion} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Clock className="h-2.5 w-2.5 text-white/15" />
          <span className="text-[8px] font-mono text-white/20">
            Processed in {a.processingTimeMs}ms
          </span>
        </div>
        <span className="text-[7px] font-mono text-white/10">
          NEXUS AI FILTER v1.0
        </span>
      </div>
    </motion.div>
  );
}
