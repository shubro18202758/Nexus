"use client";

import { useMemo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, Hash, BarChart2, PieChart, Globe, Clock, Layers,
  TrendingUp, BookOpen, Eye, Flame, Target, ArrowUpRight,
  ArrowDownRight, Minus as MinusIcon, Zap
} from "lucide-react";
import { useDigest, type FeedItem } from "@/hooks/use-digest";
import { getDomainById } from "@/lib/digest-domains";
import { cn } from "@/lib/utils";

// ─── Section wrapper ───
function S({ icon: Icon, iconColor, label, children }: { icon: React.ElementType; iconColor: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 px-0.5 mb-1">
        <Icon className="h-2.5 w-2.5" style={{ color: iconColor }} />
        <span className="text-[7px] font-mono text-white/30 tracking-widest uppercase">{label}</span>
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════
// 1. QUICK STATS — compact key metrics row
// ═══════════════════════════════════════════
function QuickStats({ items }: { items: FeedItem[] }) {
  const stats = useMemo(() => {
    const sources = new Set(items.map(i => i.source)).size;
    const domains = new Set(items.map(i => i.domain)).size;
    const avgRel = items.length > 0 ? Math.round(items.reduce((a, i) => a + i.relevanceScore, 0) / items.length) : 0;
    const posRatio = items.length > 0 ? Math.round(items.filter(i => i.sentiment === "positive").length / items.length * 100) : 0;
    return [
      { label: "Signals", value: items.length, icon: Zap, color: "#f59e0b" },
      { label: "Sources", value: sources, icon: Globe, color: "#06b6d4" },
      { label: "Domains", value: domains, icon: Layers, color: "#8b5cf6" },
      { label: "Relevance", value: `${avgRel}%`, icon: Target, color: "#10b981" },
      { label: "Positive", value: `${posRatio}%`, icon: TrendingUp, color: "#14b8a6" },
      { label: "Est. Read", value: `${items.reduce((a, i) => a + Math.max(2, Math.ceil(i.summary.length / 200)), 0)}m`, icon: Clock, color: "#f97316" },
    ];
  }, [items]);

  return (
    <div className="grid grid-cols-3 gap-1">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="p-1.5 bg-black/40 border border-white/[0.05] rounded-lg flex flex-col items-center">
          <Icon className="h-2.5 w-2.5 mb-0.5" style={{ color }} />
          <span className="text-[10px] font-mono font-bold text-white leading-none">{value}</span>
          <span className="text-[5.5px] font-mono text-white/20 uppercase mt-0.5">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// 2. DOMAIN COVERAGE — horizontal bar chart
// ═══════════════════════════════════════════
function DomainBars({ domains, items }: { domains: string[]; items: FeedItem[] }) {
  const data = useMemo(() => {
    return domains.map(id => {
      const d = getDomainById(id);
      const count = items.filter(i => i.domain === id).length;
      return { name: d?.name || id, color: d?.accentColor || "#888", count };
    }).sort((a, b) => b.count - a.count);
  }, [domains, items]);
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg space-y-1.5">
      {data.map((d, i) => (
        <div key={d.name}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[7px] font-mono text-white/50 truncate max-w-[70%]">{d.name}</span>
            <span className="text-[8px] font-mono font-bold" style={{ color: d.color }}>{d.count}</span>
          </div>
          <div className="h-1 bg-white/[0.03] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${(d.count / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${d.color}cc, ${d.color}40)`, boxShadow: `0 0 6px ${d.color}30` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// 3. SENTIMENT BY DOMAIN — stacked mini bars
// ═══════════════════════════════════════════
function DomainSentiment({ domains, items }: { domains: string[]; items: FeedItem[] }) {
  const data = useMemo(() => {
    return domains.map(id => {
      const d = getDomainById(id);
      const dis = items.filter(i => i.domain === id);
      const total = dis.length || 1;
      const pos = Math.round(dis.filter(i => i.sentiment === "positive").length / total * 100);
      const neg = Math.round(dis.filter(i => i.sentiment === "negative").length / total * 100);
      return { name: d?.name || id, color: d?.accentColor || "#888", pos, neg, neu: 100 - pos - neg, score: pos };
    });
  }, [domains, items]);

  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg space-y-1.5">
      {data.map(d => (
        <div key={d.name}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[7px] font-mono text-white/45 truncate max-w-[60%]">{d.name}</span>
            <div className="flex items-center gap-0.5">
              {d.score > 55 ? <ArrowUpRight className="h-2 w-2 text-emerald-400" /> : d.score < 45 ? <ArrowDownRight className="h-2 w-2 text-red-400" /> : <MinusIcon className="h-2 w-2 text-white/25" />}
              <span className={cn("text-[7px] font-mono font-bold", d.score > 55 ? "text-emerald-400" : d.score < 45 ? "text-red-400" : "text-white/35")}>{d.score}%</span>
            </div>
          </div>
          <div className="flex h-1 rounded-full overflow-hidden bg-white/[0.03]">
            <div className="h-full bg-emerald-500/70" style={{ width: `${d.pos}%` }} />
            <div className="h-full bg-amber-500/40" style={{ width: `${d.neu}%` }} />
            <div className="h-full bg-red-500/60" style={{ width: `${d.neg}%` }} />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 pt-0.5">
        <div className="flex items-center gap-0.5"><div className="w-1 h-1 rounded-full bg-emerald-500" /><span className="text-[5.5px] font-mono text-white/20">Pos</span></div>
        <div className="flex items-center gap-0.5"><div className="w-1 h-1 rounded-full bg-amber-500" /><span className="text-[5.5px] font-mono text-white/20">Neu</span></div>
        <div className="flex items-center gap-0.5"><div className="w-1 h-1 rounded-full bg-red-500" /><span className="text-[5.5px] font-mono text-white/20">Neg</span></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 4. SOURCE DONUT — compact pie + legend
// ═══════════════════════════════════════════
function SourceDonut({ items }: { items: FeedItem[] }) {
  const sources = useMemo(() => {
    const m = new Map<string, { count: number; color: string }>();
    items.forEach(i => {
      const e = m.get(i.source) || { count: 0, color: i.domainColor };
      m.set(i.source, { count: e.count + 1, color: e.color });
    });
    return Array.from(m.entries()).map(([n, d]) => ({ name: n, ...d })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [items]);

  const total = sources.reduce((a, s) => a + s.count, 0) || 1;
  const colors = ["#f59e0b", "#06b6d4", "#8b5cf6", "#10b981", "#f97316", "#ec4899"];
  let angle = 0;

  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg flex items-center gap-2">
      <svg viewBox="0 0 100 100" className="w-16 h-16 shrink-0">
        {sources.map((s, i) => {
          const pct = s.count / total;
          const sa = angle; angle += pct * 360;
          const c = colors[i % colors.length];
          const s1 = sa * Math.PI / 180 - Math.PI / 2, s2 = angle * Math.PI / 180 - Math.PI / 2;
          const lg = pct > 0.5 ? 1 : 0;
          return <path key={s.name} d={`M 50 50 L ${50 + 32 * Math.cos(s1)} ${50 + 32 * Math.sin(s1)} A 32 32 0 ${lg} 1 ${50 + 32 * Math.cos(s2)} ${50 + 32 * Math.sin(s2)} Z`} fill={c} fillOpacity={0.65} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />;
        })}
        <circle cx="50" cy="50" r="16" fill="rgba(0,0,0,0.85)" />
        <text x="50" y="48" textAnchor="middle" className="text-[6px] font-mono fill-white/40">SRC</text>
        <text x="50" y="56" textAnchor="middle" className="text-[8px] font-mono font-bold fill-white">{sources.length}</text>
      </svg>
      <div className="flex-1 space-y-0.5 overflow-hidden">
        {sources.slice(0, 5).map((s, i) => (
          <div key={s.name} className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-[6.5px] font-mono text-white/40 truncate">{s.name}</span>
            <span className="text-[6px] font-mono text-white/20 ml-auto shrink-0">{Math.round(s.count / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 5. FRESHNESS — compact time histogram
// ═══════════════════════════════════════════
function Freshness({ items }: { items: FeedItem[] }) {
  const buckets = useMemo(() => {
    const now = Date.now();
    const labels = ["<1h", "1-3h", "3-6h", "6-12h", "12-24h", ">24h"];
    const ranges = [3600000, 10800000, 21600000, 43200000, 86400000, Infinity];
    const counts = new Array(6).fill(0);
    items.forEach(item => {
      const age = now - new Date(item.publishedAt).getTime();
      for (let i = 0; i < ranges.length; i++) { if (age <= ranges[i]) { counts[i]++; break; } }
    });
    return labels.map((l, i) => ({ label: l, count: counts[i] }));
  }, [items]);
  const max = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg">
      <div className="flex items-end gap-0.5 h-10">
        {buckets.map((b, i) => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-px">
            <span className="text-[6px] font-mono text-cyan-400/70 font-bold leading-none">{b.count || ""}</span>
            <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max((b.count / max) * 100, 4)}%` }} transition={{ duration: 0.5, delay: i * 0.06 }} className="w-full rounded-sm" style={{ background: `linear-gradient(to top, rgba(6,182,212,0.55), rgba(6,182,212,0.1))`, boxShadow: b.count > 0 ? "0 0 4px rgba(6,182,212,0.2)" : "none" }} />
            <span className="text-[5px] font-mono text-white/18 leading-none">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 6. CONTENT TYPE — compact 4-cell grid
// ═══════════════════════════════════════════
function ContentTypes({ items }: { items: FeedItem[] }) {
  const types = useMemo(() => {
    const t = { article: 0, video: 0, social: 0, research: 0 };
    items.forEach(i => t[i.type]++);
    return t;
  }, [items]);
  const total = Object.values(types).reduce((a, b) => a + b, 0) || 1;
  const cfg = [
    { key: "article" as const, label: "Articles", icon: BookOpen, color: "#3b82f6" },
    { key: "video" as const, label: "Videos", icon: Eye, color: "#f97316" },
    { key: "social" as const, label: "Social", icon: Globe, color: "#a855f7" },
    { key: "research" as const, label: "Research", icon: Target, color: "#14b8a6" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1">
      {cfg.map(({ key, label, icon: Icon, color }) => (
        <div key={key} className="p-1.5 bg-black/40 border border-white/[0.05] rounded-lg flex flex-col items-center">
          <Icon className="h-2.5 w-2.5" style={{ color }} />
          <span className="text-[9px] font-mono font-bold text-white mt-0.5">{types[key]}</span>
          <span className="text-[5px] font-mono text-white/20 uppercase">{label}</span>
          <div className="w-full h-0.5 bg-white/[0.03] rounded-full mt-0.5 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(types[key] / total) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// 7. VELOCITY — feed speed indicator
// ═══════════════════════════════════════════
function Velocity({ items }: { items: FeedItem[] }) {
  const v = useMemo(() => {
    const now = Date.now();
    const h1 = items.filter(i => now - new Date(i.publishedAt).getTime() < 3600000).length;
    const h6 = items.filter(i => now - new Date(i.publishedAt).getTime() < 21600000).length;
    const rate = h1 > 2 ? "HIGH" : h6 > 5 ? "MODERATE" : "LOW";
    const color = h1 > 2 ? "#10b981" : h6 > 5 ? "#f59e0b" : "#ef4444";
    return { h1, h6, total: items.length, rate, color };
  }, [items]);

  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Flame className="h-3 w-3" style={{ color: v.color }} />
        <span className="text-[8px] font-mono font-bold" style={{ color: v.color }}>{v.rate}</span>
      </div>
      <span className="text-[7px] font-mono text-white/20">{v.h1}/1h · {v.h6}/6h · {v.total}/all</span>
    </div>
  );
}

// ═══════════════════════════════════════════
// 8. SIGNAL WAVE — live animated pulse
// ═══════════════════════════════════════════
function SignalWave({ items }: { items: FeedItem[] }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => { const t = setInterval(() => setPulse(p => p + 1), 1800); return () => clearInterval(t); }, []);
  const path = useMemo(() => {
    const n = 24, base = 50, vol = items.length > 0 ? 30 : 5;
    let d = `M 0 ${base}`;
    for (let i = 1; i <= n; i++) { d += ` L ${(100 / n) * i} ${base + (Math.sin(i * 1.4 + pulse) * vol * 0.5 + Math.cos(i * 2.1 - pulse * 0.4) * vol) / 2}`; }
    return d;
  }, [items.length, pulse]);

  return (
    <div className="h-12 bg-black/40 border border-emerald-500/15 rounded-lg overflow-hidden relative flex items-end p-1.5">
      <div className="absolute top-1 left-2 flex items-center gap-1">
        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping opacity-60" />
        <span className="text-[6px] font-mono font-bold text-emerald-400 tracking-widest">LIVE_RX</span>
      </div>
      <span className="absolute top-1 right-2 text-[7px] font-mono text-emerald-500/30">{items.length} PKT</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-6 overflow-visible">
        <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.25" /><stop offset="100%" stopColor="#10b981" stopOpacity="0" /></linearGradient></defs>
        <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#pg)" className="transition-all duration-1000" />
        <path d={path} fill="none" stroke="#34d399" strokeWidth="1" className="transition-all duration-1000 drop-shadow-[0_0_3px_rgba(52,211,153,0.6)]" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════
// 9. MARKET VECTOR — overall sentiment gauge
// ═══════════════════════════════════════════
function MarketVector({ items }: { items: FeedItem[] }) {
  const score = useMemo(() => {
    if (items.length === 0) return 50;
    const p = items.filter(i => i.sentiment === "positive").length;
    const n = items.filter(i => i.sentiment === "negative").length;
    return Math.round((p / ((p + n) || 1)) * 100);
  }, [items]);

  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg flex items-center gap-2.5">
      <div className="relative w-11 h-11 shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
          <motion.circle initial={{ strokeDashoffset: 88 }} animate={{ strokeDashoffset: 88 - score * 0.88 }} transition={{ duration: 1.5 }} cx="18" cy="18" r="14" fill="none" stroke={score > 60 ? "#34d399" : score < 40 ? "#f87171" : "#fbbf24"} strokeWidth="2" strokeDasharray="88" strokeLinecap="round" className="drop-shadow-[0_0_3px_currentColor]" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-bold font-mono text-white">{score}</span></div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[7px] font-mono text-white/30 uppercase tracking-widest">Market Vector</div>
        <div className="text-[10px] font-bold text-white/85 mt-0.5">{score > 60 ? "Strong Bullish" : score < 40 ? "Bearish Divergence" : "Neutral Consolidation"}</div>
        <div className="flex h-0.5 bg-white/[0.03] rounded-full mt-1 overflow-hidden">
          <div className="h-full bg-emerald-500/70" style={{ width: `${score}%` }} />
          <div className="h-full bg-red-500/60" style={{ width: `${100 - score}%` }} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// 10. HOT TOPICS — compact tag cloud
// ═══════════════════════════════════════════
function HotTopics({ items }: { items: FeedItem[] }) {
  const topics = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach(i => i.tags.forEach((t: string) => m.set(t, (m.get(t) || 0) + 1)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);
  if (topics.length === 0) return null;
  return (
    <div className="p-2 bg-black/40 border border-white/[0.05] rounded-lg">
      <div className="flex flex-wrap gap-0.5">
        {topics.map(([tag, count]) => (
          <div key={tag} className="flex items-center gap-px px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] hover:border-amber-500/30 transition-all cursor-crosshair group">
            <span className="text-[7px] font-mono text-white/20 group-hover:text-amber-500/50">#</span>
            <span className="text-[7px] font-mono text-white/60 group-hover:text-white">{tag}</span>
            <span className="text-[6px] font-mono text-amber-500/50 ml-0.5">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN — no scrolling, fits viewport
// ═══════════════════════════════════════════
export function TrendCharts() {
  const { activeDomains, feedItems } = useDigest();

  return (
    <div className="flex flex-col gap-2.5 h-[calc(100vh-120px)]">
      {/* Title */}
      <div className="flex items-center gap-1.5 px-1 pb-1.5 border-b border-white/[0.06] shrink-0">
        <Activity className="h-3 w-3 text-amber-500" />
        <h3 className="text-[9px] font-mono font-bold tracking-widest text-white/75 uppercase">Analytics Dashboard</h3>
      </div>

      {/* All widgets — no scroll, distributed evenly */}
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        <S icon={Zap} iconColor="#f59e0b" label="Intel Summary">
          <QuickStats items={feedItems} />
        </S>

        <S icon={Flame} iconColor="#ef4444" label="Velocity">
          <Velocity items={feedItems} />
        </S>

        <S icon={Activity} iconColor="#10b981" label="Signal Flow">
          <SignalWave items={feedItems} />
        </S>

        <S icon={BarChart2} iconColor="#3b82f6" label="Domain Coverage">
          <DomainBars domains={activeDomains} items={feedItems} />
        </S>

        <S icon={TrendingUp} iconColor="#10b981" label="Market Vector">
          <MarketVector items={feedItems} />
        </S>

        <S icon={Target} iconColor="#8b5cf6" label="Domain Sentiment">
          <DomainSentiment domains={activeDomains} items={feedItems} />
        </S>

        <S icon={PieChart} iconColor="#f97316" label="Source Mix">
          <SourceDonut items={feedItems} />
        </S>

        <S icon={Clock} iconColor="#06b6d4" label="Freshness">
          <Freshness items={feedItems} />
        </S>

        <S icon={Layers} iconColor="#a855f7" label="Content Types">
          <ContentTypes items={feedItems} />
        </S>

        <S icon={Hash} iconColor="#f59e0b" label="Hot Tokens">
          <HotTopics items={feedItems} />
        </S>
      </div>
    </div>
  );
}
