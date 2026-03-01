"use client";

import { useState } from "react";
import { Search, Plus, Bell, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useDb } from "@/components/providers/db-provider";
import { documents, tasks } from "@/db/schema";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export function DashboardHeader() {
    const { db, workspaceId } = useDb();
    const router = useRouter();
    const [greeting] = useState(() => {
        const hour = new Date().getHours();
        if (hour < 6) return "Late night grind, Pilot?";
        if (hour < 12) return "Systems online. Good morning.";
        if (hour < 18) return "Operations active. Good afternoon.";
        return "Evening mode engaged.";
    });

    const handleNewDocument = async () => {
        if (!db) return;
        try {
            const newId = uuidv4();
            await db.insert(documents).values({
                id: newId,
                workspaceId,
                title: "Untitled Document",
                content: "<p>Start writing...</p>",
            });
            router.push(`/documents/${newId}`);
        } catch (e) {
            console.error("Failed to create document:", e);
        }
    };

    const handleNewTask = async () => {
        if (!db) return;
        try {
            await db.insert(tasks).values({
                id: uuidv4(),
                workspaceId,
                title: "New Task",
                status: "todo",
                priority: "medium",
            });
            router.push("/tasks");
        } catch (e) {
            console.error("Failed to create task:", e);
        }
    };

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
            <div>
                <h1 className="text-4xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white via-cyan-200 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                    {greeting}
                </h1>
                <p className="text-muted-foreground mt-2 font-mono text-xs tracking-widest uppercase text-cyan-600/70">
                    // Workspace Status: <span className="text-emerald-400 animate-pulse">OPTIMAL</span> // ready for input
                </p>
            </div>

            <div className="flex items-center gap-3">
                <div className="relative w-full md:w-80 group">
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl opacity-20 blur-md group-hover:opacity-40 transition-opacity" />
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-cyan-400 z-10" />
                    <Input
                        type="search"
                        placeholder="SEARCH_DATABASE..."
                        className="pl-10 h-10 bg-black/40 border-white/10 backdrop-blur-xl focus:border-cyan-500/50 text-cyan-100 placeholder:text-cyan-900/50 font-mono text-sm rounded-xl relative z-0 transition-all focus:ring-1 focus:ring-cyan-500/30"
                    />
                </div>

                <Button variant="outline" size="icon" className="shrink-0 h-10 w-10 border-white/10 bg-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all rounded-xl">
                    <Bell className="h-4 w-4 text-cyan-200" />
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button className="shrink-0 h-10 gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all duration-300 hover:scale-105 rounded-xl font-semibold tracking-wide">
                            <Plus className="h-4 w-4" />
                            <span>INITIATE</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-slate-950/90 backdrop-blur-xl border-white/10 text-cyan-100 min-w-[200px] p-2">
                        <DropdownMenuItem onClick={handleNewDocument} className="cursor-pointer hover:bg-violet-500/20 hover:text-violet-300 py-3 rounded-lg group">
                            <div className="p-1.5 rounded-md bg-violet-500/10 mr-3 group-hover:bg-violet-500/20 transition-colors">
                                <Sparkles className="h-4 w-4 text-violet-400 group-hover:shadow-[0_0_10px_purple]" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-xs uppercase tracking-wider">New Protocol</span>
                                <span className="text-[10px] text-muted-foreground">Create Document</span>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleNewTask} className="cursor-pointer hover:bg-cyan-500/20 hover:text-cyan-300 py-3 rounded-lg mt-1 group">
                            <div className="p-1.5 rounded-md bg-cyan-500/10 mr-3 group-hover:bg-cyan-500/20 transition-colors">
                                <Plus className="h-4 w-4 text-cyan-400 group-hover:shadow-[0_0_10px_cyan]" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-xs uppercase tracking-wider">New Directive</span>
                                <span className="text-[10px] text-muted-foreground">Create Task</span>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
