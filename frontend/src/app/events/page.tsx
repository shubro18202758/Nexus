"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Radio, Play, Globe, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { processBatch } from "@/app/actions/process-batch";
import { EventCard } from "@/components/dashboard/event-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarView } from "@/components/events/calendar-view";
import { HistoryImporter } from "@/components/events/history-importer";
import { ResearchEventCard } from "@/components/events/research-event-card";
import { ResearchFiltersPanel } from "@/components/events/research-filters";
import {
    AISearchBar,
    ClarifyDialog,
    ResearchSkeleton,
    ResearchEmptyState,
    ResultsHeader,
    ResearchErrorState,
} from "@/components/events/research-search";
import { WhatsAppIntelligencePanel } from "@/components/events/whatsapp-intelligence";
import type { ResearchFilters, ResearchedEvent } from "@/lib/events/research-engine";
import type { DateRange } from "react-day-picker";

export default function EventsPage() {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
    const [batchCommand, setBatchCommand] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [historyDateRange, setHistoryDateRange] = useState<DateRange | undefined>(undefined);
    const [activeSource, setActiveSource] = useState<string>("All");
    const [activeTab, setActiveTab] = useState<string>("calendar");

    // ─── Public Forms State ──────────────────────────────────────
    const [researchEvents, setResearchEvents] = useState<ResearchedEvent[]>([]);
    const [researchLoading, setResearchLoading] = useState(false);
    const [researchQuery, setResearchQuery] = useState("");
    const [researchFilters, setResearchFilters] = useState<ResearchFilters>({});
    const [filtersCollapsed, setFiltersCollapsed] = useState(true);
    const [clarifyQuestions, setClarifyQuestions] = useState<{ question: string; options: string[] }[]>([]);
    const [showClarify, setShowClarify] = useState(false);
    const [researchPhaseMessage, setResearchPhaseMessage] = useState("");
    const [researchPhaseDetail, setResearchPhaseDetail] = useState("");
    const [researchPhaseProgress, setResearchPhaseProgress] = useState(0);
    const [researchDurationMs, setResearchDurationMs] = useState<number | undefined>();
    const [researchError, setResearchError] = useState<string | null>(null);
    const [researchErrorCategory, setResearchErrorCategory] = useState<string | undefined>();
    const [sortBy, setSortBy] = useState<"relevance" | "date" | "confidence">("relevance");

    // ─── Sorted results ──────────────────────────────────────────
    const sortedResearchEvents = useMemo(() => {
        if (!researchEvents.length) return researchEvents;
        const sorted = [...researchEvents];
        switch (sortBy) {
            case "date":
                sorted.sort((a, b) => {
                    const da = a.eventDate ? new Date(a.eventDate).getTime() : Number.MAX_SAFE_INTEGER;
                    const db = b.eventDate ? new Date(b.eventDate).getTime() : Number.MAX_SAFE_INTEGER;
                    return da - db;
                });
                break;
            case "confidence":
                sorted.sort((a, b) => b.confidenceScore - a.confidenceScore);
                break;
            // "relevance" keeps original order from the engine
        }
        return sorted;
    }, [researchEvents, sortBy]);

    // ─── Simulated phase progress for visual feedback ─────────────
    useEffect(() => {
        if (!researchLoading) {
            setResearchPhaseMessage("");
            setResearchPhaseDetail("");
            setResearchPhaseProgress(0);
            return;
        }

        // Simulate research phases since we don't have SSE yet
        const phases = [
            { msg: "Planning search strategy...", detail: "Analyzing your query with AI", progress: 10, delay: 0 },
            { msg: "Searching the web...", detail: "Querying DuckDuckGo with 8 search variants", progress: 25, delay: 3000 },
            { msg: "Searching the web...", detail: "Collecting results from multiple sources", progress: 40, delay: 8000 },
            { msg: "Deep extracting events...", detail: "AI agents reading top pages for event details", progress: 55, delay: 15000 },
            { msg: "Deep extracting events...", detail: "Parsing event data from page content", progress: 70, delay: 25000 },
            { msg: "Ranking & deduplication...", detail: "Scoring events by relevance, freshness, and trust", progress: 85, delay: 40000 },
            { msg: "Filtering existing events...", detail: "Removing duplicates from your feed", progress: 95, delay: 55000 },
        ];

        const timers = phases.map(p =>
            setTimeout(() => {
                if (researchLoading) {
                    setResearchPhaseMessage(p.msg);
                    setResearchPhaseDetail(p.detail);
                    setResearchPhaseProgress(p.progress);
                }
            }, p.delay),
        );

        return () => timers.forEach(clearTimeout);
    }, [researchLoading]);

    // ─── Public Forms Handlers ───────────────────────────────────
    const doResearch = useCallback(async (query: string, filters?: ResearchFilters) => {
        setResearchLoading(true);
        setResearchError(null);
        setResearchErrorCategory(undefined);
        setClarifyQuestions([]);
        setShowClarify(false);
        setResearchQuery(query);
        const t0 = Date.now();
        try {
            const res = await fetch("/api/events/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "search", query, filters: filters || researchFilters }),
            });
            const data = await res.json();
            setResearchDurationMs(data.durationMs || (Date.now() - t0));
            if (data.error) {
                setResearchError(data.error);
                setResearchErrorCategory(data.category);
                toast.error(data.error);
            } else {
                setResearchEvents(data.events || []);
                toast.success(`Found ${data.events?.length || 0} events`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Research failed";
            setResearchError(msg);
            toast.error("Research failed — check console");
            console.error(err);
        } finally {
            setResearchLoading(false);
        }
    }, [researchFilters]);

    const doRefine = useCallback(async (query: string) => {
        setResearchLoading(true);
        setResearchError(null);
        try {
            const res = await fetch("/api/events/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "filter", query, events: researchEvents }),
            });
            const data = await res.json();
            if (data.error) {
                toast.error(data.error);
            } else {
                setResearchEvents(data.events || []);
                toast.success(`Refined to ${data.events?.length || 0} events`);
            }
        } catch (err) {
            toast.error("Refinement failed");
            console.error(err);
        } finally {
            setResearchLoading(false);
        }
    }, [researchEvents]);

    const doClarify = useCallback(async (query: string) => {
        try {
            const res = await fetch("/api/events/research", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "clarify", query }),
            });
            const data = await res.json();
            if (data.questions?.length > 0) {
                setClarifyQuestions(data.questions);
                setShowClarify(true);
            } else {
                // Not vague enough, just search directly
                doResearch(query);
            }
        } catch {
            doResearch(query);
        }
    }, [doResearch]);

    const handleSearch = useCallback((query: string) => {
        // Short/clear queries go straight to research, vague ones get clarified
        if (query.split(" ").length >= 5) {
            doResearch(query);
        } else {
            doClarify(query);
        }
    }, [doResearch, doClarify]);

    const handleClarifySubmit = useCallback((answers: Record<string, string>) => {
        const context = Object.values(answers).join(", ");
        const enrichedQuery = `${researchQuery} — preferences: ${context}`;
        setShowClarify(false);
        doResearch(enrichedQuery);
    }, [researchQuery, doResearch]);

    const handleClearResults = useCallback(() => {
        setResearchEvents([]);
        setResearchQuery("");
        setResearchError(null);
        setResearchDurationMs(undefined);
        setSortBy("relevance");
    }, []);

    const fetchEvents = async () => {
        try {
            const res = await fetch("/api/events");
            const data = await res.json();
            if (data.events) {
                setEvents(data.events);
            }
        } catch (error) {
            console.error("Failed to fetch events", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const toggleSelection = (id: string, checked: boolean) => {
        const newSet = new Set(selectedEvents);
        if (checked === true) {
            newSet.add(id);
        } else {
            newSet.delete(id);
        }
        setSelectedEvents(newSet);
    };

    const handleBatchProcess = async () => {
        if (selectedEvents.size === 0) return;
        setIsProcessing(true);
        try {
            const result = await processBatch(Array.from(selectedEvents), batchCommand);
            if (result.success) {
                toast.success("Batch processing started!");
                setSelectedEvents(new Set());
                setBatchCommand("");
                fetchEvents(); // Immediate refresh
            } else {
                toast.error(result.error || "Batch processing failed");
            }
        } catch (error) {
            toast.error("An error occurred");
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading && events.length === 0) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-cyan-400" /></div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-8 pb-32 relative overflow-x-hidden w-full max-w-full box-border"
        >
            {/* Hero Background — clean, no gradient mist */}

            <header className="flex items-center justify-between relative z-10">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(6,182,212,0.4)] font-space">
                        EVENT HORIZON
                    </h1>
                    <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase text-cyan-500/60 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_emerald]"></span>
                        Live Feed // {events.length} Signals Detected
                    </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        {/* <HistoryImporter date={historyDateRange} setDate={setHistoryDateRange} /> */}
                        <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] backdrop-blur-md">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_5px_emerald]" />
                            <span className="text-[10px] text-emerald-400 font-mono font-bold tracking-wider">UPLINK ACTIVE</span>
                        </div>
                    </div>
                </div>
            </header>

            <Tabs defaultValue="calendar" value={activeTab} onValueChange={setActiveTab} className="w-full max-w-full space-y-6 overflow-x-hidden">
                <div className="flex items-center justify-between p-1 bg-black/40 border border-white/5 rounded-xl backdrop-blur-md">
                    <TabsList className="bg-transparent border-0 gap-1">
                        <TabsTrigger value="feed" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:shadow-[0_0_10px_rgba(6,182,212,0.2)] transition-all rounded-lg font-mono text-xs tracking-wide">
                            Feed
                        </TabsTrigger>
                        <TabsTrigger value="calendar" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:shadow-[0_0_10px_rgba(6,182,212,0.2)] transition-all rounded-lg font-mono text-xs tracking-wide">
                            Calendar
                        </TabsTrigger>
                        <TabsTrigger value="public-forms" className="data-[state=active]:bg-violet-500/25 data-[state=active]:text-violet-300 data-[state=active]:shadow-[0_0_15px_rgba(139,92,246,0.25)] data-[state=active]:border data-[state=active]:border-violet-500/30 transition-all rounded-lg font-mono text-xs tracking-wide flex items-center gap-1.5 font-semibold">
                            <Globe className="w-3 h-3" />
                            Public Forms
                        </TabsTrigger>
                        <TabsTrigger value="messages" className="data-[state=active]:bg-emerald-500/25 data-[state=active]:text-emerald-300 data-[state=active]:shadow-[0_0_15px_rgba(16,185,129,0.25)] data-[state=active]:border data-[state=active]:border-emerald-500/30 transition-all rounded-lg font-mono text-xs tracking-wide flex items-center gap-1.5 font-semibold">
                            <MessageCircle className="w-3 h-3" />
                            Messages
                        </TabsTrigger>
                    </TabsList>

                    {/* Source filter buttons — hidden on Public Forms and Messages tabs */}
                    {activeTab !== "public-forms" && activeTab !== "messages" && (
                        <div className="flex gap-1 pr-1">
                            {["All", "WhatsApp", "Telegram"].map((source) => (
                                <Button
                                    key={source}
                                    variant={activeSource === source ? "secondary" : "ghost"}
                                    size="sm"
                                    onClick={() => setActiveSource(source)}
                                    className={`text-[10px] h-7 font-bold uppercase tracking-wider rounded-lg transition-all ${activeSource === source
                                        ? "text-white bg-white/10 border border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    {source}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>

                <TabsContent value="feed" className="animate-in fade-in slide-in-from-bottom-5 duration-300 ring-0 focus-visible:ring-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(activeSource === "All" ? events : events.filter((e: any) => e.source === activeSource)).map((event: any) => (
                            <EventCard
                                key={event.id}
                                event={event}
                                isSelected={selectedEvents.has(event.id)}
                                onToggle={(checked) => toggleSelection(event.id, checked)}
                            />
                        ))}

                        {(activeSource === "All" ? events : events.filter((e: any) => e.source === activeSource)).length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-3xl bg-black/20">
                                <Radio className="h-8 w-8 text-cyan-500/50 mb-4 animate-pulse" />
                                <p className="text-muted-foreground font-mono text-xs">Scanning for signals...</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="calendar" className="animate-in fade-in slide-in-from-bottom-5 duration-300 ring-0 focus-visible:ring-0">
                    <CalendarView events={activeSource === "All" ? events : events.filter((e: any) => e.source === activeSource)} />
                </TabsContent>

                {/* ────── Public Forms Tab ────── */}
                <TabsContent value="public-forms" className="animate-in fade-in slide-in-from-bottom-5 duration-300 ring-0 focus-visible:ring-0 space-y-7">
                    {/* AI Search Bar with phase progress */}
                    <AISearchBar
                        onSearch={handleSearch}
                        onRefine={doRefine}
                        onClear={handleClearResults}
                        isSearching={researchLoading}
                        hasResults={researchEvents.length > 0}
                        resultCount={researchEvents.length}
                        phaseMessage={researchPhaseMessage}
                        phaseDetail={researchPhaseDetail}
                        phaseProgress={researchPhaseProgress}
                    />

                    {/* Clarifying Questions */}
                    <AnimatePresence>
                        {showClarify && (
                            <ClarifyDialog
                                questions={clarifyQuestions}
                                onSubmit={handleClarifySubmit}
                                onSkip={() => { setShowClarify(false); doResearch(researchQuery); }}
                                isOpen={showClarify}
                            />
                        )}
                    </AnimatePresence>

                    {/* Manual Filters */}
                    <ResearchFiltersPanel
                        filters={researchFilters}
                        onFiltersChange={setResearchFilters}
                        isCollapsed={filtersCollapsed}
                        onToggleCollapse={() => setFiltersCollapsed(prev => !prev)}
                    />

                    {/* Error State */}
                    {researchError && !researchLoading && (
                        <ResearchErrorState
                            error={researchError}
                            category={researchErrorCategory}
                            onRetry={() => researchQuery && doResearch(researchQuery)}
                        />
                    )}

                    {/* Results */}
                    {researchLoading ? (
                        <ResearchSkeleton
                            phaseMessage={researchPhaseMessage}
                            phaseDetail={researchPhaseDetail}
                            phaseProgress={researchPhaseProgress}
                        />
                    ) : !researchError && sortedResearchEvents.length > 0 ? (
                        <>
                            <ResultsHeader
                                count={sortedResearchEvents.length}
                                sortBy={sortBy}
                                onSortChange={setSortBy}
                                onClear={handleClearResults}
                                durationMs={researchDurationMs}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {sortedResearchEvents.map((event, i) => (
                                    <ResearchEventCard key={`${event.title}-${i}`} event={event} index={i} />
                                ))}
                            </div>
                        </>
                    ) : !researchError ? (
                        <ResearchEmptyState onSuggestionClick={handleSearch} />
                    ) : null}
                </TabsContent>

                {/* ────── Messages (WhatsApp Intelligence) Tab ────── */}
                <TabsContent value="messages" className="animate-in fade-in slide-in-from-bottom-5 duration-300 ring-0 focus-visible:ring-0 w-full max-w-full overflow-x-hidden overflow-y-visible">
                    <WhatsAppIntelligencePanel />
                </TabsContent>
            </Tabs>

            {/* Batch Action Bar */}
            {selectedEvents.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl bg-black/80 backdrop-blur-xl border border-cyan-500/30 rounded-full p-2 pl-6 shadow-[0_0_50px_-10px_rgba(6,182,212,0.3)] flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 ring-1 ring-white/10">
                    <div className="flex-1">
                        <label className="text-[10px] text-cyan-400 font-bold ml-1 mb-0.5 block font-mono tracking-wider">
                            BATCH COMMAND // {selectedEvents.size} TARGETS ACQUIRED
                        </label>
                        <Input
                            value={batchCommand}
                            onChange={(e) => setBatchCommand(e.target.value)}
                            placeholder="Type command..."
                            className="bg-transparent border-0 text-white placeholder:text-white/20 focus-visible:ring-0 h-8 p-0 font-mono text-sm"
                        />
                    </div>
                    <Button
                        onClick={handleBatchProcess}
                        disabled={isProcessing || !batchCommand.trim()}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-full h-10 px-6 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all hover:scale-105"
                    >
                        {isProcessing ? <Loader2 className="animate-spin h-4 w-4" /> : <Play className="fill-current h-4 w-4" />}
                    </Button>
                </div>
            )}
        </motion.div>
    );
}

