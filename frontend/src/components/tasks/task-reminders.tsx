"use client";

import { useEffect, useState, useMemo } from "react";
import { useDb } from "@/components/providers/db-provider";
import { tasks, type Task } from "@/db/schema";
import { eq, and, lt, gte, isNotNull, not } from "drizzle-orm";
import { AlertTriangle, Clock, Bell, CalendarClock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TaskReminders() {
    const { db } = useDb();
    const [allTasks, setAllTasks] = useState<Task[]>([]);

    useEffect(() => {
        if (!db) return;
        const load = async () => {
            try {
                const res = await db
                    .select()
                    .from(tasks)
                    .where(
                        and(
                            not(eq(tasks.status, "done")),
                            isNotNull(tasks.dueDate)
                        )
                    );
                setAllTasks(res);
            } catch (e) {
                console.error("Failed to load tasks for reminders:", e);
            }
        };
        load();
    }, [db]);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

    const overdue = useMemo(
        () => allTasks.filter((t) => t.dueDate && new Date(t.dueDate) < todayStart),
        [allTasks, todayStart]
    );

    const dueToday = useMemo(
        () => allTasks.filter((t) => {
            if (!t.dueDate) return false;
            const d = new Date(t.dueDate);
            return d >= todayStart && d < todayEnd;
        }),
        [allTasks, todayStart, todayEnd]
    );

    const dueThisWeek = useMemo(
        () => allTasks.filter((t) => {
            if (!t.dueDate) return false;
            const d = new Date(t.dueDate);
            return d >= todayEnd && d < weekEnd;
        }),
        [allTasks, todayEnd, weekEnd]
    );

    if (overdue.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
        >
            {overdue.length > 0 && (
                <ReminderBanner
                    icon={AlertTriangle}
                    label="Overdue"
                    tasks={overdue}
                    colorClass="border-red-500/20 bg-red-500/5 text-red-400"
                    badgeClass="border-red-500/30 text-red-400"
                />
            )}
            {dueToday.length > 0 && (
                <ReminderBanner
                    icon={Bell}
                    label="Due Today"
                    tasks={dueToday}
                    colorClass="border-amber-500/20 bg-amber-500/5 text-amber-400"
                    badgeClass="border-amber-500/30 text-amber-400"
                />
            )}
            {dueThisWeek.length > 0 && (
                <ReminderBanner
                    icon={CalendarClock}
                    label="This Week"
                    tasks={dueThisWeek}
                    colorClass="border-blue-500/20 bg-blue-500/5 text-blue-400"
                    badgeClass="border-blue-500/30 text-blue-400"
                />
            )}
        </motion.div>
    );
}

function ReminderBanner({
    icon: Icon,
    label,
    tasks,
    colorClass,
    badgeClass,
}: {
    icon: React.ElementType;
    label: string;
    tasks: Task[];
    colorClass: string;
    badgeClass: string;
}) {
    return (
        <div className={cn("flex items-center gap-3 p-3 rounded-xl border", colorClass)}>
            <Icon className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{label}</span>
                    <Badge variant="outline" className={cn("text-[10px] h-4", badgeClass)}>
                        {tasks.length}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground truncate">
                        {tasks.slice(0, 3).map((t) => t.title).join(" • ")}
                        {tasks.length > 3 && ` +${tasks.length - 3} more`}
                    </span>
                </div>
            </div>
        </div>
    );
}
