"use client";

import { motion } from "framer-motion";
import { Radio, Radar, Brain, Sparkles, Target, Zap } from "lucide-react";
import { useDigest, type FeedItem, type FeedTab } from "@/hooks/use-digest";
import { FeedCard } from "./feed-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function FeedGrid() {
    const {
        feedItems, isLoading, layout, activeTab, showVideos,
        filterActive, filterResults, isFiltering, filterAnalytics,
    } = useDigest();

    // Build a confidence lookup for filter-active mode
    const confidenceMap = new Map<string, { confidence: number; reasons: string[]; semanticScore: number }>();
    if (filterActive && filterResults.length > 0) {
        for (const r of filterResults) {
            confidenceMap.set(r.item.id, {
                confidence: r.confidence,
                reasons: r.matchReasons,
                semanticScore: r.semanticScore,
            });
        }
    }

    // Determine which items to display
    const displayItems: FeedItem[] = filterActive && filterResults.length > 0
        ? filterResults.map((r) => {
            // Find the matching FeedItem from feedItems
            const original = feedItems.find((fi) => fi.id === r.item.id);
            return original || {
                id: r.item.id,
                title: r.item.title,
                summary: r.item.summary,
                aiSummary: "",
                url: "",
                source: r.item.source,
                imageUrl: undefined,
                videoUrl: undefined,
                publishedAt: r.item.publishedAt,
                domain: r.item.domain,
                domainColor: "#f59e0b",
                relevanceScore: r.semanticScore,
                sentiment: r.item.sentiment,
                tags: r.item.tags,
                type: r.item.type,
            };
        })
        : getFilteredItems(feedItems, activeTab, showVideos);

    // Loading state (also applies when filter is running)
    if (isLoading || isFiltering) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    {isFiltering ? (
                        <>
                            <Brain className="h-4 w-4 text-amber-400 animate-spin" />
                            <span className="text-xs font-mono text-amber-300/60 tracking-wider">AI FILTER PROCESSING...</span>
                        </>
                    ) : (
                        <>
                            <Radar className="h-4 w-4 text-amber-400 animate-spin" />
                            <span className="text-xs font-mono text-amber-300/60 tracking-wider">SCANNING INTEL FEEDS...</span>
                        </>
                    )}
                </div>
                <div className={cn(
                    layout === "list" ? "space-y-3" : "grid gap-4",
                    layout === "grid" && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
                    layout === "magazine" && "grid-cols-1 md:grid-cols-2"
                )}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-black/40 border border-white/[0.06] rounded-2xl p-4 space-y-3">
                            <Skeleton className="h-32 w-full rounded-xl bg-white/5" />
                            <Skeleton className="h-4 w-3/4 rounded bg-white/5" />
                            <Skeleton className="h-3 w-full rounded bg-white/5" />
                            <Skeleton className="h-3 w-2/3 rounded bg-white/5" />
                            <div className="flex gap-2">
                                <Skeleton className="h-5 w-16 rounded-full bg-white/5" />
                                <Skeleton className="h-5 w-12 rounded-full bg-white/5" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Empty state
    if (displayItems.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-3xl bg-black/20"
            >
                <div className="relative">
                    {filterActive ? (
                        <Target className="h-12 w-12 text-amber-500/30" />
                    ) : (
                        <>
                            <Radio className="h-12 w-12 text-amber-500/30 animate-pulse" />
                            <div className="absolute inset-0 animate-ping">
                                <Radio className="h-12 w-12 text-amber-500/10" />
                            </div>
                        </>
                    )}
                </div>
                <p className="text-muted-foreground font-mono text-xs mt-4 tracking-wider">
                    {filterActive
                        ? "No items matched your filter — try adjusting the query or lowering confidence"
                        : activeTab === "videos"
                            ? "No video feeds detected"
                            : "No signals found — try adding more domains"}
                </p>
                <p className="text-white/20 font-mono text-[10px] mt-1">
                    {filterActive
                        ? "Expand date range or add more content types"
                        : "Select domains above to start receiving intel"}
                </p>
            </motion.div>
        );
    }

    return (
        <div>
            {/* Filter active header */}
            {filterActive && filterAnalytics && (
                <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/15"
                >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-[10px] font-mono font-bold text-amber-300 tracking-wider">
                        AI FILTER ACTIVE
                    </span>
                    <span className="text-[9px] font-mono text-white/30">—</span>
                    <span className="text-[10px] font-mono text-amber-400/70">
                        {filterAnalytics.totalOutput} of {filterAnalytics.totalInput} matched
                    </span>
                    <span className="text-[9px] font-mono text-white/20 ml-auto">
                        avg confidence: {Math.round(filterAnalytics.avgConfidence * 100)}%
                    </span>
                </motion.div>
            )}

            <div className={cn(
                layout === "list" ? "space-y-2" : "grid gap-4",
                layout === "grid" && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
                layout === "magazine" && "grid-cols-1 md:grid-cols-2"
            )}>
                {displayItems.map((item, i) => {
                    const filterInfo = confidenceMap.get(item.id);
                    return (
                        <div key={item.id} className="relative">
                            <FeedCard
                                item={item}
                                index={i}
                                variant={layout === "list" ? "compact" : "default"}
                            />
                            {/* Confidence overlay for filtered items */}
                            {filterInfo && (
                                <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/80 border border-amber-500/30 backdrop-blur-md z-10">
                                    <Zap className="h-2.5 w-2.5 text-amber-400" />
                                    <span className={cn(
                                        "text-[10px] font-mono font-bold",
                                        filterInfo.confidence > 0.7 ? "text-emerald-400"
                                            : filterInfo.confidence > 0.4 ? "text-amber-400"
                                                : "text-red-400"
                                    )}>
                                        {Math.round(filterInfo.confidence * 100)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getFilteredItems(items: FeedItem[], tab: FeedTab, showVideos: boolean): FeedItem[] {
    let filtered = [...items];

    switch (tab) {
        case "foryou":
            // Already sorted by relevance
            break;
        case "latest":
            filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
            break;
        case "trending":
            filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
            break;
        case "videos":
            filtered = filtered.filter((item) => item.type === "video" || item.videoUrl);
            break;
    }

    if (!showVideos && tab !== "videos") {
        filtered = filtered.filter((item) => item.type !== "video");
    }

    return filtered;
}
