"use client";

// ===================================================================
// DigestFilterPanel — NL AI Filter UI for Daily Digest
//
// Full-featured filter panel with:
//   • Natural language query input with suggestions
//   • Confidence threshold slider
//   • Sentiment / content type / domain / date range filters
//   • Sort order, semantic depth, boost/exclude controls
//   • Query history dropdown
//   • Live filter status + clear button
// ===================================================================

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Brain, Zap, Clock, Filter, Sparkles, ChevronDown,
  ChevronUp, Target, Gauge, ArrowUpDown, Layers, Globe,
  History, Trash2, Settings2, TrendingUp, ShieldCheck, Flame,
  MessageSquare, BookOpen, Video, Users, Activity, AlertTriangle,
} from "lucide-react";
import { useDigest } from "@/hooks/use-digest";
import type { FilterConfig } from "@/lib/digest/digest-filter-engine";
import { cn } from "@/lib/utils";

// ── Quick Suggestions ──
const QUICK_QUERIES = [
  "AI breakthroughs and new models",
  "Startup funding and acquisitions",
  "Security vulnerabilities and patches",
  "React and Next.js updates",
  "Cryptocurrency market trends",
  "Cloud computing and DevOps",
  "Mobile app development tips",
  "Data science and analytics",
];

const SENTIMENT_OPTIONS = [
  { value: "all", label: "ALL", icon: Activity, color: "text-white/50" },
  { value: "positive", label: "POS", icon: TrendingUp, color: "text-emerald-400" },
  { value: "neutral", label: "NEU", icon: ShieldCheck, color: "text-cyan-400" },
  { value: "negative", label: "NEG", icon: AlertTriangle, color: "text-red-400" },
] as const;

const CONTENT_TYPE_OPTIONS = [
  { value: "article", label: "Articles", icon: BookOpen, color: "text-amber-400" },
  { value: "video", label: "Videos", icon: Video, color: "text-red-400" },
  { value: "social", label: "Social", icon: Users, color: "text-blue-400" },
  { value: "research", label: "Research", icon: Brain, color: "text-purple-400" },
] as const;

const DATE_RANGE_OPTIONS = [
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "ALL" },
] as const;

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance", icon: Target },
  { value: "confidence", label: "Confidence", icon: Gauge },
  { value: "recency", label: "Recency", icon: Clock },
  { value: "sentiment", label: "Sentiment", icon: MessageSquare },
] as const;

const DEPTH_OPTIONS = [
  { value: "fast", label: "FAST", desc: "Keyword-only, instant results", color: "text-emerald-400", glow: "shadow-emerald-500/20" },
  { value: "balanced", label: "BALANCED", desc: "AI + keywords, best accuracy", color: "text-amber-400", glow: "shadow-amber-500/20" },
  { value: "deep", label: "DEEP", desc: "Full LLM analysis, slower", color: "text-purple-400", glow: "shadow-purple-500/20" },
] as const;

