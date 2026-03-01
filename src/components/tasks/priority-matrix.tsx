"use client";

import { useState } from "react";
import type { Task } from "@/db/schema";
import { useDb } from "@/components/providers/db-provider";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AlertTriangle, Target, Clock, Inbox, Check } from "lucide-react";
import { AuraCard } from "@/components/ui/aura-card";

interface PriorityMatrixProps {
    tasks: Task[];
    onUpdate: () => void;
}

type Quadrant = "urgent-important" | "important" | "urgent" | "neither";

function classifyTask(task: Task): Quadrant {
    const isHighPriority = task.priority === "high";
    const isUrgent = task.dueDate
        ? new Date(task.dueDate).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 // within 3 days
        : false;

    if (isHighPriority && isUrgent) return "urgent-important";
    if (isHighPriority) return "important";
    if (isUrgent) return "urgent";
    return "neither";
}

const QUADRANTS = [
    {
        key: "urgent-important" as Quadrant,
        label: "CRITICAL",
        subtitle: "Immediate Action Required",
        icon: AlertTriangle,
        color: "text-red-400",
        border: "border-red-500/20",
        glow: "shadow-[0_0_20px_rgba(239,68,68,0.15)]",
        badge: "bg-red-500/20 text-red-300",
    },
    {
        key: "important" as Quadrant,
        label: "STRATEGIC",
        subtitle: "High Value / Scheduled",
        icon: Target,
        color: "text-blue-400",
        border: "border-blue-500/20",
        glow: "shadow-[0_0_20px_rgba(59,130,246,0.15)]",
        badge: "bg-blue-500/20 text-blue-300",
    },
    {
        key: "urgent" as Quadrant,
        label: "TACTICAL",
        subtitle: "Delegate or Quick Fix",
        icon: Clock,
        color: "text-amber-400",
        border: "border-amber-500/20",
        glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]",
        badge: "bg-amber-500/20 text-amber-300",
    },
    {
        key: "neither" as Quadrant,
        label: "BACKLOG",
        subtitle: "Low Priority / Review Later",
        icon: Inbox,
        color: "text-slate-400",
        border: "border-slate-500/20",
        glow: "shadow-none",
        badge: "bg-slate-500/20 text-slate-300",
    },
];

export function PriorityMatrix({ tasks: taskList, onUpdate }: PriorityMatrixProps) {
    const { db } = useDb();

    // Filter out active tasks only
    const activeTasks = taskList.filter((t) => t.status !== "done");

    const grouped = QUADRANTS.map((q) => ({
        ...q,
        items: activeTasks.filter((t) => classifyTask(t) === q.key),
    }));

    const handleStatusToggle = async (task: Task) => {
        if (!db) return;
        const newStatus = task.status === "done" ? "todo" : "done";
        await db.update(tasks).set({ status: newStatus }).where(eq(tasks.id, task.id));
        onUpdate();
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
            {grouped.map((quadrant, qi) => (
                <motion.div
                    key={quadrant.key}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: qi * 0.1 }}
                >
                    <AuraCard
                        className={cn(
                            "h-full min-h-[250px] flex flex-col transition-all hover:scale-[1.01]",
                            quadrant.border,
                            quadrant.glow
                        )}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
                            <div className={cn("p-2 rounded-lg bg-white/5", quadrant.color)}>
                                <quadrant.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className={cn("font-bold text-sm tracking-wider font-mono", quadrant.color)}>
                                    {quadrant.label}
                                </h4>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                    {quadrant.subtitle}
                                </p>
                            </div>
                            <span className={cn("ml-auto text-xs font-mono font-bold px-2.5 py-1 rounded-md", quadrant.badge)}>
                                {quadrant.items.length}
                            </span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto max-h-[300px] custom-scrollbar space-y-2 pr-2">
                            {quadrant.items.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-8">
                                    <Inbox className="h-8 w-8 mb-2" />
                                    <span className="text-xs font-mono">SECTOR CLEAR</span>
                                </div>
                            ) : (
                                quadrant.items.map((task) => (
                                    <div
                                        key={task.id}
                                        className="group flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-transparent hover:border-white/10 transition-all cursor-pointer"
                                        onClick={() => handleStatusToggle(task)}
                                    >
                                        <div className={cn(
                                            "h-4 w-4 rounded-sm border-2 flex items-center justify-center transition-all",
                                            task.status === "done"
                                                ? "bg-emerald-500 border-emerald-500"
                                                : `border-slate-600 group-hover:${quadrant.color.replace('text-', 'border-')}`
                                        )}>
                                            {task.status === "done" && <Check className="h-3 w-3 text-black" />}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                "text-sm font-medium truncate text-slate-200 group-hover:text-white transition-colors",
                                                task.status === "done" && "line-through text-muted-foreground"
                                            )}>
                                                {task.title}
                                            </p>
                                            {task.dueDate && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    <Clock className="h-3 w-3 text-slate-500" />
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                        {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </AuraCard>
                </motion.div>
            ))}
        </div>
    );
}
