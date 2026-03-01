"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDb } from "@/components/providers/db-provider";
import { documents, tasks } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Plus, X, FileText, CheckCircle, Zap,
    StickyNote, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type CaptureMode = "note" | "task";

export function QuickCapture() {
    const router = useRouter();
    const { db } = useDb();
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<CaptureMode>("note");
    const [value, setValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!db || !value.trim()) return;
        setIsSaving(true);

        try {
            if (mode === "note") {
                const [doc] = await db.insert(documents).values({
                    workspaceId: "default",
                    title: value.substring(0, 60),
                    content: `<p>${value}</p>`,
                }).returning();
                setIsOpen(false);
                setValue("");
                router.push(`/documents/${doc.id}`);
            } else {
                await db.insert(tasks).values({
                    workspaceId: "default",
                    title: value,
                    status: "todo",
                    priority: "medium",
                });
                setIsOpen(false);
                setValue("");
            }
        } catch (e) {
            console.error("Quick capture failed:", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            {/* Floating Action Button */}
            <motion.button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 flex items-center justify-center transition-all hover:scale-105"
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.95 }}
            >
                <Plus className="h-6 w-6" />
            </motion.button>

            {/* Capture Modal */}
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 50, scale: 0.95 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden mx-0 sm:mx-4"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                                <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-purple-400" />
                                    <h3 className="font-semibold text-sm">Quick Capture</h3>
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Mode Toggle */}
                            <div className="flex gap-2 px-5 pt-4">
                                <button
                                    onClick={() => setMode("note")}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                                        mode === "note"
                                            ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                                    )}
                                >
                                    <StickyNote className="h-4 w-4" /> Quick Note
                                </button>
                                <button
                                    onClick={() => setMode("task")}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                                        mode === "task"
                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                                    )}
                                >
                                    <CheckCircle className="h-4 w-4" /> Quick Task
                                </button>
                            </div>

                            {/* Input */}
                            <div className="p-5 space-y-3">
                                <Input
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    placeholder={mode === "note" ? "Jot down a quick note..." : "What needs to be done?"}
                                    className="bg-white/5 border-white/10 text-base focus:border-purple-500/50"
                                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                    autoFocus
                                />
                                <Button
                                    onClick={handleSave}
                                    disabled={!value.trim() || isSaving}
                                    className={cn(
                                        "w-full gap-2",
                                        mode === "note"
                                            ? "bg-blue-600 hover:bg-blue-500"
                                            : "bg-emerald-600 hover:bg-emerald-500"
                                    )}
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : mode === "note" ? (
                                        <FileText className="h-4 w-4" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4" />
                                    )}
                                    {mode === "note" ? "Save Note" : "Add Task"}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
