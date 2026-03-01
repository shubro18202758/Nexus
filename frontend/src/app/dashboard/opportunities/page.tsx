"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Loader2,
    Sparkles,
    ExternalLink,
    CheckCircle,
    PenLine,
    Zap,
    Target,
    Brain,
    Bot,
    Keyboard,
    Eye,
    ShieldCheck,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { applyToEvent } from "@/actions/apply-to-event";
import type { Opportunity } from "@/db/schema";
import { OpportunityFinder } from "@/components/opportunities/opportunity-finder";

// --- Agent progress steps ---
const AGENT_STEPS = [
    { key: "reading", label: "Agent is reading form...", icon: Eye },
    { key: "mapping", label: "Agent is mapping profile...", icon: Brain },
    { key: "typing", label: "Agent is typing answers...", icon: Keyboard },
    { key: "screenshot", label: "Agent is capturing preview...", icon: ShieldCheck },
] as const;

// --- Relevance score badge ---
function RelevanceBadge({ score }: { score: number | null }) {
    if (score === null) return null;

    let color: string;
    let label: string;
    if (score >= 80) {
        color = "bg-green-500/20 text-green-400 border-green-500/50";
        label = "High Match";
    } else if (score >= 60) {
        color = "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
        label = "Medium Match";
    } else {
        color = "bg-red-500/20 text-red-400 border-red-500/50";
        label = "Low Match";
    }

    return (
        <Badge variant="outline" className={color}>
            <Target className="h-3 w-3 mr-1" />
            {score}% &mdash; {label}
        </Badge>
    );
}

