"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/providers/db-provider";
import { documents, tasks, knowledgeItems } from "@/db/schema";
import { desc, gte } from "drizzle-orm";
import {
    FileText, CheckCircle2, BookOpen, Sparkles,
    Clock, ArrowUpRight, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Document, Task } from "@/db/schema";

type ActivityItem = {
    id: string;
    type: "document" | "task" | "knowledge";
    title: string;
    time: Date;
    action: string;
};

export function ActivityTimeline() {
    const { db } = useDb();
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        (async () => {
            try {
                const recentDocs = await db
                    .select()
                    .from(documents)
                    .orderBy(desc(documents.createdAt))
                    .limit(5);
                const recentTasks = await db
                    .select()
                    .from(tasks)
                    .orderBy(desc(tasks.createdAt))
                    .limit(5);

                const items: ActivityItem[] = [
                    ...recentDocs.map((d) => ({
                        id: d.id,
                        type: "document" as const,
                        title: d.title,
                        time: d.createdAt,
                        action: "Created document",
                    })),
                    ...recentTasks.map((t) => ({
                        id: t.id,
                        type: "task" as const,
                        title: t.title,
                        time: t.createdAt,
                        action: t.status === "done" ? "Completed task" : "Created task",
                    })),
                ];

                items.sort((a, b) => b.time.getTime() - a.time.getTime());
                setActivities(items.slice(0, 8));
            } catch (e) {
                console.error("Failed to load activities:", e);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [db]);

    const getIcon = (type: string) => {
        switch (type) {
            case "document": return <FileText className="h-3.5 w-3.5 text-blue-400" />;
            case "task": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
            case "knowledge": return <BookOpen className="h-3.5 w-3.5 text-amber-400" />;
            default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
        }
    };

    const getTimeAgo = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden transition-all hover:border-purple-500/20 hover:bg-white/[7%]">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">Activity Timeline</h3>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent</span>
            </div>

            <div className="p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-400/50" />
                    </div>
                ) : activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                        No activity yet. Create a document or task to get started.
                    </p>
                ) : (
                    <div className="space-y-1">
                        {activities.map((item, i) => (
                            <motion.div
                                key={item.id + item.type}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors group"
                            >
                                <div className="shrink-0 bg-white/5 rounded-lg p-1.5 border border-white/10">
                                    {getIcon(item.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{item.action}</p>
                                </div>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                    {getTimeAgo(item.time)}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
