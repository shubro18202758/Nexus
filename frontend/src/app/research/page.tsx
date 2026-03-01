"use client";

import { useState, useEffect, useCallback } from "react";
import { ResearchPanel } from "@/components/research/research-panel";
import { useDb } from "@/components/providers/db-provider";
import { knowledgeItems, knowledgeChunks } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Search,
    Database,
    FileText,
    Layers,
    Clock,
    Trash2,
    BookOpen,
    Sparkles,
    AlertCircle,
    Brain,
    ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { ResearchBrief, CitationDetail } from "@/types/research";

// ============================================================
// Research History — localStorage-backed
// ============================================================
const RESEARCH_HISTORY_KEY = "slingshot-research-history";

interface ResearchHistoryEntry {
    id: string;
    query: string;
    title: string;
    summary: string;
    findingsCount: number;
    sourcesCount: number;
    confidence: number;
    timestamp: number;
}

function getResearchHistory(): ResearchHistoryEntry[] {
    try {
        const raw = localStorage.getItem(RESEARCH_HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as ResearchHistoryEntry[];
    } catch {
        return [];
    }
}

function saveResearchHistory(entries: ResearchHistoryEntry[]) {
    try {
        localStorage.setItem(RESEARCH_HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
    } catch { /* quota */ }
}

/**
 * /research — Research Copilot Page.
 * Full-width layout with knowledge base stats, research history,
 * and the Research Panel for running AI-powered deep research.
 */
export default function ResearchPage() {
    const { db, workspaceId } = useDb();

    // Knowledge base stats
    const [docCount, setDocCount] = useState<number>(0);
    const [chunkCount, setChunkCount] = useState<number>(0);
    const [statsLoaded, setStatsLoaded] = useState(false);

    // Research history
    const [history, setHistory] = useState<ResearchHistoryEntry[]>([]);

    // Panel visibility on mobile
    const [showPanel, setShowPanel] = useState(true);

    // Load knowledge base stats
    useEffect(() => {
        if (!db) return;
        (async () => {
            try {
                const [docs] = await db.select({ value: count() }).from(knowledgeItems).where(eq(knowledgeItems.workspaceId, workspaceId));
                // Join through knowledgeItems to count only chunks belonging to this workspace
                const [chunks] = await db
                    .select({ value: count() })
                    .from(knowledgeChunks)
                    .innerJoin(knowledgeItems, eq(knowledgeChunks.knowledgeItemId, knowledgeItems.id))
                    .where(eq(knowledgeItems.workspaceId, workspaceId));
                setDocCount(docs?.value ?? 0);
                setChunkCount(chunks?.value ?? 0);
            } catch (e) {
                console.error("Failed to load KB stats:", e);
            } finally {
                setStatsLoaded(true);
            }
        })();
    }, [db, workspaceId]);

    // Load research history
    useEffect(() => {
        setHistory(getResearchHistory());
    }, []);

    // Listen for new research completions (custom event from ResearchPanel)
    const handleResearchComplete = useCallback((brief: ResearchBrief, query: string) => {
        const entry: ResearchHistoryEntry = {
            id: crypto.randomUUID(),
            query,
            title: brief.title,
            summary: brief.summary.substring(0, 200),
            findingsCount: brief.key_findings.length,
            sourcesCount: brief.annotated_bibliography.length,
            confidence: brief.confidence_score,
            timestamp: Date.now(),
        };
        setHistory((prev) => {
            const next = [entry, ...prev].slice(0, 50);
            saveResearchHistory(next);
            return next;
        });
    }, []);

    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem(RESEARCH_HISTORY_KEY);
    };

    const confidenceColor = (score: number) => {
        if (score >= 0.7) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        if (score >= 0.4) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
        return "text-red-400 border-red-500/30 bg-red-500/10";
    };

    const timeAgo = (ts: number) => {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    return (
        <div className="flex h-full">
            {/* ===== Left: Main Content Area ===== */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-3 rounded-xl border border-cyan-500/10 shadow-[0_0_15px_rgba(34,211,238,0.15)]">
                        <Search className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight font-[family-name:var(--font-space)] bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                            Research Copilot
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            AI-powered deep research with citations over your knowledge base.
                        </p>
                    </div>
                </div>

                {/* Knowledge Base Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <Card className="bg-black/40 backdrop-blur-md border-cyan-500/15 hover:border-cyan-500/30 transition-all duration-300 shadow-[0_0_10px_rgba(34,211,238,0.05)]">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/15">
                                <FileText className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground font-mono">
                                    {statsLoaded ? docCount : "—"}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-[family-name:var(--font-space)]">
                                    Documents
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-black/40 backdrop-blur-md border-violet-500/15 hover:border-violet-500/30 transition-all duration-300 shadow-[0_0_10px_rgba(139,92,246,0.05)]">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/15">
                                <Layers className="h-4 w-4 text-violet-400 drop-shadow-[0_0_4px_rgba(139,92,246,0.5)]" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground font-mono">
                                    {statsLoaded ? chunkCount : "—"}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-[family-name:var(--font-space)]">
                                    Vector Chunks
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-black/40 backdrop-blur-md border-amber-500/15 hover:border-amber-500/30 transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.05)]">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
                                <Brain className="h-4 w-4 text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-foreground">
                                    {history.length}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                    Researches
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Empty state — guide user when no docs exist */}
                {statsLoaded && docCount === 0 && (
                    <Card className="bg-amber-500/5 border-amber-500/20">
                        <CardContent className="p-5 flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-amber-300">No documents indexed yet</p>
                                <p className="text-xs text-muted-foreground">
                                    The Research Copilot searches your personal knowledge base. Upload documents in the{" "}
                                    <a href="/knowledge" className="text-cyan-400 hover:underline">Knowledge</a> section first,
                                    then come back here to research across them.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* How It Works */}
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2 font-[family-name:var(--font-space)]">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]" />
                        How It Works
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            { step: "1", title: "Topic Decomposition", desc: "Breaks your query into focused sub-questions for deeper coverage", icon: Search },
                            { step: "2", title: "Query Expansion", desc: "Generates synonyms and related terms to maximize retrieval recall", icon: Layers },
                            { step: "3", title: "Vector Search + Rerank", desc: "Searches your knowledge base with embeddings, then cross-encoder reranks", icon: Database },
                            { step: "4", title: "Research Brief", desc: "Compiles findings with inline citations, confidence scores, and tasks", icon: BookOpen },
                        ].map((item) => (
                            <div
                                key={item.step}
                                className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/10"
                            >
                                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-cyan-500/15 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 shrink-0">
                                    {item.step}
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-foreground/90">{item.title}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <Separator className="bg-white/5" />

                {/* Research History */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2 font-[family-name:var(--font-space)]">
                            <Clock className="h-3.5 w-3.5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]" />
                            Research History
                        </h2>
                        {history.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[10px] text-muted-foreground hover:text-red-400 gap-1"
                                onClick={clearHistory}
                            >
                                <Trash2 className="h-3 w-3" />
                                Clear
                            </Button>
                        )}
                    </div>

                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="p-4 rounded-full bg-white/5 border border-white/10 mb-4">
                                <Search className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                            <p className="text-sm text-muted-foreground/60">No research sessions yet</p>
                            <p className="text-xs text-muted-foreground/40 mt-1">
                                Use the Research Panel on the right to start your first query
                            </p>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/20 mt-3 animate-pulse" />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <AnimatePresence>
                                {history.map((entry) => (
                                    <motion.div
                                        key={entry.id}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        className="p-3 rounded-lg bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground/90 truncate">
                                                    {entry.title}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">
                                                    {entry.summary}
                                                </p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge variant="outline" className="text-[10px] border-white/10">
                                                        {entry.findingsCount} findings
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] border-white/10">
                                                        {entry.sourcesCount} sources
                                                    </Badge>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn("text-[10px]", confidenceColor(entry.confidence))}
                                                    >
                                                        {(entry.confidence * 100).toFixed(0)}%
                                                    </Badge>
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground/40 shrink-0">
                                                {timeAgo(entry.timestamp)}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== Right: Research Panel ===== */}
            <aside className="w-[520px] max-w-full border-l border-white/10 bg-background/95 backdrop-blur-md flex flex-col h-screen sticky top-0">
                <ResearchPanel onResearchComplete={handleResearchComplete} />
            </aside>
        </div>
    );
}
