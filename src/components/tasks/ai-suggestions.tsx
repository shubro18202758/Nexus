"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/providers/db-provider";
import { documents, tasks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Sparkles, Loader2, Lightbulb, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface Suggestion {
    title: string;
    reason: string;
    priority: "low" | "medium" | "high";
}

export function AiSuggestions({ onCreateTask }: { onCreateTask?: () => void }) {
    const { db } = useDb();
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasGenerated, setHasGenerated] = useState(false);

    const generateSuggestions = async () => {
        if (!db) return;
        setIsLoading(true);
        try {
            // Gather context
            const recentDocs = await db.select().from(documents).orderBy(desc(documents.createdAt)).limit(5);
            const pendingTasks = await db.select().from(tasks).where(eq(tasks.status, "todo")).limit(5);

            const docTitles = recentDocs.map((d) => d.title).join(", ");
            const taskTitles = pendingTasks.map((t) => t.title).join(", ");

            // Try LLM-powered suggestions
            try {
                const { LLMEngine } = await import("@/lib/ai/llm-engine");
                const engine = LLMEngine.getInstance();

                const prompt = `Based on these recent documents: [${docTitles || "none"}] and pending tasks: [${taskTitles || "none"}], suggest 3 new tasks the user should work on next.

Respond ONLY with a JSON array:
[{"title": "Task title", "reason": "Why this is important", "priority": "high|medium|low"}]`;

                const response = await engine.chat([
                    { role: "system", content: "You are a productivity assistant. Respond only with valid JSON." },
                    { role: "user", content: prompt },
                ]);

                const jsonMatch = response.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    setSuggestions(parsed.slice(0, 3));
                    setHasGenerated(true);
                    return;
                }
            } catch (e) {
                console.warn("LLM suggestions failed, using fallback:", e);
            }

            // Fallback: Static suggestions based on data
            const fallback: Suggestion[] = [];
            if (recentDocs.length > 0 && pendingTasks.length === 0) {
                fallback.push({
                    title: `Review "${recentDocs[0].title}"`,
                    reason: "You have documents but no pending tasks",
                    priority: "medium",
                });
            }
            if (pendingTasks.length > 3) {
                fallback.push({
                    title: "Prioritize your task backlog",
                    reason: `You have ${pendingTasks.length} pending tasks`,
                    priority: "high",
                });
            }
            fallback.push({
                title: "Upload study materials to Knowledge Base",
                reason: "Enhance your AI assistant's context with more documents",
                priority: "low",
            });
            setSuggestions(fallback.slice(0, 3));
            setHasGenerated(true);
        } catch (e) {
            console.error("AI suggestions error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const priorityColors: Record<string, string> = {
        high: "text-red-400 bg-red-500/10 border-red-500/20",
        medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    };

    return (
        <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-violet-500/5 to-fuchsia-500/5 backdrop-blur-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Task Suggestions</h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-purple-300 hover:text-purple-200"
                    onClick={generateSuggestions}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <Sparkles className="h-3 w-3" />
                    )}
                    {isLoading ? "Analyzing..." : hasGenerated ? "Refresh" : "Generate"}
                </Button>
            </div>

            <div className="p-4">
                {!hasGenerated && !isLoading ? (
                    <div className="text-center py-6 space-y-3">
                        <Sparkles className="h-8 w-8 text-purple-400/30 mx-auto" />
                        <p className="text-xs text-muted-foreground">
                            Click &quot;Generate&quot; to get AI-powered task suggestions based on your documents and tasks.
                        </p>
                    </div>
                ) : isLoading ? (
                    <div className="flex items-center justify-center py-8 gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                        <span className="text-xs text-muted-foreground">Analyzing your workspace...</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {suggestions.map((s, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/[7%] transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{s.title}</p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.reason}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${priorityColors[s.priority] || ""}`}>
                                        {s.priority}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
