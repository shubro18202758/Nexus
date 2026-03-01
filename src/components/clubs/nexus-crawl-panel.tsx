"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { IIT_SEED_REGISTRY } from "@/lib/agent/iit-registry";
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  AlertCircle,
  Radio,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CrawlEvent {
  type: string;
  stage?: string;
  iitId?: string;
  message?: string;
  clubName?: string;
  clubId?: string;
  data?: unknown;
}

interface NexusCrawlPanelProps {
  isCrawling: boolean;
  crawlEvents: CrawlEvent[];
  crawlProgress: string;
  onStartCrawl: (config: { iitIds: string[]; maxClubsPerIIT: number; preview: boolean }) => void;
}

export function NexusCrawlPanel({
  isCrawling,
  crawlEvents,
  crawlProgress,
  onStartCrawl,
}: NexusCrawlPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIITs, setSelectedIITs] = useState<string[]>(
    IIT_SEED_REGISTRY.map((i) => i.id)
  );
  const [maxClubs, setMaxClubs] = useState(10);
  const [preview, setPreview] = useState(false);

  const toggleIIT = (id: string) => {
    setSelectedIITs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleStart = () => {
    if (selectedIITs.length === 0) return;
    onStartCrawl({ iitIds: selectedIITs, maxClubsPerIIT: maxClubs, preview });
  };

  const successCount = crawlEvents.filter((e) => e.type === "persisted").length;
  const errorCount = crawlEvents.filter((e) => e.type === "error").length;

  return (
    <motion.div
      layout
      className="rounded-2xl border border-white/[0.06] bg-black/50 backdrop-blur-xl overflow-hidden"
    >
      {/* Collapsed Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isCrawling ? "bg-violet-500/20 animate-pulse" : "bg-white/[0.06]"
          )}>
            {isCrawling ? (
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-violet-400/60" />
            )}
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-white/90 font-space">
              Nexus Crawler
            </h3>
            <p className="text-[10px] font-mono text-white/40 tracking-wider">
              {isCrawling
                ? crawlProgress
                : `${successCount > 0 ? `${successCount} clubs discovered` : "Discover clubs across IITs"}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCrawling && (
            <Badge variant="outline" className="text-[8px] h-4 border-violet-500/30 text-violet-400">
              <Radio className="w-2.5 h-2.5 mr-0.5 animate-pulse" />
              LIVE
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/30" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
              {/* IIT Selector */}
              <div className="pt-3">
                <label className="text-[10px] font-mono text-white/40 tracking-widest uppercase mb-2 block">
                  Select IITs to Crawl
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {IIT_SEED_REGISTRY.map((iit) => (
                    <motion.button
                      key={iit.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleIIT(iit.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all",
                        selectedIITs.includes(iit.id)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.15)]"
                          : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:text-white/60 hover:border-white/[0.12]"
                      )}
                    >
                      {iit.id.toUpperCase()}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Config */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-3.5 h-3.5 text-white/30" />
                  <label className="text-[10px] font-mono text-white/40">Max per IIT:</label>
                  <select
                    value={maxClubs}
                    onChange={(e) => setMaxClubs(Number(e.target.value))}
                    className="bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white/70 px-2 py-1 outline-none"
                  >
                    {[5, 10, 15, 20, 30].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preview}
                    onChange={(e) => setPreview(e.target.checked)}
                    className="accent-violet-500 w-3 h-3"
                  />
                  <span className="text-[10px] font-mono text-white/40">Preview only</span>
                </label>
              </div>

              {/* Launch Button */}
              <Button
                onClick={handleStart}
                disabled={isCrawling || selectedIITs.length === 0}
                className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white rounded-xl h-10 font-mono text-xs tracking-wider shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all hover:shadow-[0_0_50px_rgba(139,92,246,0.5)]"
              >
                {isCrawling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    CRAWLING...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    LAUNCH NEXUS CRAWLER
                  </>
                )}
              </Button>

              {/* Live Feed */}
              {crawlEvents.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-white/40 tracking-widest uppercase">
                      Live Feed
                    </span>
                    <div className="flex gap-2">
                      {successCount > 0 && (
                        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {successCount}
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="text-[10px] font-mono text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {errorCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <ScrollArea className="h-40 rounded-lg bg-black/30 border border-white/[0.04] p-2">
                    <div className="space-y-1">
                      {crawlEvents.slice(-50).map((event, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "text-[10px] font-mono py-0.5 px-1 rounded flex items-center gap-1",
                            event.type === "persisted" && "text-emerald-400/80",
                            event.type === "error" && "text-red-400/80",
                            event.type === "fatal_error" && "text-red-500 font-bold",
                            event.type === "complete" && "text-cyan-400 font-bold",
                            !["persisted", "error", "fatal_error", "complete"].includes(event.type)
                              && "text-white/40"
                          )}
                        >
                          {event.type === "persisted" && <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />}
                          {event.type === "error" && <AlertCircle className="w-2.5 h-2.5 shrink-0" />}
                          <span className="truncate">{event.message || JSON.stringify(event).slice(0, 80)}</span>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
