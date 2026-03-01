"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/providers/db-provider";
import { documents, tasks, knowledgeItems } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function AiBriefing() {
    const { db } = useDb();
    const [briefing, setBriefing] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [stats, setStats] = useState({ docs: 0, tasks: 0, pendingTasks: 0, knowledge: 0 });

    useEffect(() => {
        if (!db) return;
        (async () => {
            try {
                const [docCount] = await db.select({ value: count() }).from(documents);
                const [taskCount] = await db.select({ value: count() }).from(tasks);
                const [pendingCount] = await db
                    .select({ value: count() })
                    .from(tasks)
                    .where(eq(tasks.status, "todo"));
                const [kiCount] = await db.select({ value: count() }).from(knowledgeItems);

                const newStats = {
                    docs: docCount?.value ?? 0,
                    tasks: taskCount?.value ?? 0,
                    pendingTasks: pendingCount?.value ?? 0,
                    knowledge: kiCount?.value ?? 0,
                };
                setStats(newStats);

                // Generate auto-briefing from stats (no LLM needed for basic summary)
                generateStatsBriefing(newStats);
            } catch (e) {
                console.error("Failed to load briefing stats:", e);
            }
        })();
    }, [db]);

    const generateStatsBriefing = (s: typeof stats) => {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const parts: string[] = [];

        if (s.pendingTasks > 0) {
            parts.push(`You have **${s.pendingTasks} pending task${s.pendingTasks > 1 ? "s" : ""}** waiting for you.`);
        }
        if (s.docs > 0) {
            parts.push(`Your workspace contains **${s.docs} document${s.docs > 1 ? "s" : ""}**.`);
        }
        if (s.knowledge > 0) {
            parts.push(`**${s.knowledge} knowledge item${s.knowledge > 1 ? "s" : ""}** are indexed for RAG search.`);
        }
        if (parts.length === 0) {
            parts.push("Your workspace is empty. Start by creating a document or uploading knowledge.");
        }

        setBriefing(`${greeting}! ${parts.join(" ")}`);
    };

    const handleGenerateAiBriefing = async () => {
        setIsGenerating(true);
        try {
            // Try to use LLM for a richer briefing
            const { LLMEngine } = await import("@/lib/ai/llm-engine");
            const engine = LLMEngine.getInstance();
            if (!engine.isReady()) {
                await engine.initialize((progress) => {
                    console.log(`LLM Init: ${progress.text}`);
                });
            }

            const prompt = `Generate a brief 2-sentence daily briefing for a user with:
- ${stats.pendingTasks} pending tasks
- ${stats.docs} documents 
- ${stats.knowledge} knowledge items indexed
Be motivational and concise. No markdown formatting.`;

            const response = await engine.chat([
                { role: "system", content: "You are a helpful assistant. Be concise." },
                { role: "user", content: prompt },
            ]);
            setBriefing(response);
        } catch (e) {
            console.error("AI Briefing failed:", e);
            // Fallback to stats briefing
            generateStatsBriefing(stats);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-violet-500/5 to-fuchsia-500/5 backdrop-blur-sm overflow-hidden"
        >
            <div className="px-5 py-4 flex items-start gap-4">
                <div className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 p-2.5 rounded-lg border border-purple-500/10 shrink-0 mt-0.5">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-purple-300">AI Daily Briefing</h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-purple-300 gap-1"
                            onClick={handleGenerateAiBriefing}
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3 w-3" />
                            )}
                            {isGenerating ? "Generating..." : "AI Summary"}
                        </Button>
                    </div>
                    {briefing ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {briefing.split("**").map((part, i) =>
                                i % 2 === 1 ? (
                                    <strong key={i} className="text-foreground/90">{part}</strong>
                                ) : (
                                    <span key={i}>{part}</span>
                                )
                            )}
                        </p>
                    ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading workspace stats...
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