// --- Single opportunity card ---
function OpportunityCard({
    opportunity,
    onAutoFill,
    isProcessing,
    activeAgentStep,
}: {
    opportunity: Opportunity;
    onAutoFill: (url: string, intent: string) => void;
    isProcessing: boolean;
    activeAgentStep: string | null;
}) {
    const [intent, setIntent] = useState("");

    const handleAutoFill = () => {
        if (!opportunity.url) {
            toast.error("No URL found for this opportunity");
            return;
        }
        onAutoFill(opportunity.url, intent);
    };

    const statusColor =
        opportunity.status === "applied"
            ? "bg-green-500/20 text-green-400 border-green-500/50"
            : opportunity.status === "rejected"
              ? "bg-red-500/20 text-red-400 border-red-500/50"
              : "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";

    return (
        <Card className="border-white/10 bg-black/40 backdrop-blur-md hover:border-violet-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] transition-all duration-300 flex flex-col justify-between h-full group">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                            variant="outline"
                            className={
                                opportunity.source === "WhatsApp"
                                    ? "border-green-500/50 text-green-400 bg-green-500/10"
                                    : "border-blue-500/50 text-blue-400 bg-blue-500/10"
                            }
                        >
                            {opportunity.source}
                        </Badge>
                        {opportunity.eventType && (
                            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                                {opportunity.eventType}
                            </Badge>
                        )}
                    </div>
                    <Badge variant="outline" className={statusColor}>
                        {opportunity.status}
                    </Badge>
                </div>

                {/* AI-generated title / summary */}
                <CardTitle className="text-base font-semibold text-white leading-snug">
                    {opportunity.aiSummary || "Untitled Opportunity"}
                </CardTitle>

                {/* Relevance Score */}
                <div className="mt-2">
                    <RelevanceBadge score={opportunity.relevanceScore} />
                </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                {/* Original message context */}
                {opportunity.content && (
                    <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1 font-mono">
                            Original Message
                        </p>
                        <p className="text-sm text-white/70 line-clamp-3">{opportunity.content}</p>
                    </div>
                )}

                {/* Link */}
                {opportunity.url && (
                    <a
                        href={opportunity.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1 truncate transition-colors"
                    >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {opportunity.url}
                    </a>
                )}

                {/* Action area — intent input + auto-fill button */}
                {opportunity.status === "pending" && (
                    <div className="border-t border-white/5 pt-4 space-y-3">
                        <label className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-mono block">
                            How do you want to apply?
                        </label>
                        <Input
                            value={intent}
                            onChange={(e) => setIntent(e.target.value)}
                            placeholder='e.g. "Focus on my React skills"'
                            className="bg-black/40 border-white/10 text-white text-sm placeholder:text-white/30 focus-visible:ring-cyan-500/50"
                            disabled={isProcessing}
                        />
                        <Button
                            onClick={handleAutoFill}
                            disabled={isProcessing}
                            className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700 text-white font-semibold transition-all"
                        >
                            {isProcessing ? (
                                <AgentProgressInline step={activeAgentStep} />
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Auto-Fill Form
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* Applied state */}
                {opportunity.status === "applied" && (
                    <div className="border-t border-white/5 pt-3 flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        Applied successfully
                    </div>
                )}

                {/* Footer */}
                <div className="text-[10px] text-muted-foreground/50 font-mono">
                    {new Date(opportunity.createdAt).toLocaleString()}
                </div>
            </CardContent>
        </Card>
    );
}

// --- Inline agent progress indicator ---
function AgentProgressInline({ step }: { step: string | null }) {
    const current = AGENT_STEPS.find((s) => s.key === step) || AGENT_STEPS[0];
    const Icon = current.icon;

    return (
        <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <Icon className="h-4 w-4 opacity-70" />
            <span className="text-sm">{current.label}</span>
        </span>
    );
}

// --- Verification Modal ---
function VerificationModal({
    open,
    onOpenChange,
    screenshotBase64,
    summary,
    onConfirm,
    onEdit,
    isSubmitting,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    screenshotBase64: string | null;
    summary: string | null;
    onConfirm: () => void;
    onEdit: () => void;
    isSubmitting: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl bg-zinc-950 border-white/10 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <Bot className="h-5 w-5 text-cyan-400" />
                        Agent Preview &mdash; Review Before Submitting
                    </DialogTitle>
                    <DialogDescription>
                        The agent has filled out the form. Review the screenshot below, then confirm or edit manually.
                    </DialogDescription>
                </DialogHeader>

                {/* Summary */}
                {summary && (
                    <p className="text-sm text-white/70 bg-white/5 rounded-lg p-3 border border-white/10">
                        {summary}
                    </p>
                )}

                {/* Screenshot */}
                {screenshotBase64 ? (
                    <div className="rounded-lg overflow-hidden border border-white/10 bg-black">
                        <img
                            src={`data:image/png;base64,${screenshotBase64}`}
                            alt="Filled form preview"
                            className="w-full h-auto"
                        />
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-white/10 text-muted-foreground">
                        No screenshot available
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={onEdit}
                        className="border-white/10 text-white hover:bg-white/5"
                    >
                        <PenLine className="h-4 w-4 mr-2" />
                        Edit Manually
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Confirm &amp; Submit
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- Main Page ---
export default function OpportunitiesPage() {
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(true);

    // Agent state
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [agentStep, setAgentStep] = useState<string | null>(null);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalScreenshot, setModalScreenshot] = useState<string | null>(null);
    const [modalSummary, setModalSummary] = useState<string | null>(null);
    const [modalOpportunityId, setModalOpportunityId] = useState<string | null>(null);
    const [modalUrl, setModalUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchOpportunities = useCallback(async () => {
        try {
            const res = await fetch("/api/opportunities");
            const data = await res.json();
            if (data.opportunities) {
                setOpportunities(data.opportunities);
            }
        } catch (error) {
            console.error("Failed to fetch opportunities", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOpportunities();
        const interval = setInterval(fetchOpportunities, 5000);
        return () => clearInterval(interval);
    }, [fetchOpportunities]);

    // --- Auto-fill handler ---
    const handleAutoFill = async (url: string, intent: string) => {
        const opp = opportunities.find((o) => o.url === url);
        if (!opp) return;

        setProcessingId(opp.id);
        setAgentStep("reading");

        try {
            // Simulate step progression while the server action runs
            const stepTimer = setInterval(() => {
                setAgentStep((prev) => {
                    const idx = AGENT_STEPS.findIndex((s) => s.key === prev);
                    if (idx < AGENT_STEPS.length - 1) {
                        return AGENT_STEPS[idx + 1].key;
                    }
                    return prev;
                });
            }, 3000);

            const result = await applyToEvent(url, intent || "Apply with my full profile");

            clearInterval(stepTimer);

            if (result.error) {
                toast.error(`Agent failed: ${result.error}`);
                setProcessingId(null);
                setAgentStep(null);
                return;
            }

            // Open verification modal
            setModalScreenshot(result.screenshot || null);
            setModalSummary(result.summary || null);
            setModalOpportunityId(opp.id);
            setModalUrl(url);
            setModalOpen(true);
        } catch (error) {
            toast.error("Agent encountered an error");
            console.error(error);
        } finally {
            setProcessingId(null);
            setAgentStep(null);
        }
    };

    // --- Confirm submit ---
    const handleConfirmSubmit = async () => {
        if (!modalUrl || !modalOpportunityId) return;

        setIsSubmitting(true);
        try {
            // Call applyToEvent again but this time the agent would submit
            // For now, mark as applied in our DB
            const res = await fetch("/api/opportunities", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: modalOpportunityId, status: "applied" }),
            });

            if (res.ok) {
                toast.success("Application submitted!");
                setModalOpen(false);
                fetchOpportunities();
            } else {
                toast.error("Failed to update status");
            }
        } catch (error) {
            toast.error("Submission error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Edit manually: open URL in new tab ---
    const handleEditManually = () => {
        if (modalUrl) {
            window.open(modalUrl, "_blank");
        }
        setModalOpen(false);
    };

    if (loading && opportunities.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="animate-spin text-cyan-400 h-8 w-8" />
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen p-6 md:p-8 space-y-8">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-violet-500/20 to-cyan-500/20 p-3 rounded-xl border border-violet-500/10">
                        <Target className="h-6 w-6 text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-[family-name:var(--font-space)] bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                            Opportunity Feed
                        </h1>
                        <p className="text-muted-foreground text-sm mt-1">
                            AI-filtered opportunities from your connected sources. Review, customize, and auto-apply.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-violet-500/10 px-4 py-2 rounded-full border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                    <Zap className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
                    <span className="text-xs text-violet-300 font-mono font-bold">
                        {opportunities.length} OPPORTUNITIES
                    </span>
                </div>
            </header>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    {
                        label: "Pending",
                        count: opportunities.filter((o) => o.status === "pending").length,
                        color: "text-cyan-400",
                        glow: "shadow-[0_0_15px_rgba(34,211,238,0.1)]",
                        borderColor: "border-cyan-500/20",
                    },
                    {
                        label: "Applied",
                        count: opportunities.filter((o) => o.status === "applied").length,
                        color: "text-green-400",
                        glow: "shadow-[0_0_15px_rgba(74,222,128,0.1)]",
                        borderColor: "border-green-500/20",
                    },
                    {
                        label: "Rejected",
                        count: opportunities.filter((o) => o.status === "rejected").length,
                        color: "text-red-400",
                        glow: "shadow-[0_0_15px_rgba(248,113,113,0.1)]",
                        borderColor: "border-red-500/20",
                    },
                ].map((stat) => (
                    <div
                        key={stat.label}
                        className={`bg-black/40 backdrop-blur-md border ${stat.borderColor} rounded-xl p-5 text-center ${stat.glow} hover:scale-[1.02] transition-all duration-300`}
                    >
                        <p className={`text-3xl font-bold font-mono ${stat.color}`}>{stat.count}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1 font-[family-name:var(--font-space)]">
                            {stat.label}
                        </p>
                    </div>
                ))}
            </div>

            {/* AI Opportunity Finder */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
                    <span className="text-xs font-[family-name:var(--font-space)] uppercase tracking-widest text-violet-400/70">
                        AI Opportunity Finder
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
                </div>
                <OpportunityFinder
                    onOpportunitiesFound={(found) => {
                        toast.success(`Found ${found.length} opportunities!`);
                    }}
                />
            </section>

            {/* Ingested Opportunity Feed */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                    <span className="text-xs font-[family-name:var(--font-space)] uppercase tracking-widest text-cyan-400/70">
                        Ingested Feed
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                </div>
            </section>

            {/* Card Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {opportunities.map((opp) => (
                    <OpportunityCard
                        key={opp.id}
                        opportunity={opp}
                        onAutoFill={handleAutoFill}
                        isProcessing={processingId === opp.id}
                        activeAgentStep={processingId === opp.id ? agentStep : null}
                    />
                ))}

                {opportunities.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-xl">
                        <Target className="h-8 w-8 text-muted-foreground mb-4 opacity-50" />
                        <p className="text-muted-foreground">No opportunities yet.</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                            Events from WhatsApp &amp; Telegram will appear here once filtered by AI.
                        </p>
                    </div>
                )}
            </div>

            {/* Verification Modal */}
            <VerificationModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                screenshotBase64={modalScreenshot}
                summary={modalSummary}
                onConfirm={handleConfirmSubmit}
                onEdit={handleEditManually}
                isSubmitting={isSubmitting}
            />
        </div>
    );
}
