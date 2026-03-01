"use client";

import { useState, useCallback, useRef } from "react";
import { useRag } from "@/hooks/use-rag";
import { useDb } from "@/components/providers/db-provider";
import { createTaskInWorkspace } from "@/lib/task-utils";
import type {
    ResearchBrief,
    CitationDetail,
    ResearchStep,
    DemoCacheEntry,
} from "@/types/research";
import type { ResearchCopilotResult } from "@/components/providers/rag-provider";
import { CitationModal } from "@/components/research/citation-modal";
import { FlashcardGenerator } from "@/components/research/flashcard-generator";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    Search,
    Sparkles,
    Loader2,
    CheckCircle2,
    BookOpen,
    Code2,
    FileText,
    ArrowRight,
    Copy,
    Save,
    Shield,
    ShieldAlert,
    ToggleLeft,
    ToggleRight,
    ListTodo,
} from "lucide-react";

// ============================================================
// Demo Mode Cache — localStorage-backed (Spec §9)
// ============================================================

const DEMO_CACHE_KEY = "slingshot-research-demo-cache";

function getDemoCache(): Map<string, DemoCacheEntry> {
    try {
        const raw = localStorage.getItem(DEMO_CACHE_KEY);
        if (!raw) return new Map();
        const entries: [string, DemoCacheEntry][] = JSON.parse(raw);
        return new Map(entries);
    } catch {
        return new Map();
    }
}

