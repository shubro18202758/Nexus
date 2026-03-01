"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/providers/db-provider";
import { tasks, type Task } from "@/db/schema";
import { SmartInput } from "@/components/tasks/smart-input";
import { TaskBoard } from "@/components/tasks/task-board";
import { PriorityMatrix } from "@/components/tasks/priority-matrix";
import { AiSuggestions } from "@/components/tasks/ai-suggestions";
import { MailFeed } from "@/components/tasks/mail-feed";
import { FocusTimer } from "@/components/focus/focus-timer";
import { TaskReminders } from "@/components/tasks/task-reminders";
import { desc } from "drizzle-orm";
import { Loader2, Zap, LayoutGrid, List, Lightbulb, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type ViewMode = "board" | "matrix" | "ai" | "mail";

export default function TasksPage() {
    const { db } = useDb();
    const [taskList, setTaskList] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>("board");

    const fetchTasks = async () => {
        if (!db) return;
        try {
            const result = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
            setTaskList(result);
        } catch (error) {
            console.error("Failed to fetch tasks:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [db]);

    const viewOptions: { key: ViewMode; label: string; icon: typeof List }[] = [
        { key: "board", label: "KANBAN", icon: List },
        { key: "matrix", label: "MATRIX", icon: LayoutGrid },
        { key: "ai", label: "AI SUITE", icon: Lightbulb },
        { key: "mail", label: "MAIL INTEL", icon: Mail },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="h-full flex flex-col p-6 space-y-6 relative overflow-hidden"
        >
            {/* Hero Background */}
            <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-violet-900/20 to-transparent -z-10 pointer-events-none" />
            <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-3xl -z-10 animate-pulse-slow" />

            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 p-3 rounded-xl border border-violet-500/20 shadow-[0_0_15px_-5px_purple] backdrop-blur-md">
                        <Zap className="h-6 w-6 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 font-space drop-shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                            TASK COMMAND
                        </h1>
                        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase text-cyan-500/60 flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_green]" />
                            Tactical Operations // Online
                        </p>
                    </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1.5 backdrop-blur-md shadow-lg shadow-black/50">
                    {viewOptions.map((opt) => (
                        <Button
                            key={opt.key}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-8 text-[10px] font-bold gap-1.5 rounded-lg transition-all font-mono tracking-wider",
                                viewMode === opt.key
                                    ? "bg-violet-600/20 text-cyan-300 shadow-[0_0_10px_rgba(139,92,246,0.2)] border border-violet-500/30"
                                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                            )}
                            onClick={() => setViewMode(opt.key)}
                        >
                            <opt.icon className="h-3.5 w-3.5" />
                            {opt.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Smart Reminders */}
            <TaskReminders />

            <div className="w-full max-w-4xl mx-auto z-10 flex flex-col md:flex-row gap-6 items-start">
                <div className="flex-1 w-full">
                    <SmartInput onSuccess={fetchTasks} />
                </div>
                <div className="w-full md:w-auto shrink-0">
                    <FocusTimer />
                </div>
            </div>

            <div className="flex-1 overflow-hidden rounded-2xl border border-white/5 bg-black/20 backdrop-blur-sm p-1 shadow-2xl relative">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px] pointer-events-none" />
                {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                    </div>
                ) : viewMode === "mail" ? (
                    <MailFeed />
                ) : viewMode === "board" ? (
                    <TaskBoard tasks={taskList} onUpdate={fetchTasks} />
                ) : viewMode === "matrix" ? (
                    <PriorityMatrix tasks={taskList} onUpdate={fetchTasks} />
                ) : (
                    <AiSuggestions onCreateTask={fetchTasks} />
                )}
            </div>
        </motion.div>
    );
}