export function DigestFilterPanel() {
  const {
    filterConfig,
    setFilterConfig,
    runFilter,
    clearFilter,
    isFiltering,
    filterActive,
    filterResults,
    filterAnalytics,
    filterHistory,
    feedItems,
  } = useDigest();

  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [boostInput, setBoostInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (filterConfig.query.trim() && feedItems.length > 0) {
      setShowSuggestions(false);
      setShowHistory(false);
      runFilter();
    }
  }, [filterConfig.query, feedItems.length, runFilter]);

  const handleQueryChange = useCallback((query: string) => {
    setFilterConfig({ query });
    setShowSuggestions(query.length === 0);
  }, [setFilterConfig]);

  const handleSuggestionClick = useCallback((query: string) => {
    setFilterConfig({ query });
    setShowSuggestions(false);
    setShowHistory(false);
    // Auto-run after a brief delay
    setTimeout(() => runFilter(), 100);
  }, [setFilterConfig, runFilter]);

  const handleAddBoostSource = useCallback(() => {
    const src = boostInput.trim();
    if (src && !filterConfig.boostSources.includes(src)) {
      setFilterConfig({ boostSources: [...filterConfig.boostSources, src] });
      setBoostInput("");
    }
  }, [boostInput, filterConfig.boostSources, setFilterConfig]);

  const handleAddExcludeKeyword = useCallback(() => {
    const kw = excludeInput.trim();
    if (kw && !filterConfig.excludeKeywords.includes(kw)) {
      setFilterConfig({ excludeKeywords: [...filterConfig.excludeKeywords, kw] });
      setExcludeInput("");
    }
  }, [excludeInput, filterConfig.excludeKeywords, setFilterConfig]);

  const confidencePercent = Math.round(filterConfig.minConfidence * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {/* Main Search Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <div className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-2xl border backdrop-blur-xl transition-all duration-300",
          filterActive
            ? "bg-amber-500/[0.07] border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.12)]"
            : "bg-black/50 border-white/[0.08] hover:border-white/[0.15] shadow-[0_0_15px_rgba(0,0,0,0.3)]",
          isFiltering && "animate-pulse"
        )}>
          {/* Search / Brain Icon */}
          <div className="relative shrink-0">
            {isFiltering ? (
              <div className="relative">
                <Brain className="h-4 w-4 text-amber-400 animate-spin" />
                <div className="absolute inset-0 animate-ping">
                  <Brain className="h-4 w-4 text-amber-400/30" />
                </div>
              </div>
            ) : filterActive ? (
              <Brain className="h-4 w-4 text-amber-400" />
            ) : (
              <Search className="h-4 w-4 text-white/30" />
            )}
          </div>

          {/* Query Input */}
          <input
            ref={inputRef}
            type="text"
            value={filterConfig.query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => {
              if (filterConfig.query.length === 0) setShowSuggestions(true);
              else if (filterHistory.length > 0) setShowHistory(true);
            }}
            onBlur={() => {
              setTimeout(() => {
                setShowSuggestions(false);
                setShowHistory(false);
              }, 200);
            }}
            placeholder="Ask anything... e.g. 'AI breakthroughs this week'"
            className="flex-1 bg-transparent text-sm font-mono text-white/90 placeholder:text-white/20 outline-none min-w-0"
            disabled={isFiltering}
          />

          {/* Active filter indicator */}
          {filterActive && filterResults.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/20">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] font-mono font-bold text-amber-300">{filterResults.length}</span>
            </div>
          )}

          {/* Clear button */}
          {(filterConfig.query || filterActive) && (
            <button
              type="button"
              title="Clear filter"
              aria-label="Clear filter"
              onClick={() => {
                clearFilter();
                handleQueryChange("");
                inputRef.current?.focus();
              }}
              className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="h-3 w-3 text-white/40" />
            </button>
          )}

          {/* Run Filter Button */}
          <button
            type="submit"
            disabled={isFiltering || !filterConfig.query.trim() || feedItems.length === 0}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold tracking-wider transition-all",
              isFiltering
                ? "bg-amber-500/20 text-amber-300 cursor-wait"
                : filterConfig.query.trim()
                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                  : "bg-white/[0.04] text-white/20 cursor-not-allowed"
            )}
          >
            <Zap className="h-3 w-3" />
            {isFiltering ? "SCANNING..." : "FILTER"}
          </button>

          {/* Expand/Collapse Advanced */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "shrink-0 h-7 w-7 flex items-center justify-center rounded-lg border transition-all",
              expanded
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                : "bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-white/50"
            )}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
          </button>
        </div>

        {/* Suggestions Dropdown */}
        <AnimatePresence>
          {showSuggestions && !filterConfig.query && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full left-0 right-0 mt-2 p-2 bg-black/90 border border-white/[0.08] rounded-xl backdrop-blur-2xl z-50 shadow-2xl"
            >
              <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                <Sparkles className="h-3 w-3 text-amber-400/60" />
                <span className="text-[9px] font-mono text-white/30 tracking-wider">SUGGESTED QUERIES</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {QUICK_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSuggestionClick(q)}
                    className="text-left px-2.5 py-1.5 rounded-lg text-[10px] font-mono text-white/50 hover:text-amber-300 hover:bg-amber-500/10 transition-all truncate"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Dropdown */}
        <AnimatePresence>
          {showHistory && filterHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full left-0 right-0 mt-2 p-2 bg-black/90 border border-white/[0.08] rounded-xl backdrop-blur-2xl z-50 shadow-2xl"
            >
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <div className="flex items-center gap-1.5">
                  <History className="h-3 w-3 text-cyan-400/60" />
                  <span className="text-[9px] font-mono text-white/30 tracking-wider">RECENT QUERIES</span>
                </div>
              </div>
              {filterHistory.slice(0, 6).map((q, i) => (
                <button
                  key={`${q}-${i}`}
                  type="button"
                  onClick={() => handleSuggestionClick(q)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-mono text-white/50 hover:text-cyan-300 hover:bg-cyan-500/10 transition-all truncate"
                >
                  <Clock className="inline h-2.5 w-2.5 mr-1.5 opacity-40" />
                  {q}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* ── Advanced Controls (Expandable) ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-4 bg-black/40 border border-white/[0.06] rounded-2xl backdrop-blur-xl space-y-4">
              {/* Row 1: Confidence + Semantic Depth + Sort */}
              <div className="grid grid-cols-3 gap-3">
                {/* Confidence Slider */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <Gauge className="h-2.5 w-2.5" /> MIN CONFIDENCE
                  </label>
                  <div className="relative">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={confidencePercent}
                      title="Minimum confidence threshold"
                      aria-label="Minimum confidence threshold"
                      onChange={(e) => setFilterConfig({ minConfidence: Number(e.target.value) / 100 })}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] font-mono text-white/20">0%</span>
                      <span className="text-[10px] font-mono font-bold text-amber-300">
                        {confidencePercent}%
                      </span>
                      <span className="text-[8px] font-mono text-white/20">100%</span>
                    </div>
                  </div>
                </div>

                {/* Semantic Depth */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <Brain className="h-2.5 w-2.5" /> AI DEPTH
                  </label>
                  <div className="space-y-1">
                    {DEPTH_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFilterConfig({ semanticDepth: opt.value })}
                        className={cn(
                          "w-full flex items-center justify-between px-2 py-1 rounded-lg border text-[9px] font-mono transition-all",
                          filterConfig.semanticDepth === opt.value
                            ? `${opt.color} border-current/30 bg-current/5 font-bold shadow-sm ${opt.glow}`
                            : "text-white/25 border-white/[0.04] hover:bg-white/[0.03]"
                        )}
                      >
                        <span>{opt.label}</span>
                        {filterConfig.semanticDepth === opt.value && (
                          <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <ArrowUpDown className="h-2.5 w-2.5" /> SORT BY
                  </label>
                  <div className="space-y-1">
                    {SORT_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setFilterConfig({ sortBy: opt.value })}
                          className={cn(
                            "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-mono transition-all",
                            filterConfig.sortBy === opt.value
                              ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/5 font-bold"
                              : "text-white/25 border-white/[0.04] hover:bg-white/[0.03]"
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 2: Sentiment + Content Types + Date Range */}
              <div className="grid grid-cols-3 gap-3">
                {/* Sentiment Filter */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <MessageSquare className="h-2.5 w-2.5" /> SENTIMENT
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {SENTIMENT_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setFilterConfig({ sentimentFilter: opt.value })}
                          className={cn(
                            "flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[9px] font-mono transition-all",
                            filterConfig.sentimentFilter === opt.value
                              ? `${opt.color} border-current/30 bg-current/10 font-bold`
                              : "text-white/20 border-white/[0.04] hover:bg-white/[0.03]"
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Content Types */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <Layers className="h-2.5 w-2.5" /> CONTENT TYPE
                  </label>
                  <div className="space-y-1">
                    {CONTENT_TYPE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = filterConfig.contentTypes.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            const next = isActive
                              ? filterConfig.contentTypes.filter((t) => t !== opt.value)
                              : [...filterConfig.contentTypes, opt.value];
                            setFilterConfig({ contentTypes: next.length > 0 ? next : [opt.value] });
                          }}
                          className={cn(
                            "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-mono transition-all",
                            isActive
                              ? `${opt.color} border-current/30 bg-current/5 font-bold`
                              : "text-white/20 border-white/[0.04] hover:bg-white/[0.03]"
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {opt.label}
                          {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Date Range */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <Clock className="h-2.5 w-2.5" /> DATE RANGE
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {DATE_RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFilterConfig({ dateRange: opt.value })}
                        className={cn(
                          "px-2 py-1.5 rounded-lg border text-[9px] font-mono font-bold transition-all text-center",
                          filterConfig.dateRange === opt.value
                            ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                            : "text-white/20 border-white/[0.04] hover:bg-white/[0.03]"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Max Results */}
                  <div className="mt-3">
                    <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-1.5">
                      <Filter className="h-2.5 w-2.5" /> MAX RESULTS
                    </label>
                    <div className="flex gap-1">
                      {[10, 25, 50, 100].map((n) => (
                        <button
                          key={n}
                          onClick={() => setFilterConfig({ maxResults: n })}
                          className={cn(
                            "flex-1 px-1.5 py-1 rounded-lg border text-[9px] font-mono transition-all text-center",
                            filterConfig.maxResults === n
                              ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10 font-bold"
                              : "text-white/20 border-white/[0.04] hover:bg-white/[0.03]"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Boost Sources + Exclude Keywords */}
              <div className="grid grid-cols-2 gap-3">
                {/* Boost Sources */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <Flame className="h-2.5 w-2.5 text-orange-400" /> BOOST SOURCES
                  </label>
                  <div className="flex gap-1 mb-1.5">
                    <input
                      type="text"
                      value={boostInput}
                      onChange={(e) => setBoostInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddBoostSource())}
                      placeholder="e.g. techcrunch.com"
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] font-mono text-white/70 placeholder:text-white/15 outline-none focus:border-orange-500/30 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={handleAddBoostSource}
                      className="px-2 py-1 rounded-lg border border-orange-500/20 bg-orange-500/10 text-[9px] font-mono text-orange-300 font-bold hover:bg-orange-500/20 transition-all"
                    >
                      +
                    </button>
                  </div>
                  {filterConfig.boostSources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filterConfig.boostSources.map((src) => (
                        <span
                          key={src}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[8px] font-mono text-orange-300"
                        >
                          {src}
                          <button
                            type="button"
                            onClick={() => setFilterConfig({
                              boostSources: filterConfig.boostSources.filter((s) => s !== src),
                            })}
                            className="hover:text-white"
                          >
                            <X className="h-2 w-2" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Exclude Keywords */}
                <div>
                  <label className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase flex items-center gap-1 mb-2">
                    <Trash2 className="h-2.5 w-2.5 text-red-400" /> EXCLUDE KEYWORDS
                  </label>
                  <div className="flex gap-1 mb-1.5">
                    <input
                      type="text"
                      value={excludeInput}
                      onChange={(e) => setExcludeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddExcludeKeyword())}
                      placeholder="e.g. sponsored"
                      className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] font-mono text-white/70 placeholder:text-white/15 outline-none focus:border-red-500/30 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={handleAddExcludeKeyword}
                      className="px-2 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-[9px] font-mono text-red-300 font-bold hover:bg-red-500/20 transition-all"
                    >
                      +
                    </button>
                  </div>
                  {filterConfig.excludeKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filterConfig.excludeKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[8px] font-mono text-red-300"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() => setFilterConfig({
                              excludeKeywords: filterConfig.excludeKeywords.filter((k) => k !== kw),
                            })}
                            className="hover:text-white"
                          >
                            <X className="h-2 w-2" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Status Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="text-[8px] font-mono text-white/20">
                    {feedItems.length} items in feed
                  </span>
                  {filterActive && filterAnalytics && (
                    <>
                      <span className="text-[8px] font-mono text-amber-400/60">
                        {filterAnalytics.totalOutput} matched
                      </span>
                      <span className="text-[8px] font-mono text-white/15">
                        {filterAnalytics.processingTimeMs}ms
                      </span>
                      <span className="text-[8px] font-mono text-cyan-400/50">
                        engine: {filterAnalytics.engineUsed}
                      </span>
                    </>
                  )}
                </div>
                {filterActive && (
                  <button
                    type="button"
                    onClick={clearFilter}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono text-red-400/60 hover:text-red-300 hover:bg-red-500/10 transition-all"
                  >
                    <X className="h-2.5 w-2.5" />
                    CLEAR FILTER
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
