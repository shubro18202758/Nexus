"use client";

import { motion } from "framer-motion";
import { Database, BookOpen, Calendar, Building2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClubStatsProps {
  stats: {
    totalClubs: number;
    totalKnowledge: number;
    totalEvents: number;
    byCategory: { category: string; count: number }[];
    byIIT: { iitId: string; count: number }[];
  } | null;
}

const STAT_ITEMS = [
  { key: "totalClubs", label: "CLUBS", icon: Building2, color: "text-violet-400", glow: "rgba(139,92,246,0.3)" },
  { key: "totalKnowledge", label: "INTEL", icon: BookOpen, color: "text-cyan-400", glow: "rgba(6,182,212,0.3)" },
  { key: "totalEvents", label: "EVENTS", icon: Calendar, color: "text-emerald-400", glow: "rgba(16,185,129,0.3)" },
];

export function ClubStats({ stats }: ClubStatsProps) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {STAT_ITEMS.map((item, i) => {
        const value = stats[item.key as keyof typeof stats] as number;
        return (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative group rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-md p-4 overflow-hidden hover:border-white/[0.12] transition-all"
          >
            {/* Background glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: `radial-gradient(100px circle at 50% 50%, ${item.glow}, transparent)`,
              }}
            />

            <div className="relative z-10 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-white/[0.04]", item.color)}>
                <item.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-bold text-white font-space">{value}</p>
                <p className="text-[9px] font-mono text-white/40 tracking-widest">{item.label}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

interface ClubFilterBarProps {
  activeIIT: string;
  activeCategory: string;
  onIITChange: (iit: string) => void;
  onCategoryChange: (cat: string) => void;
  iits: string[];
  categories: string[];
}

export function ClubFilterBar({
  activeIIT,
  activeCategory,
  onIITChange,
  onCategoryChange,
  iits,
  categories,
}: ClubFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* IIT Filter */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">IIT:</span>
        <div className="flex gap-1">
          <FilterPill active={activeIIT === "all"} onClick={() => onIITChange("all")} label="ALL" />
          {iits.map((iit) => (
            <FilterPill
              key={iit}
              active={activeIIT === iit}
              onClick={() => onIITChange(iit)}
              label={iit.toUpperCase()}
            />
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">TYPE:</span>
        <div className="flex gap-1 flex-wrap">
          <FilterPill active={activeCategory === "all"} onClick={() => onCategoryChange("all")} label="ALL" />
          {categories.map((cat) => (
            <FilterPill
              key={cat}
              active={activeCategory === cat}
              onClick={() => onCategoryChange(cat)}
              label={cat.toUpperCase()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all",
        active
          ? "bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.15)]"
          : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/[0.12]"
      )}
    >
      {label}
    </motion.button>
  );
}
