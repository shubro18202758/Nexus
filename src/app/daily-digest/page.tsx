"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Zap, Play, TrendingUp, Clock, Sparkles } from "lucide-react";
import { useDigest, type FeedTab } from "@/hooks/use-digest";
import { DigestHeader } from "@/components/digest/digest-header";
import { DomainSelector } from "@/components/digest/domain-selector";
import { DigestFilterPanel } from "@/components/digest/digest-filter-panel";
import { FeedGrid } from "@/components/digest/feed-grid";
import { TrendCharts } from "@/components/digest/trend-charts";
import { FilterAnalyticsDashboard } from "@/components/digest/filter-analytics-dashboard";
import { DigestCustomizer } from "@/components/digest/digest-customizer";
import { cn } from "@/lib/utils";

const feedTabs: { value: FeedTab; label: string; icon: typeof Zap }[] = [
  { value: "foryou", label: "For You", icon: Sparkles },
  { value: "latest", label: "Latest", icon: Clock },
  { value: "trending", label: "Trending", icon: TrendingUp },
  { value: "videos", label: "Videos", icon: Play },
];

export default function DailyDigestPage() {
  const { refreshFeed, activeTab, setActiveTab, showCharts, refreshInterval, activeDomains, filterActive } = useDigest();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initial feed load
  useEffect(() => {
    if (!hasInitialized && activeDomains.length > 0) {
      setHasInitialized(true);
      refreshFeed();
    }
  }, [hasInitialized, activeDomains.length, refreshFeed]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      refreshFeed();
    }, refreshInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval, refreshFeed]);

  // Refresh when domains change
  const handleDomainsChanged = useCallback(() => {
    const timer = setTimeout(() => refreshFeed(), 500);
    return () => clearTimeout(timer);
  }, [refreshFeed]);

  useEffect(() => {
    if (hasInitialized) {
      handleDomainsChanged();
    }
  }, [activeDomains.length, hasInitialized, handleDomainsChanged]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="flex flex-col min-h-screen p-6 md:p-8 space-y-6 pb-32 relative overflow-hidden"
    >
      {/* Ambient background effects */}
      <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-black rounded-[100%] shadow-[0_0_100px_50px_rgba(245,158,11,0.08)] -z-10 blur-xl border border-white/5 pointer-events-none" />
      <div className="absolute top-[-8%] right-[10%] w-[400px] h-[250px] bg-gradient-to-b from-transparent to-orange-900/5 -z-10 blur-2xl pointer-events-none" />

      {/* Header */}
      <DigestHeader onOpenSettings={() => setSettingsOpen(true)} />

      {/* Domain Selector */}
      <DomainSelector />

      {/* Feed Tabs + Live indicator row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-1 p-1 bg-black/40 border border-white/[0.06] rounded-xl backdrop-blur-md">
          {feedTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wider transition-all",
                  isActive
                    ? "bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                    : "text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
                )}
              >
                <Icon className={cn("h-3 w-3", isActive && tab.value === "videos" && "fill-current")} />
                {tab.label.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[9px] text-emerald-400 font-mono font-bold tracking-wider">FEED LIVE</span>
        </div>
      </motion.div>

      {/* Main content area — feed + analytics sidebar */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex gap-6 items-start"
      >
        {/* Feed grid (main area) */}
        <div className={cn(showCharts ? "flex-1 min-w-0" : "w-full")}>
          {/* NL AI Filter */}
          <div className="mb-4">
            <DigestFilterPanel />
          </div>

          <FeedGrid />
        </div>

        {/* Sidebar — trend charts OR filter analytics */}
        {showCharts && (
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="w-[300px] shrink-0 hidden lg:block sticky top-24"
          >
            {filterActive ? <FilterAnalyticsDashboard /> : <TrendCharts />}
          </motion.aside>
        )}
      </motion.div>

      {/* Customizer panel */}
      <DigestCustomizer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </motion.div>
  );
}
