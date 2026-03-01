"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Clock, TrendingUp, Zap, Trophy, Flame, Cpu } from "lucide-react";
import { AuraCard } from "@/components/ui/aura-card";
import { useDb } from "@/components/providers/db-provider";
import { tasks, documents } from "@/db/schema";
import { eq } from "drizzle-orm";

export function DashboardStats() {
    const { db } = useDb();
    const [taskCount, setTaskCount] = useState(0);
    const [docCount, setDocCount] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            if (!db) return;
            try {
                const t = await db.select().from(tasks).where(eq(tasks.status, "todo"));
                const d = await db.select().from(documents);
                setTaskCount(t.length);
                setDocCount(d.length);
            } catch (e) {
                console.error("Failed to fetch stats", e);
            }
        };
        fetchData();
    }, [db]);

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <AuraCard className="relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Zap className="h-16 w-16 text-violet-500" />
                </div>
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground font-mono">AURA POINTS</h3>
                    <Trophy className="h-4 w-4 text-neon-purple shadow-neon-purple" />
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold font-mono tracking-tight text-white shadow-neon-purple">2,450 XP</div>
                    <p className="text-xs text-muted-foreground mt-1 text-neon-cyan">Rank: Cyber Adept</p>
                </div>
            </AuraCard>

            <AuraCard className="relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Flame className="h-16 w-16 text-orange-500" />
                </div>
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground font-mono">FOCUS STREAK</h3>
                    <Flame className="h-4 w-4 text-orange-400" />
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold font-mono tracking-tight text-white">4 Days</div>
                    <p className="text-xs text-muted-foreground mt-1">On fire! 🔥</p>
                </div>
            </AuraCard>

            <AuraCard className="relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Cpu className="h-16 w-16 text-cyan-500" />
                </div>
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground font-mono">SYSTEM LOAD</h3>
                    <Cpu className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold font-mono tracking-tight text-white">{taskCount} Tasks</div>
                    <p className="text-xs text-muted-foreground mt-1">Processing efficient</p>
                </div>
            </AuraCard>

            <AuraCard className="relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <FileText className="h-16 w-16 text-emerald-500" />
                </div>
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="text-sm font-medium text-muted-foreground font-mono">KNOWLEDGE BASE</h3>
                    <FileText className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2">
                    <div className="text-2xl font-bold font-mono tracking-tight text-white">{docCount} Files</div>
                    <p className="text-xs text-muted-foreground mt-1">+12% expansion</p>
                </div>
            </AuraCard>
        </div>
    );
}
