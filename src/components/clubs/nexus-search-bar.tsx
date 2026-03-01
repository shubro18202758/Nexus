"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, X, Loader2, Brain, Zap, Target,
  GitCompare, Compass, BarChart3, ChevronRight, Star,
  TrendingUp, Award, MessageSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgenticResult {
  answer: string;
  intent: string;
  subQueries: string[];
  confidence: number;
  suggestedFollowups: string[];
  comparisonData?: {
    clubs: Array<{
      name: string;
      iitId: string;
      category: string;
      strengths: string[];
      weaknesses: string[];
      rating: number;
    }>;
    verdict: string;
    dimensions: string[];
  };
  recommendations?: Array<{
    clubName: string;
    iitId: string;
    matchScore: number;
    reason: string;
    highlights: string[];
  }>;
}

const INTENT_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string; bg: string }> = {
  search: { icon: Search, color: "text-violet-400", label: "SEARCH", bg: "bg-violet-500/15 border-violet-500/25" },
  compare: { icon: GitCompare, color: "text-cyan-400", label: "COMPARE", bg: "bg-cyan-500/15 border-cyan-500/25" },
  recommend: { icon: Target, color: "text-emerald-400", label: "RECOMMEND", bg: "bg-emerald-500/15 border-emerald-500/25" },
  explore: { icon: Compass, color: "text-amber-400", label: "EXPLORE", bg: "bg-amber-500/15 border-amber-500/25" },
  stats: { icon: BarChart3, color: "text-blue-400", label: "STATS", bg: "bg-blue-500/15 border-blue-500/25" },
};

interface NexusSearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching: boolean;
  hasResults: boolean;
  resultCount: number;
  answer?: string;
  agenticResult?: AgenticResult | null;
}

