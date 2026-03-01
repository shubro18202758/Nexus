"use client";

import { useState } from "react";
import { useDb } from "@/components/providers/db-provider";
import { DEFAULT_WORKSPACE_ID } from "@/components/providers/db-provider";
import { knowledgeChunks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LLMEngine } from "@/lib/ai/llm-engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    FileText, Copy, Save, Loader2, CheckCircle2,
    Sparkles, X, BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { documents } from "@/db/schema";

interface SummaryDialogProps {
    isOpen: boolean;
    onClose: () => void;
    knowledgeItemId: string;
    title: string;
}

export function SummaryDialog({ isOpen, onClose, knowledgeItemId, title }: SummaryDialogProps) {
    const { db } = useDb();
    const [summary, setSummary] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [copied, setCopied] = useState(false);

    const generateSummary = async () => {
        if (!db) return;
        setIsLoading(true);
        setSummary(null);
        setSaved(false);

        try {
            // Fetch all chunks for this knowledge item
            const chunks = await db
                .select()
                .from(knowledgeChunks)
                .where(eq(knowledgeChunks.knowledgeItemId, knowledgeItemId));

            const fullText = chunks.map((c) => c.content).join("\n\n");

            if (!fullText.trim()) {
                setSummary("_No content found for this document._");
                setIsLoading(false);
                return;
            }

            // Truncate if very long (LLM context constraints)
            const truncated = fullText.length > 8000 ? fullText.substring(0, 8000) + "..." : fullText;

            const llm = LLMEngine.getInstance();
            const result = await llm.chat([
                {
                    role: "system",
                    content: "You are a document summarization expert. Create clear, structured summaries using markdown. Include a TL;DR, key points, and main themes.",
                },
                {
                    role: "user",
                    content: `Summarize the following document titled "${title}":\n\n${truncated}`,
                },
            ]);

            setSummary(result);
        } catch (e) {
            console.error("Summarization failed:", e);
            setSummary("_⚠️ Summarization failed. Is the AI model loaded?_");
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (summary) {
            navigator.clipboard.writeText(summary);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleSave = async () => {
        if (!db || !summary) return;
        setIsSaving(true);
        try {
            await db.insert(documents).values({
                workspaceId: DEFAULT_WORKSPACE_ID,
                title: `Summary: ${title}`,
                content: summary,
            });
            setSaved(true);
        } catch (e) {
            console.error("Save failed:", e);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Dialog */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-purple-500/10 overflow-hidden mx-4"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-purple-400" />
                            <h3 className="font-semibold text-sm truncate">{title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {summary && (
                                <>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleCopy}>
                                        {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                        {copied ? "Copied" : "Copy"}
                                    </Button>
                                    <Button
                                        variant="ghost" size="sm"
                                        className="h-7 text-xs gap-1 text-purple-300"
                                        onClick={handleSave}
                                        disabled={isSaving || saved}
                                    >
                                        {saved ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Saved</> :
                                            isSaving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</> :
                                                <><Save className="h-3 w-3" /> Save</>}
                                    </Button>
                                </>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-5">
                        {!summary && !isLoading && (
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <div className="bg-purple-500/10 p-4 rounded-2xl">
                                    <Sparkles className="h-8 w-8 text-purple-400" />
                                </div>
                                <div className="text-center space-y-1">
                                    <h4 className="font-medium">Generate AI Summary</h4>
                                    <p className="text-xs text-muted-foreground max-w-xs">
                                        The AI will read all indexed chunks and produce a structured summary.
                                    </p>
                                </div>
                                <Button
                                    onClick={generateSummary}
                                    className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white gap-2"
                                >
                                    <Sparkles className="h-4 w-4" /> Generate Summary
                                </Button>
                            </div>
                        )}

                        {isLoading && (
                            <div className="flex flex-col items-center justify-center py-12 space-y-3">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                                <p className="text-sm text-muted-foreground">Summarizing document...</p>
                            </div>
                        )}

                        {summary && (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                {summary.split("\n").map((line, i) => {
                                    if (line.startsWith("## ")) return <h2 key={i} className="text-base font-semibold mt-3 mb-1 text-purple-300">{line.replace("## ", "")}</h2>;
                                    if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-medium mt-2 mb-1">{line.replace("### ", "")}</h3>;
                                    if (line.startsWith("- ")) return <li key={i} className="text-sm text-muted-foreground ml-3">{line.replace("- ", "")}</li>;
                                    if (line.trim() === "") return <div key={i} className="h-1.5" />;
                                    return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
