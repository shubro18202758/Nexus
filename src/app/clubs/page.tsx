"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network, RefreshCw, LayoutGrid, List, GitCompare, ArrowUpDown,
  ArrowUp, ArrowDown, X, ChevronRight, UserCheck, Search, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useClubsStore } from "@/hooks/use-clubs-store";
import { ClubCard } from "@/components/clubs/club-card";
import { NexusSearchBar } from "@/components/clubs/nexus-search-bar";
import { NexusCrawlPanel } from "@/components/clubs/nexus-crawl-panel";
import { ClubStats, ClubFilterBar } from "@/components/clubs/club-stats";
import { cn } from "@/lib/utils";
import Link from "next/link";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "memberCount", label: "Members" },
  { value: "foundedYear", label: "Founded" },
  { value: "updatedAt", label: "Updated" },
  { value: "activityScore", label: "Activity" },
] as const;

export default function ClubsPage() {
  const {
    clubs,
    searchResults,
    searchAnswer,
    isLoading,
    isSearching,
    isCrawling,
    crawlEvents,
    crawlProgress,
    activeIIT,
    activeCategory,
    searchQuery,
    localFilter,
    stats,
    agenticResult,
    viewMode,
    sortBy,
    sortDesc,
    compareList,
    isCompareMode,
    showRecruiting,
    fetchClubs,
    fetchStats,
    searchClubs,
    startCrawl,
    setActiveIIT,
    setActiveCategory,
    setSearchResults,
    setLocalFilter,
    setViewMode,
    setSortBy,
    toggleSortDesc,
    toggleCompare,
    clearCompare,
    setCompareMode,
    setShowRecruiting,
  } = useClubsStore();

  // IITB gets the full AI search experience; others get manual browsing
  const isAIEnabled = activeIIT === "all" || activeIIT === "iitb";

  // "Show more" for default view (all IITs) — limit initial cards
  const INITIAL_SHOW = 8;
  const [showAll, setShowAll] = useState(false);

  // Initial load
  useEffect(() => {
    fetchClubs();
    fetchStats();
  }, [fetchClubs, fetchStats]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchClubs(activeIIT, activeCategory);
  }, [activeIIT, activeCategory, fetchClubs]);

  // Extract unique IITs and categories from stats
  const iits = useMemo(
    () => stats?.byIIT.map((x) => x.iitId) ?? [],
    [stats]
  );
  const categories = useMemo(
    () => stats?.byCategory.map((x) => x.category).filter((c) => c !== "other") ?? [],
    [stats]
  );

  // Filter and sort clubs
  const displayClubs = useMemo(() => {
    // If there's an active AI search, show ONLY search results (even if empty)
    let list = searchQuery ? [...searchResults] : [...clubs];

    // Client-side local text filter (for manual browsing / non-AI IITs)
    if (localFilter && localFilter.trim().length > 0 && !searchQuery) {
      const terms = localFilter.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
      if (terms.length > 0) {
        list = list.filter(club => {
          const haystack = [
            club.name, club.description, club.tagline, club.category,
            club.iitId, ...(Array.isArray(club.tags) ? club.tags as string[] : []),
          ].filter(Boolean).join(" ").toLowerCase();
          return terms.some(t => haystack.includes(t));
        });
      }
    }

    // Recruiting filter
    if (showRecruiting) {
      list = list.filter((c) => c.isRecruiting);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = (a.name ?? "").localeCompare(b.name ?? "");
          break;
        case "memberCount":
          cmp = (a.memberCount ?? 0) - (b.memberCount ?? 0);
          break;
        case "foundedYear":
          cmp = (a.foundedYear ?? 0) - (b.foundedYear ?? 0);
          break;
        case "updatedAt":
          cmp = new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime();
          break;
        case "activityScore":
          cmp = (a.activityScore ?? 0) - (b.activityScore ?? 0);
          break;
      }
      return sortDesc ? -cmp : cmp;
    });

    return list;
  }, [clubs, searchResults, searchQuery, localFilter, showRecruiting, sortBy, sortDesc]);

  const gridClass = viewMode === "list"
    ? "flex flex-col gap-3"
    : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-8 pb-32 relative overflow-x-hidden w-full max-w-full box-border"
    >
      {/* ─── Hero Header ─── */}
      <header className="flex items-center justify-between relative z-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(139,92,246,0.4)] font-space">
            NEXUS // CLUBS
          </h1>
          <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase text-violet-500/60 flex items-center gap-2 mt-1">
            <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(139,92,246,0.5)]" />
            Cross-IIT Club Intelligence Hub // {clubs.length} Nodes Active
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.1)] backdrop-blur-md">
            <span className="flex h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse shadow-[0_0_5px_rgba(139,92,246,0.5)]" />
            <span className="text-[10px] text-violet-400 font-mono font-bold tracking-wider">
              NEXUS ONLINE
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { fetchClubs(activeIIT, activeCategory); fetchStats(); }}
            className="text-white/40 hover:text-white/80 h-8 w-8 p-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* ─── Stats ─── */}
      <ClubStats stats={stats} />

      {/* ─── AI Search (IITB / ALL) or Manual Filter (other IITs) ─── */}
      {isAIEnabled ? (
        <NexusSearchBar
          onSearch={(q) => searchClubs(q)}
          onClear={() => { setSearchResults([], ""); useClubsStore.getState().setSearchQuery(""); useClubsStore.getState().setAgenticResult(null); }}
          isSearching={isSearching}
          hasResults={searchResults.length > 0}
          resultCount={searchResults.length}
          answer={searchAnswer}
          agenticResult={agenticResult}
        />
      ) : (
        /* ─── Manual Text Filter for non-AI IITs ─── */
        <div className="relative group">
          <div className={cn(
            "relative flex items-center gap-2 rounded-2xl border bg-black/60 backdrop-blur-2xl px-4 py-1 transition-all duration-300",
            "border-white/[0.08] hover:border-white/[0.15] focus-within:border-emerald-500/40"
          )}>
            <Filter className="w-5 h-5 text-emerald-400/70 shrink-0" />
            <Input
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
              placeholder={`Filter ${activeIIT !== "all" ? activeIIT.toUpperCase() : ""} clubs by name, category, tags...`}
              className="flex-1 bg-transparent border-0 text-white placeholder:text-white/30 focus-visible:ring-0 text-sm font-mono h-10"
            />
            {localFilter && (
              <button
                type="button"
                onClick={() => setLocalFilter("")}
                className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Search className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] font-mono font-bold text-emerald-400 tracking-wider">MANUAL</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Control Bar: Filters + View Toggle + Sort ─── */}
      <div className="space-y-4">
        {/* Filters */}
        {(iits.length > 0 || categories.length > 0) && (
          <ClubFilterBar
            activeIIT={activeIIT}
            activeCategory={activeCategory}
            onIITChange={(iit) => {
              setActiveIIT(iit);
              setSearchResults([], "");
              setLocalFilter("");
              setShowAll(false);
              // Clear AI search state so displayClubs uses clubs[], not empty searchResults
              useClubsStore.getState().setSearchQuery("");
              useClubsStore.getState().setAgenticResult(null);
            }}
            onCategoryChange={(cat) => {
              setActiveCategory(cat);
              setSearchResults([], "");
              setLocalFilter("");
              useClubsStore.getState().setSearchQuery("");
              useClubsStore.getState().setAgenticResult(null);
            }}
            iits={iits}
            categories={categories}
          />
        )}

        {/* View / Sort / Compare toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Left: View switcher + Recruiting filter */}
          <div className="flex items-center gap-2">
            {/* View mode */}
            <div className="flex items-center bg-black/40 rounded-lg border border-white/[0.06] p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "grid" ? "bg-violet-500/20 text-violet-400" : "text-white/30 hover:text-white/50"
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "list" ? "bg-violet-500/20 text-violet-400" : "text-white/30 hover:text-white/50"
                )}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Compare mode toggle */}
            <button
              onClick={() => setCompareMode(!isCompareMode)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wider border transition-all",
                isCompareMode
                  ? "bg-cyan-500/15 border-cyan-500/25 text-cyan-400"
                  : "bg-black/40 border-white/[0.06] text-white/30 hover:text-white/50 hover:border-white/[0.12]"
              )}
            >
              <GitCompare className="w-3 h-3" />
              COMPARE
            </button>

            {/* Recruiting filter */}
            <button
              onClick={() => setShowRecruiting(!showRecruiting)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wider border transition-all",
                showRecruiting
                  ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400"
                  : "bg-black/40 border-white/[0.06] text-white/30 hover:text-white/50 hover:border-white/[0.12]"
              )}
            >
              <UserCheck className="w-3 h-3" />
              RECRUITING
            </button>
          </div>

          {/* Right: Sort controls + count */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-white/20 tracking-wider mr-1">SORT:</span>
            <div className="flex items-center gap-1 bg-black/40 rounded-lg border border-white/[0.06] p-0.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (sortBy === opt.value) {
                      toggleSortDesc();
                    } else {
                      setSortBy(opt.value as typeof sortBy);
                    }
                  }}
                  className={cn(
                    "px-2 py-1 rounded-md text-[9px] font-mono tracking-wider transition-all flex items-center gap-0.5",
                    sortBy === opt.value
                      ? "bg-violet-500/20 text-violet-400 font-bold"
                      : "text-white/25 hover:text-white/45"
                  )}
                >
                  {opt.label}
                  {sortBy === opt.value && (
                    sortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />
                  )}
                </button>
              ))}
            </div>

            <span className="text-[9px] font-mono text-white/15 ml-2">
              {displayClubs.length} CLUBS
            </span>
          </div>
        </div>
      </div>

      {/* ─── Compare Bar (sticky) ─── */}
      <AnimatePresence>
        {isCompareMode && compareList.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="sticky bottom-4 z-50 mx-auto w-full max-w-3xl"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-cyan-500/25 bg-black/80 backdrop-blur-2xl shadow-[0_0_30px_rgba(6,182,212,0.15)]">
              <GitCompare className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-[10px] font-mono text-cyan-400 tracking-wider font-bold mr-1">
                COMPARE ({compareList.length}/4)
              </span>

              <div className="flex items-center gap-2 flex-1 overflow-x-auto">
                {compareList.map((cmpClub) => (
                  <Badge
                    key={cmpClub.id}
                    variant="outline"
                    className="bg-cyan-500/10 border-cyan-500/20 text-cyan-300 text-[9px] font-mono shrink-0 flex items-center gap-1"
                  >
                    {cmpClub.name}
                    <button onClick={() => toggleCompare(cmpClub)} className="hover:text-white ml-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={clearCompare}
                className="text-white/30 hover:text-white/60 h-7 text-[9px] font-mono"
              >
                Clear
              </Button>
              <Button
                size="sm"
                disabled={compareList.length < 2}
                className="bg-cyan-600/80 hover:bg-cyan-500 text-white rounded-xl h-7 px-3 text-[10px] font-mono tracking-wider"
              >
                <ChevronRight className="w-3 h-3 mr-1" />
                ANALYZE
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Nexus Crawler Panel ─── */}
      <NexusCrawlPanel
        isCrawling={isCrawling}
        crawlEvents={crawlEvents}
        crawlProgress={crawlProgress}
        onStartCrawl={startCrawl}
      />

      {/* ─── Club Grid / List ─── */}
      {isLoading && clubs.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-black/40 p-5 space-y-3">
              <Skeleton className="h-4 w-3/4 bg-white/[0.06]" />
              <Skeleton className="h-3 w-1/2 bg-white/[0.04]" />
              <Skeleton className="h-12 w-full bg-white/[0.04]" />
              <div className="flex gap-1">
                <Skeleton className="h-4 w-12 rounded-full bg-white/[0.04]" />
                <Skeleton className="h-4 w-14 rounded-full bg-white/[0.04]" />
              </div>
            </div>
          ))}
        </div>
      ) : displayClubs.length > 0 ? (
        <>
          <motion.div layout className={gridClass}>
            <AnimatePresence mode="popLayout">
              {(activeIIT === "all" && !searchQuery && !localFilter && !showAll
                ? displayClubs.slice(0, INITIAL_SHOW)
                : displayClubs
              ).map((club, i) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  index={i}
                  viewMode={viewMode === "compare" ? "grid" : viewMode}
                  isCompareMode={isCompareMode}
                  isSelected={compareList.some((c) => c.id === club.id)}
                  onToggleCompare={() => toggleCompare(club)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
          {/* Show More / Show Less button when viewing all IITs */}
          {activeIIT === "all" && !searchQuery && !localFilter && displayClubs.length > INITIAL_SHOW && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setShowAll(!showAll)}
                className="px-5 py-2 rounded-xl text-xs font-mono font-bold tracking-wider border border-violet-500/20 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/30 transition-all"
              >
                {showAll ? `SHOW LESS` : `SHOW ALL ${displayClubs.length} CLUBS`}
              </button>
            </div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-3xl bg-black/20"
        >
          <Network className="h-10 w-10 text-violet-500/30 mb-4" />
          {searchQuery ? (
            <>
              <p className="text-white/40 font-mono text-sm mb-1">No matching clubs found</p>
              <p className="text-white/20 font-mono text-xs text-center max-w-md">
                No clubs in the database match &quot;{searchQuery}&quot;. Check the AI answer above for insights, or try crawling more IIT data.
              </p>
            </>
          ) : localFilter ? (
            <>
              <p className="text-white/40 font-mono text-sm mb-1">No clubs match your filter</p>
              <p className="text-white/20 font-mono text-xs text-center max-w-md">
                No clubs match &quot;{localFilter}&quot;. Try different keywords or clear the filter.
              </p>
            </>
          ) : (
            <>
              <p className="text-white/40 font-mono text-sm mb-1">No clubs discovered yet</p>
              <p className="text-white/20 font-mono text-xs">
                Launch the Nexus Crawler above to discover clubs across IITs
              </p>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
