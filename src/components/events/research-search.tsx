"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Search,
    Sparkles,
    Send,
    Loader2,
    MessageSquare,
    ArrowRight,
    CheckCircle2,
    RefreshCw,
    X,
    RotateCcw,
    Clock,
    Zap,
    Brain,
    Globe2,
    BarChart3,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

interface ClarifyQuestion {
    question: string;
    options: string[];
}

interface AISearchBarProps {
    onSearch: (query: string) => void;
    onRefine: (query: string) => void;
    onClear?: () => void;
    isSearching: boolean;
    hasResults: boolean;
    resultCount?: number;
    phaseMessage?: string;
    phaseDetail?: string;
    phaseProgress?: number;
}

interface ClarifyDialogProps {
    questions: ClarifyQuestion[];
    onSubmit: (answers: Record<string, string>) => void;
    onSkip: () => void;
    isOpen: boolean;
}

interface ResearchEmptyStateProps {
    onSuggestionClick?: (query: string) => void;
}

interface ResearchSkeletonProps {
    phaseMessage?: string;
    phaseDetail?: string;
    phaseProgress?: number;
}

// ─── Search History ──────────────────────────────────────────────

const MAX_HISTORY = 8;

function getSearchHistory(): string[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem("nexus-research-history") || "[]").slice(0, MAX_HISTORY);
    } catch {
        return [];
    }
}

function addToHistory(query: string) {
    if (typeof window === "undefined") return;
    try {
        const history = getSearchHistory().filter(h => h !== query);
        history.unshift(query);
        localStorage.setItem("nexus-research-history", JSON.stringify(history.slice(0, MAX_HISTORY)));
    } catch { /* ignore */ }
}

// ─── Phase Icons ─────────────────────────────────────────────────

const PHASE_ICONS: Record<string, typeof Brain> = {
    planning: Brain,
    searching: Globe2,
    extracting: Zap,
    ranking: BarChart3,
    complete: CheckCircle2,
    error: X,
};

// ─── AI Search Bar ───────────────────────────────────────────────