export function NexusSearchBar({
  onSearch,
  onClear,
  isSearching,
  hasResults,
  resultCount,
  answer,
  agenticResult,
}: NexusSearchBarProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (query.trim().length >= 2) {
        onSearch(query.trim());
      }
    },
    [query, onSearch]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    onClear();
    inputRef.current?.focus();
  }, [onClear]);

  const suggestions = [
    "Compare robotics clubs across IIT Bombay and IIT Delhi",
    "Recommend me clubs for someone interested in AI/ML",
    "Which IIT has the best coding culture?",
    "Clubs recruiting new members right now",
    "Show stats on technical vs cultural clubs",
    "Explore all entrepreneurship cells across IITs",
  ];

  const intentCfg = agenticResult?.intent ? INTENT_CONFIG[agenticResult.intent] ?? INTENT_CONFIG.search : null;
  const IntentIcon = intentCfg?.icon ?? Brain;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="relative group">
        <motion.div
          animate={{
            boxShadow: isFocused
              ? "0 0 40px rgba(139,92,246,0.15), 0 0 80px rgba(6,182,212,0.08)"
              : "0 0 0px transparent",
          }}
          className={cn(
            "relative flex items-center gap-2 rounded-2xl border bg-black/60 backdrop-blur-2xl px-4 py-1 transition-all duration-300",
            isFocused ? "border-violet-500/40" : "border-white/[0.08] hover:border-white/[0.15]"
          )}
        >
          {isSearching ? (
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0" />
          ) : (
            <Brain className="w-5 h-5 text-violet-400/70 shrink-0" />
          )}

          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Ask anything... compare clubs, get recommendations, explore IIT ecosystem"
            className="flex-1 bg-transparent border-0 text-white placeholder:text-white/30 focus-visible:ring-0 text-sm font-mono h-10"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />

          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                type="button"
                onClick={handleClear}
                className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            disabled={isSearching || query.trim().length < 2}
            size="sm"
            className="bg-violet-600/80 hover:bg-violet-500 text-white rounded-xl h-8 px-4 font-mono text-xs tracking-wider shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            ASK
          </Button>
        </motion.div>

        {/* Focused glow shimmer */}
        {isFocused && (
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-violet-500/20 via-cyan-500/20 to-violet-500/20 -z-10 blur-sm animate-pulse" />
        )}
      </form>

      {/* AI Agentic Answer — Full Panel */}
      <AnimatePresence>
        {agenticResult && !isSearching && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="space-y-3"
          >
            {/* Main answer card */}
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] backdrop-blur-xl p-5 space-y-3">
              {/* Header with intent badge + confidence */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold tracking-widest", intentCfg?.bg)}>
                  <IntentIcon className={cn("w-3 h-3", intentCfg?.color)} />
                  <span className={intentCfg?.color}>{intentCfg?.label ?? "AI"}</span>
                </div>

                {/* Confidence bar */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[9px] font-mono text-white/30">CONFIDENCE</span>
                  <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(agenticResult.confidence ?? 0) * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full",
                        agenticResult.confidence > 0.7 ? "bg-emerald-400" : agenticResult.confidence > 0.4 ? "bg-amber-400" : "bg-red-400"
                      )}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-white/40">
                    {Math.round((agenticResult.confidence ?? 0) * 100)}%
                  </span>
                </div>

                <span className="text-[10px] text-white/25 font-mono">
                  {resultCount} clubs
                </span>
              </div>

              {/* Answer text */}
              <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line">
                {agenticResult.answer}
              </div>

              {/* Sub-queries (if decomposed) */}
              {agenticResult.subQueries && agenticResult.subQueries.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[9px] font-mono text-white/25 self-center">SUB-QUERIES:</span>
                  {agenticResult.subQueries.map((q, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-white/[0.04] text-white/35 border border-white/[0.06]">
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Comparison Data */}
            {agenticResult.comparisonData && agenticResult.comparisonData.clubs?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] backdrop-blur-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase font-bold">
                    Comparison Analysis
                  </span>
                </div>

                {/* Comparison grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {agenticResult.comparisonData.clubs.map((club, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-black/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white/80 font-space">{club.name}</span>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400" />
                          <span className="text-xs font-mono font-bold text-amber-400">{club.rating}/10</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-white/30">{club.iitId?.toUpperCase()} // {club.category?.toUpperCase()}</span>
                      {club.strengths?.length > 0 && (
                        <div className="space-y-0.5">
                          {club.strengths.slice(0, 3).map((s, j) => (
                            <div key={j} className="flex items-start gap-1 text-[10px] text-emerald-400/70">
                              <span className="shrink-0 mt-0.5">+</span>
                              <span>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {club.weaknesses?.length > 0 && (
                        <div className="space-y-0.5">
                          {club.weaknesses.slice(0, 2).map((w, j) => (
                            <div key={j} className="flex items-start gap-1 text-[10px] text-red-400/60">
                              <span className="shrink-0 mt-0.5">-</span>
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Verdict */}
                {agenticResult.comparisonData.verdict && (
                  <div className="flex items-start gap-2 pt-2 border-t border-white/[0.04]">
                    <Award className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-white/60 leading-relaxed">{agenticResult.comparisonData.verdict}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Recommendations */}
            {agenticResult.recommendations && agenticResult.recommendations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] backdrop-blur-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-mono text-emerald-400 tracking-widest uppercase font-bold">
                    Personalized Recommendations
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agenticResult.recommendations.map((rec, i) => (
                    <div key={i} className="rounded-lg border border-white/[0.06] bg-black/30 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white/80 font-space truncate">{rec.clubName}</span>
                        <div className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/20">
                          <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                          <span className="text-[10px] font-mono font-bold text-emerald-400">
                            {Math.round(rec.matchScore * 100)}%
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-white/30">{rec.iitId?.toUpperCase()}</span>
                      <p className="text-[10px] text-white/50 leading-relaxed">{rec.reason}</p>
                      {rec.highlights?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rec.highlights.slice(0, 3).map((h, j) => (
                            <span key={j} className="px-1.5 py-0.5 rounded-md text-[8px] font-mono bg-emerald-500/10 text-emerald-400/60 border border-emerald-500/10">
                              {h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Follow-up suggestions */}
            {agenticResult.suggestedFollowups && agenticResult.suggestedFollowups.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <MessageSquare className="w-3.5 h-3.5 text-white/20" />
                <span className="text-[9px] font-mono text-white/25 tracking-wider">FOLLOW UP:</span>
                {agenticResult.suggestedFollowups.map((f, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setQuery(f);
                      onSearch(f);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-mono text-violet-400/70 border border-violet-500/15 bg-violet-500/[0.04] hover:bg-violet-500/[0.08] hover:border-violet-500/30 transition-all flex items-center gap-1"
                  >
                    <ChevronRight className="w-2.5 h-2.5" />
                    {f}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fallback simple answer (when no agentic result) */}
      <AnimatePresence>
        {answer && !agenticResult && !isSearching && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] backdrop-blur-xl p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <span className="text-[10px] font-mono text-violet-400 tracking-widest uppercase font-bold">
                AI Synthesis
              </span>
              <span className="text-[10px] text-white/30 ml-auto">
                {resultCount} clubs matched
              </span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick suggestion pills — only when no results and not focused */}
      {!hasResults && !isSearching && !isFocused && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <motion.button
              key={s}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setQuery(s);
                onSearch(s);
              }}
              className="px-3 py-1.5 rounded-full text-[10px] font-mono text-white/40 border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.07] hover:text-white/60 hover:border-white/[0.12] transition-all"
            >
              {s}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