function setDemoCache(cache: Map<string, DemoCacheEntry>) {
    try {
        localStorage.setItem(DEMO_CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch { /* quota exceeded — silently ignore */ }
}

function normalizeCacheKey(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Research Panel Component (Spec §7)
// ============================================================

interface ResearchPanelProps {
    onResearchComplete?: (brief: ResearchBrief, query: string) => void;
}

export function ResearchPanel({ onResearchComplete }: ResearchPanelProps) {
    const { researchCopilot } = useRag();
    const { db, workspaceId } = useDb();

    // Query state
    const [query, setQuery] = useState("");
    const [isResearching, setIsResearching] = useState(false);

    // Pipeline progress
    const [steps, setSteps] = useState<ResearchStep[]>([]);

    // Output
    const [brief, setBrief] = useState<ResearchBrief | null>(null);
    const [citations, setCitations] = useState<CitationDetail[]>([]);
    const [rawJson, setRawJson] = useState<string>("");

    // Citation modal
    const [selectedCitation, setSelectedCitation] = useState<CitationDetail | null>(null);
    const [citationModalOpen, setCitationModalOpen] = useState(false);

    // Demo mode (Spec §9)
    const [demoMode, setDemoMode] = useState(false);

    // Task creation
    const [createdTasks, setCreatedTasks] = useState<Set<string>>(new Set());

    // Copy state
    const [copied, setCopied] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // -------------------------------------------------------
    // Update pipeline step
    // -------------------------------------------------------
    const updateStep = useCallback((id: number, updates: Partial<ResearchStep>) => {
        setSteps((prev) =>
            prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
        );
    }, []);

    // -------------------------------------------------------
    // Run Research (Spec §1 + §9 demo mode)
    // -------------------------------------------------------
    const runResearch = async () => {
        if (!query.trim()) return;
        setIsResearching(true);
        setBrief(null);
        setCitations([]);
        setRawJson("");
        setCreatedTasks(new Set());
        setCopied(false);

        const pipelineSteps: ResearchStep[] = [
            { id: 1, label: "Decomposing topic", status: "pending" },
            { id: 2, label: "Expanding queries", status: "pending" },
            { id: 3, label: "Searching knowledge base", status: "pending" },
            { id: 4, label: "Compiling research brief", status: "pending" },
        ];
        setSteps(pipelineSteps);

        try {
            // Demo mode cache check
            if (demoMode) {
                const cache = getDemoCache();
                const cached = cache.get(normalizeCacheKey(query));
                if (cached) {
                    // Skip everything — use cached result
                    pipelineSteps.forEach((s) =>
                        updateStep(s.id, { status: "done", detail: "Cached" })
                    );
                    setBrief(cached.brief);
                    setCitations(cached.citations);
                    setRawJson(JSON.stringify(cached.brief, null, 2));
                    setIsResearching(false);
                    return;
                }
            }

            // Full pipeline
            const result: ResearchCopilotResult = await researchCopilot(
                query,
                workspaceId,
                (stepNum, detail) => {
                    // Mark previous steps done, current running
                    setSteps((prev) =>
                        prev.map((s) => {
                            if (s.id < stepNum) return { ...s, status: "done" };
                            if (s.id === stepNum) return { ...s, status: "running", detail };
                            return s;
                        })
                    );
                }
            );

            // Finalize steps
            setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));

            setBrief(result.brief);
            setCitations(result.citations);
            setRawJson(result.rawJson);

            // Notify parent of completed research
            onResearchComplete?.(result.brief, query);

            // Demo mode: cache result
            if (demoMode) {
                const cache = getDemoCache();
                cache.set(normalizeCacheKey(query), {
                    query,
                    brief: result.brief,
                    citations: result.citations,
                    timestamp: Date.now(),
                });
                setDemoCache(cache);
            }
        } catch (error) {
            console.error("Research Copilot failed:", error);
            setSteps((prev) => {
                const running = prev.find((s) => s.status === "running");
                if (running) {
                    return prev.map((s) =>
                        s.id === running.id
                            ? { ...s, status: "error", detail: String(error) }
                            : s
                    );
                }
                return prev;
            });

            // Demo mode fallback message
            if (demoMode) {
                setBrief({
                    title: `Research: ${query}`,
                    summary: "Displaying cached research results.",
                    key_findings: [],
                    evidence: [],
                    annotated_bibliography: [],
                    tasks: [],
                    confidence_score: 0,
                });
            }
        } finally {
            setIsResearching(false);
        }
    };

    // -------------------------------------------------------
    // Spec §4 — Create task via existing DB insert
    // -------------------------------------------------------
    const handleCreateTask = async (title: string, priority: "low" | "medium" | "high") => {
        if (!db || createdTasks.has(title)) return;

        try {
            // Spec §4 — use shared task utility (agent tool system pattern)
            const created = await createTaskInWorkspace(db, {
                workspaceId,
                title,
                priority,
            });

            // created === false means duplicate existed — mark as done silently
            setCreatedTasks((prev) => new Set(prev).add(title));
        } catch (err) {
            console.error("Failed to create task:", err);
        }
    };

    // -------------------------------------------------------
    // Copy + helpers
    // -------------------------------------------------------
    const handleCopy = () => {
        if (brief) {
            navigator.clipboard.writeText(JSON.stringify(brief, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const openCitation = (c: CitationDetail) => {
        setSelectedCitation(c);
        setCitationModalOpen(true);
    };

    // -------------------------------------------------------
    // Confidence indicator color
    // -------------------------------------------------------
    const confidenceColor = (score: number) => {
        if (score >= 0.7) return "text-emerald-400 border-emerald-500/30";
        if (score >= 0.4) return "text-amber-400 border-amber-500/30";
        return "text-red-400 border-red-500/30";
    };

    const confidenceLabel = (score: number) => {
        if (score >= 0.7) return "High";
        if (score >= 0.4) return "Medium";
        return "Low";
    };

    // -------------------------------------------------------
    // Render citation badges inline
    // -------------------------------------------------------
    const renderCitationInline = (text: string) => {
        const parts = text.split(/(\[\d+\])/g);
        return parts.map((part, i) => {
            const match = part.match(/^\[(\d+)\]$/);
            if (match) {
                const idx = parseInt(match[1]);
                const cit = citations.find((c) => c.index === idx);
                return (
                    <button
                        key={i}
                        className="inline-flex items-center mx-0.5 px-1 py-0 text-[10px] font-mono rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/25 transition-colors cursor-pointer"
                        onClick={() => cit && openCitation(cit)}
                        type="button"
                    >
                        {part}
                    </button>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    return (
        <>
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-2 rounded-lg border border-cyan-500/10">
                            <Search className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                                Research Copilot
                            </h2>
                            <p className="text-[10px] text-muted-foreground">
                                AI-powered deep research with citations
                            </p>
                        </div>
                    </div>

                    {/* Demo mode toggle */}
                    <button
                        type="button"
                        onClick={() => setDemoMode(!demoMode)}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border transition-colors",
                            demoMode
                                ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                                : "border-white/10 text-muted-foreground hover:bg-white/5"
                        )}
                    >
                        {demoMode ? (
                            <ToggleRight className="h-3.5 w-3.5" />
                        ) : (
                            <ToggleLeft className="h-3.5 w-3.5" />
                        )}
                        Demo
                    </button>
                </div>

                {/* Query Input */}
                <div className="px-5 py-3 border-b border-white/5">
                    <textarea
                        ref={textareaRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Enter a research topic..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
                                   focus:outline-none focus:border-cyan-500/50 resize-none min-h-[60px]
                                   placeholder:text-muted-foreground/50"
                        rows={3}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runResearch();
                        }}
                        disabled={isResearching}
                    />
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground/50">
                            {demoMode && "Demo mode: results are cached"}
                            {!demoMode && "Ctrl+Enter to run"}
                        </span>
                        <Button
                            onClick={runResearch}
                            disabled={isResearching || !query.trim()}
                            size="sm"
                            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white gap-1.5 h-8 px-4 text-xs"
                        >
                            {isResearching ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            Run Research
                        </Button>
                    </div>
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {/* Pipeline Steps */}
                    <AnimatePresence>
                        {steps.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-1.5"
                            >
                                {steps.map((step) => (
                                    <div
                                        key={step.id}
                                        className={cn(
                                            "flex items-center gap-2 p-2 rounded-md border transition-all text-xs",
                                            step.status === "running" && "border-cyan-500/30 bg-cyan-500/5",
                                            step.status === "done" && "border-emerald-500/20 bg-emerald-500/5",
                                            step.status === "error" && "border-red-500/20 bg-red-500/5",
                                            step.status === "pending" && "border-white/10 bg-white/5 opacity-40"
                                        )}
                                    >
                                        {step.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-cyan-400 shrink-0" />}
                                        {step.status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />}
                                        {step.status === "error" && <div className="h-3 w-3 rounded-full bg-red-500 shrink-0" />}
                                        {step.status === "pending" && <div className="h-3 w-3 rounded-full border border-white/20 shrink-0" />}
                                        <span className="font-medium">{step.label}</span>
                                        {step.detail && (
                                            <span className="text-muted-foreground/60 ml-auto text-[10px] truncate max-w-[120px]">
                                                {step.detail}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Research Output */}
                    {brief && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                        >
                            {/* Confidence + actions bar */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {brief.confidence_score > 0 && (
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[10px] gap-1",
                                                confidenceColor(brief.confidence_score)
                                            )}
                                        >
                                            {brief.confidence_score >= 0.7 ? (
                                                <Shield className="h-3 w-3" />
                                            ) : (
                                                <ShieldAlert className="h-3 w-3" />
                                            )}
                                            {confidenceLabel(brief.confidence_score)}{" "}
                                            ({(brief.confidence_score * 100).toFixed(0)}%)
                                        </Badge>
                                    )}
                                    {citations.length > 0 && (
                                        <Badge
                                            variant="outline"
                                            className="border-cyan-500/30 text-cyan-400 text-[10px]"
                                        >
                                            {citations.length} sources
                                        </Badge>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px] gap-1"
                                    onClick={handleCopy}
                                >
                                    {copied ? (
                                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                    {copied ? "Copied" : "Copy JSON"}
                                </Button>
                            </div>

                            {/* Tabs: Summary | Raw JSON */}
                            <Tabs defaultValue="summary" className="w-full">
                                <TabsList className="bg-white/5 border border-white/10">
                                    <TabsTrigger value="summary" className="text-xs gap-1 data-[state=active]:bg-white/10">
                                        <BookOpen className="h-3 w-3" /> Summary
                                    </TabsTrigger>
                                    <TabsTrigger value="json" className="text-xs gap-1 data-[state=active]:bg-white/10">
                                        <Code2 className="h-3 w-3" /> Raw JSON
                                    </TabsTrigger>
                                </TabsList>

                                {/* Human-readable summary tab */}
                                <TabsContent value="summary" className="mt-3 space-y-4">
                                    {/* Title + Summary */}
                                    <div>
                                        <h3 className="text-base font-semibold text-cyan-300 mb-1">
                                            {brief.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {renderCitationInline(brief.summary)}
                                        </p>
                                    </div>

                                    {/* Key Findings */}
                                    {brief.key_findings.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                                                Key Findings
                                            </h4>
                                            <div className="space-y-1.5">
                                                {brief.key_findings.map((f, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex items-start gap-2 p-2 rounded-md bg-white/5 border border-white/10"
                                                    >
                                                        <ArrowRight className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" />
                                                        <span className="text-xs text-muted-foreground">
                                                            {renderCitationInline(f.point)}{" "}
                                                            {f.source !== "UNVERIFIED" ? (
                                                                <span className="text-cyan-400/70 text-[10px]">
                                                                    {f.source}
                                                                </span>
                                                            ) : (
                                                                <span className="text-red-400/60 text-[10px]">
                                                                    UNVERIFIED
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tasks (Spec §4) */}
                                    {brief.tasks.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2 flex items-center gap-1">
                                                <ListTodo className="h-3 w-3" /> Suggested Tasks
                                            </h4>
                                            <div className="space-y-1.5">
                                                {brief.tasks.map((t, i) => (
                                                    <div
                                                        key={i}
                                                        className="flex items-center justify-between p-2 rounded-md bg-white/5 border border-white/10"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "text-[10px]",
                                                                    t.priority === "high" && "border-red-500/30 text-red-400",
                                                                    t.priority === "medium" && "border-amber-500/30 text-amber-400",
                                                                    t.priority === "low" && "border-emerald-500/30 text-emerald-400"
                                                                )}
                                                            >
                                                                {t.priority}
                                                            </Badge>
                                                            <span className="text-xs">{t.title}</span>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 text-[10px] px-2"
                                                            disabled={createdTasks.has(t.title)}
                                                            onClick={() =>
                                                                handleCreateTask(t.title, t.priority)
                                                            }
                                                        >
                                                            {createdTasks.has(t.title) ? (
                                                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                            ) : (
                                                                "Add"
                                                            )}
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Bibliography */}
                                    {brief.annotated_bibliography.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2 flex items-center gap-1">
                                                <FileText className="h-3 w-3" /> Sources
                                            </h4>
                                            <div className="space-y-1">
                                                {brief.annotated_bibliography.map((b, i) => {
                                                    const cit = citations.find(
                                                        (c) => c.source_id === b.source_id
                                                    );
                                                    return (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            className="w-full flex items-center gap-2 p-2 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left"
                                                            onClick={() => cit && openCitation(cit)}
                                                        >
                                                            <Badge
                                                                variant="outline"
                                                                className="shrink-0 text-[10px] border-amber-500/30 text-amber-400"
                                                            >
                                                                {b.label}
                                                            </Badge>
                                                            <span className="text-xs text-muted-foreground truncate">
                                                                {b.title}
                                                            </span>
                                                            <span className="ml-auto text-[10px] text-muted-foreground/50">
                                                                {(b.score * 100).toFixed(0)}%
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Flashcard Generator (Spec §10) */}
                                    <FlashcardGenerator brief={brief} />
                                </TabsContent>

                                {/* Raw JSON tab */}
                                <TabsContent value="json" className="mt-3">
                                    <pre className="p-3 rounded-lg bg-black/30 border border-white/10 text-[11px] text-muted-foreground overflow-x-auto max-h-[50vh] overflow-y-auto font-mono whitespace-pre-wrap">
                                        {rawJson || JSON.stringify(brief, null, 2)}
                                    </pre>
                                </TabsContent>
                            </Tabs>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Citation Modal (Spec §8) */}
            <CitationModal
                citation={selectedCitation}
                open={citationModalOpen}
                onOpenChange={setCitationModalOpen}
            />
        </>
    );
}