export function AISearchBar({
    onSearch,
    onRefine,
    onClear,
    isSearching,
    hasResults,
    resultCount,
    phaseMessage,
    phaseDetail,
    phaseProgress,
}: AISearchBarProps) {
    const [query, setQuery] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const historyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setHistory(getSearchHistory());
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
                setShowHistory(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed || isSearching) return;

        addToHistory(trimmed);
        setHistory(getSearchHistory());
        setShowHistory(false);

        if (hasResults) {
            onRefine(trimmed);
        } else {
            onSearch(trimmed);
        }
    };

    const handleHistoryClick = (item: string) => {
        setQuery(item);
        setShowHistory(false);
        onSearch(item);
        addToHistory(item);
        setHistory(getSearchHistory());
    };

    const handleNewSearch = () => {
        setQuery("");
        onClear?.();
        inputRef.current?.focus();
    };

    return (
        <div className="space-y-3">
            <form onSubmit={handleSubmit} className="relative group">
                {/* Ambient border glow */}
                <div className={cn(
                    "absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 blur-[2px]",
                    isSearching
                        ? "opacity-100 bg-gradient-to-r from-violet-500/50 via-fuchsia-500/40 to-cyan-500/50"
                        : "group-focus-within:opacity-70 bg-gradient-to-r from-violet-500/40 via-fuchsia-500/25 to-cyan-500/40",
                )} />

                <div
                    className={cn(
                        "relative flex items-center gap-3.5 rounded-2xl border-2 px-5 py-3.5 transition-all duration-300 bg-black/60 backdrop-blur-xl",
                        isSearching
                            ? "border-violet-500/50 shadow-[0_0_40px_rgba(139,92,246,0.2),0_0_80px_rgba(139,92,246,0.08)]"
                            : "border-white/15 hover:border-white/25 focus-within:border-violet-500/40 focus-within:shadow-[0_0_30px_rgba(139,92,246,0.15)]",
                    )}
                >
                    {/* Icon with glow */}
                    {isSearching ? (
                        <div className="relative shrink-0">
                            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                            <div className="absolute inset-0 blur-md bg-violet-400/30 rounded-full" />
                        </div>
                    ) : (
                        <Search className="w-5 h-5 text-white/50 group-focus-within:text-violet-400 transition-colors shrink-0" />
                    )}

                    {/* Input */}
                    <Input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => !hasResults && history.length > 0 && setShowHistory(true)}
                        placeholder={
                            hasResults
                                ? "Refine results: e.g. 'only virtual events with prizes > $5000'"
                                : "Search: e.g. 'AI hackathons in India this month with cash prizes'"
                        }
                        disabled={isSearching}
                        className="flex-1 border-0 bg-transparent p-0 text-[15px] text-white placeholder:text-white/45 focus-visible:ring-0 focus-visible:ring-offset-0 font-mono"
                    />

                    {/* Clear input */}
                    {query && !isSearching && (
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            title="Clear input"
                            className="text-white/40 hover:text-white/70 transition-colors p-1 rounded-lg hover:bg-white/10"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}

                    {/* New Search */}
                    {hasResults && !isSearching && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={handleNewSearch}
                            className="h-8 px-3 text-[11px] text-white/55 hover:text-white/90 hover:bg-white/10 font-mono shrink-0 rounded-lg font-semibold"
                        >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            New
                        </Button>
                    )}

                    {/* Submit */}
                    <Button
                        type="submit"
                        size="sm"
                        disabled={!query.trim() || isSearching}
                        className={cn(
                            "h-9 px-5 rounded-xl text-xs font-bold font-mono shrink-0 transition-all duration-300",
                            hasResults
                                ? "bg-gradient-to-r from-cyan-600/40 to-teal-600/40 text-cyan-200 hover:from-cyan-600/60 hover:to-teal-600/60 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                                : "bg-gradient-to-r from-violet-600/40 to-fuchsia-600/40 text-violet-200 hover:from-violet-600/60 hover:to-fuchsia-600/60 border border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.2)]",
                        )}
                    >
                        {isSearching ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : hasResults ? (
                            <>
                                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                Refine
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                                Research
                            </>
                        )}
                    </Button>
                </div>

                {/* Search history dropdown */}
                <AnimatePresence>
                    {showHistory && history.length > 0 && !isSearching && (
                        <motion.div
                            ref={historyRef}
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border-2 border-white/10 bg-black/95 backdrop-blur-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
                        >
                            <div className="py-1.5">
                                <div className="px-4 py-2 text-[10px] font-mono text-white/55 uppercase tracking-[0.15em] flex items-center gap-2 border-b border-white/8 mb-1">
                                    <Clock className="w-3.5 h-3.5 text-violet-400/80" />
                                    Recent Searches
                                </div>
                                {history.map((item, i) => (
                                    <button
                                        key={`${item}-${i}`}
                                        type="button"
                                        className="w-full px-4 py-2.5 text-left text-sm font-mono text-white/70 hover:text-white hover:bg-violet-500/10 transition-all flex items-center gap-2.5"
                                        onClick={() => handleHistoryClick(item)}
                                    >
                                        <Search className="w-3 h-3 text-white/30 shrink-0" />
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Glow effect while searching */}
                {isSearching && (
                    <motion.div
                        className="absolute inset-0 -z-10 rounded-2xl"
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2 }}
                        style={{
                            background: "radial-gradient(ellipse at center, rgba(139,92,246,0.2) 0%, transparent 70%)",
                        }}
                    />
                )}
            </form>

            {/* Phase progress */}
            <AnimatePresence mode="wait">
                {isSearching && phaseMessage && (
                    <motion.div
                        key="phase-progress"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="space-y-2 px-1"
                    >
                        <div className="flex items-center gap-2.5">
                            {(() => {
                                const phase = phaseMessage.toLowerCase().includes("plan") ? "planning"
                                    : phaseMessage.toLowerCase().includes("search") ? "searching"
                                    : phaseMessage.toLowerCase().includes("extract") || phaseMessage.toLowerCase().includes("agent") ? "extracting"
                                    : phaseMessage.toLowerCase().includes("rank") || phaseMessage.toLowerCase().includes("dedup") ? "ranking"
                                    : "searching";
                                const PhaseIcon = PHASE_ICONS[phase] || Brain;
                                return (
                                    <div className="relative">
                                        <PhaseIcon className="w-4 h-4 text-violet-400" />
                                        <div className="absolute inset-0 blur-sm bg-violet-400/40 rounded-full" />
                                    </div>
                                );
                            })()}
                            <span className="text-xs font-mono text-white/75 font-medium">
                                {phaseMessage}
                            </span>
                        </div>
                        {phaseDetail && (
                            <p className="text-[11px] font-mono text-white/50 pl-7">
                                {phaseDetail}
                            </p>
                        )}
                        {phaseProgress !== undefined && phaseProgress > 0 && (
                            <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                                <motion.div
                                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 shadow-[0_0_10px_rgba(139,92,246,0.4)]"
                                    initial={{ width: "0%" }}
                                    animate={{ width: `${Math.min(phaseProgress, 100)}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                />
                            </div>
                        )}
                    </motion.div>
                )}

                {isSearching && !phaseMessage && (
                    <motion.div
                        key="default-progress"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="flex items-center gap-3 px-1"
                    >
                        <div className="flex gap-1.5">
                            {[0, 1, 2, 3, 4].map(i => (
                                <motion.div
                                    key={i}
                                    className="w-2 h-2 rounded-full bg-violet-400"
                                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                                    transition={{
                                        repeat: Number.POSITIVE_INFINITY,
                                        duration: 1.5,
                                        delay: i * 0.2,
                                    }}
                                />
                            ))}
                        </div>
                        <span className="text-xs font-mono text-white/60 font-medium">
                            5 AI agents researching the web...
                        </span>
                    </motion.div>
                )}

                {hasResults && !isSearching && resultCount !== undefined && (
                    <motion.div
                        key="result-count"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2.5 px-1"
                    >
                        <div className="relative">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <div className="absolute inset-0 blur-sm bg-emerald-400/30 rounded-full" />
                        </div>
                        <span className="text-xs font-mono text-white/60">
                            Found <span className="text-emerald-400 font-bold">{resultCount}</span> events — type above to refine results
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Clarifying Questions Dialog ─────────────────────────────────

export function ClarifyDialog({
    questions,
    onSubmit,
    onSkip,
    isOpen,
}: ClarifyDialogProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [currentQ, setCurrentQ] = useState(0);

    const handleSelect = useCallback(
        (questionIdx: number, option: string) => {
            const updated = { ...answers, [`q${questionIdx}`]: option };
            setAnswers(updated);

            if (questionIdx < questions.length - 1) {
                setTimeout(() => setCurrentQ(questionIdx + 1), 300);
            }
        },
        [answers, questions.length],
    );

    const allAnswered = Object.keys(answers).length >= questions.length;

    if (!isOpen || questions.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="rounded-2xl border-2 border-violet-500/25 bg-black/60 backdrop-blur-2xl p-6 space-y-5 shadow-[0_10px_60px_rgba(139,92,246,0.1)]"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <MessageSquare className="w-5 h-5 text-violet-400" />
                        <div className="absolute inset-0 blur-sm bg-violet-400/30 rounded-full" />
                    </div>
                    <span className="text-sm font-mono text-white/80 uppercase tracking-[0.12em] font-semibold">
                        Help me refine your search
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSkip}
                    className="h-7 text-[11px] text-white/55 hover:text-white/80 hover:bg-white/10 rounded-lg"
                >
                    Skip <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
            </div>

            {/* Progress */}
            <div className="flex gap-2">
                {questions.map((_, i) => (
                    <div
                        key={i}
                        className={cn(
                            "h-1.5 rounded-full flex-1 transition-all duration-500",
                            answers[`q${i}`]
                                ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_6px_rgba(139,92,246,0.4)]"
                                : i === currentQ
                                  ? "bg-violet-500/40"
                                  : "bg-white/12",
                        )}
                    />
                ))}
            </div>

            {/* Questions */}
            <div className="space-y-5">
                {questions.map((q, qi) => (
                    <AnimatePresence key={qi}>
                        {qi <= currentQ && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: qi === currentQ ? 0.15 : 0 }}
                                className="space-y-3"
                            >
                                <p className="text-sm text-white/90 font-mono">
                                    <span className="text-violet-400 font-bold mr-2">Q{qi + 1}.</span>
                                    {q.question}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {q.options.map((opt) => {
                                        const selected = answers[`q${qi}`] === opt;
                                        return (
                                            <button
                                                key={opt}
                                                onClick={() => handleSelect(qi, opt)}
                                                className={cn(
                                                    "text-xs px-4 py-2 rounded-xl border-2 font-mono transition-all duration-200",
                                                    selected
                                                        ? "bg-violet-500/25 text-violet-200 border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                                                        : "bg-white/5 text-white/60 border-white/12 hover:bg-white/10 hover:text-white/80 hover:border-white/20",
                                                )}
                                            >
                                                {opt}
                                                {selected && (
                                                    <CheckCircle2 className="w-3.5 h-3.5 ml-2 inline text-violet-400" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                ))}
            </div>

            {/* Submit */}
            <AnimatePresence>
                {allAnswered && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <Button
                            onClick={() => onSubmit(answers)}
                            className="w-full h-11 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-bold font-mono rounded-xl shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.4)] transition-all duration-300"
                        >
                            <Send className="w-4 h-4 mr-2" />
                            Search with these preferences
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── Research Loading Skeleton ────────────────────────────────────

export function ResearchSkeleton({ phaseMessage, phaseDetail, phaseProgress }: ResearchSkeletonProps) {
    return (
        <div className="space-y-5">
            {phaseMessage && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center gap-3 py-4"
                >
                    <div className="flex gap-1.5">
                        {[0, 1, 2].map(i => (
                            <motion.div
                                key={i}
                                className="w-2.5 h-2.5 rounded-full bg-violet-400"
                                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                                transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.2, delay: i * 0.3 }}
                            />
                        ))}
                    </div>
                    <span className="text-sm font-mono text-violet-300 font-medium">{phaseMessage}</span>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="rounded-2xl border-2 border-white/8 bg-white/[0.03] p-6 space-y-4 backdrop-blur-md"
                    >
                        <div className="flex justify-between">
                            <Skeleton className="h-5 w-24 bg-white/8 rounded-lg" />
                            <Skeleton className="h-5 w-20 bg-white/8 rounded-lg" />
                        </div>
                        <Skeleton className="h-7 w-3/4 bg-white/8 rounded-lg" />
                        <Skeleton className="h-4 w-full bg-white/6 rounded" />
                        <Skeleton className="h-4 w-2/3 bg-white/6 rounded" />
                        <div className="flex gap-2">
                            <Skeleton className="h-6 w-20 bg-white/6 rounded-full" />
                            <Skeleton className="h-6 w-16 bg-white/6 rounded-full" />
                            <Skeleton className="h-6 w-24 bg-white/6 rounded-full" />
                        </div>
                        <div className="flex justify-between pt-3 border-t border-white/8">
                            <Skeleton className="h-4 w-28 bg-white/6 rounded" />
                            <Skeleton className="h-9 w-28 bg-white/6 rounded-xl" />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

// ─── Results Header ───────────────────────────────────────────────

interface ResultsHeaderProps {
    count: number;
    sortBy: "relevance" | "date" | "confidence";
    onSortChange: (sort: "relevance" | "date" | "confidence") => void;
    onClear: () => void;
    durationMs?: number;
}

export function ResultsHeader({ count, sortBy, onSortChange, onClear, durationMs }: ResultsHeaderProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between px-1 py-3"
        >
            <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-white/80">
                    <span className="text-emerald-400 font-extrabold text-base">{count}</span> events found
                </span>
                {durationMs && (
                    <span className="text-[11px] font-mono text-white/45 bg-white/5 px-2 py-0.5 rounded-md">
                        {(durationMs / 1000).toFixed(1)}s
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-black/50 rounded-xl border-2 border-white/8 p-1">
                    {(["relevance", "date", "confidence"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => onSortChange(s)}
                            className={cn(
                                "text-[11px] px-3 py-1.5 rounded-lg font-mono font-medium transition-all duration-200 capitalize",
                                sortBy === s
                                    ? "bg-violet-500/25 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                                    : "text-white/50 hover:text-white/75 hover:bg-white/5",
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="h-8 px-3 text-[11px] text-white/40 hover:text-red-400 hover:bg-red-500/10 font-mono rounded-lg"
                >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Clear
                </Button>
            </div>
        </motion.div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────

export function ResearchEmptyState({ onSuggestionClick }: ResearchEmptyStateProps) {
    const suggestions = [
        "AI hackathons this month",
        "coding contests India 2026",
        "startup pitch events",
        "web3 workshops online",
        "ML competitions with prizes",
        "open source hackathons",
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 space-y-8 relative"
        >
            {/* Background mesh gradient */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-violet-500/[0.04] rounded-full blur-[100px]" />
                <div className="absolute top-1/3 left-1/3 w-[200px] h-[200px] bg-cyan-500/[0.03] rounded-full blur-[80px]" />
            </div>

            <div className="relative">
                <motion.div
                    className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500/15 to-cyan-500/15 border-2 border-white/10 flex items-center justify-center backdrop-blur-md"
                    animate={{ rotate: [0, 2, -2, 0] }}
                    transition={{ repeat: Number.POSITIVE_INFINITY, duration: 6, ease: "easeInOut" }}
                >
                    <Search className="w-10 h-10 text-white/25" />
                </motion.div>
                <motion.div
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center border border-violet-500/30"
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 15, 0] }}
                    transition={{ repeat: Number.POSITIVE_INFINITY, duration: 2 }}
                >
                    <Sparkles className="w-4 h-4 text-violet-300" />
                </motion.div>
            </div>
            <div className="text-center space-y-3 max-w-md">
                <h3 className="text-lg font-bold font-mono text-white/85 tracking-tight">
                    Discover public events, hackathons & forms
                </h3>
                <p className="text-sm text-white/55 font-mono leading-relaxed">
                    Use the search bar above to find events across the web.
                    Our 5 AI agents will research platforms like Devpost, Unstop,
                    Eventbrite, Meetup, and more to find relevant events with RSVP forms.
                </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5 max-w-lg">
                {suggestions.map((suggestion) => (
                    <Badge
                        key={suggestion}
                        className={cn(
                            "text-[11px] border-2 font-mono transition-all duration-200 py-1.5 px-3",
                            onSuggestionClick
                                ? "bg-white/5 text-white/65 border-white/12 cursor-pointer hover:bg-violet-500/15 hover:text-violet-200 hover:border-violet-500/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)] hover:scale-105"
                                : "bg-white/5 text-white/45 border-white/8 cursor-default",
                        )}
                        onClick={() => onSuggestionClick?.(suggestion)}
                    >
                        {onSuggestionClick && <Search className="w-3 h-3 mr-1.5 opacity-60" />}
                        {suggestion}
                    </Badge>
                ))}
            </div>
        </motion.div>
    );
}

// ─── Error State ──────────────────────────────────────────────────

interface ResearchErrorStateProps {
    error: string;
    category?: string;
    onRetry?: () => void;
}

export function ResearchErrorState({ error, category, onRetry }: ResearchErrorStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 space-y-5"
        >
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-red-500/15 border-2 border-red-500/25 flex items-center justify-center">
                    <X className="w-7 h-7 text-red-400" />
                </div>
                <div className="absolute inset-0 blur-xl bg-red-500/10 rounded-2xl" />
            </div>
            <div className="text-center space-y-2.5 max-w-sm">
                <p className="text-sm font-mono text-red-400 font-semibold">{error}</p>
                {category === "ollama_down" && (
                    <p className="text-xs font-mono text-white/55">
                        Make sure Ollama is running: <code className="text-white/75 bg-white/10 px-1.5 py-0.5 rounded">ollama serve</code>
                    </p>
                )}
                {category === "timeout" && (
                    <p className="text-xs font-mono text-white/55">
                        Try a more specific query to narrow the search scope
                    </p>
                )}
            </div>
            {onRetry && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="text-xs font-mono font-bold border-2 border-red-500/25 text-red-400 hover:bg-red-500/15 hover:border-red-500/40 rounded-xl px-5 transition-all"
                >
                    <RotateCcw className="w-3.5 h-3.5 mr-2" />
                    Retry
                </Button>
            )}
        </motion.div>
    );
}
