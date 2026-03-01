"use client";

import { useState, useEffect } from "react";
import { useDb } from "@/components/providers/db-provider";
import { useSyncWorkspace } from "@/hooks/use-sync-workspace";
import { tasks, workspaces } from "@/db/schema";
import { useRag } from "@/hooks/use-rag";
import { ChatInterface } from "@/components/ai/chat-interface";
import { ArrowRight, CheckCircle2, FlaskConical, Search, Database, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TestIntegrationPage() {
    // --- RAG State ---
    const { addDocument, search, searchWithRerank } = useRag();
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [rerankResults, setRerankResults] = useState<any[]>([]);
    const [indexInput, setIndexInput] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);

    const handleSearch = async () => {
        // Run both basic and re-ranked search for comparison
        const basic = await search(searchInput);
        setSearchResults(basic);

        const smart = await searchWithRerank(searchInput);
        setRerankResults(smart);
    };

    const handleIndex = async () => {
        if (!indexInput || !workspaceId) return;
        try {
            await addDocument("Test Document", indexInput, workspaceId, "test-doc.txt");
            setIndexInput("");
            alert("Indexed successfully!");
        } catch (e) {
            console.error(e);
            alert("Indexing failed");
        }
    };

    // --- DB State ---
    const { db } = useDb();
    const { status: syncStatus } = useSyncWorkspace(workspaceId || "pending");
    const [taskList, setTaskList] = useState<any[]>([]);

    useEffect(() => {
        if (!db) return;
        const initWorkspace = async () => {
            try {
                const existing = await db.query.workspaces.findFirst();
                if (existing) {
                    setWorkspaceId(existing.id);
                } else {
                    const [active] = await db.insert(workspaces).values({ name: "Integration Test Workspace" }).returning();
                    setWorkspaceId(active.id);
                }
            } catch (e) {
                console.error("Workspace init failed", e);
            }
        };
        initWorkspace();
    }, [db]);

    const refreshTasks = async () => {
        if (!db) return;
        try {
            const result = await db.select().from(tasks);
            setTaskList(result);
        } catch (error) { console.error(error); }
    };

    const addTask = async () => {
        if (!db || !workspaceId) return;
        try {
            await db.insert(tasks).values({
                workspaceId,
                title: `Test Task ${new Date().toLocaleTimeString()}`,
                status: "todo",
            });
            refreshTasks();
        } catch (error) { console.error(error); }
    };

    useEffect(() => { if (db) refreshTasks(); }, [db]);

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center gap-3 mb-8">
                <div className="bg-gradient-to-br from-violet-500/20 to-indigo-500/20 p-2.5 rounded-xl border border-violet-500/10">
                    <FlaskConical className="h-7 w-7 text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]" />
                </div>
                <h1 className="text-3xl font-bold font-[family-name:var(--font-space)] bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">System Verification Suite</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 1. Database & Sync */}
                <section className="space-y-4 border border-white/10 p-6 rounded-xl bg-black/40 backdrop-blur-xl hover:border-white/20 transition-all">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                        <Database className="h-5 w-5 text-blue-400" />
                        <h2 className="text-xl font-bold font-[family-name:var(--font-space)]">1. Core Database & Sync</h2>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <span className="text-sm font-medium text-muted-foreground">Sync Status</span>
                        <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", syncStatus === "connected" ? "bg-green-500" : "bg-yellow-500 animate-pulse")} />
                            <span className="font-mono text-sm font-bold">{syncStatus}</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={addTask} className="flex-1 px-4 py-2 bg-blue-600/80 text-white rounded-md hover:bg-blue-500 text-sm font-medium transition-colors">
                            Add Test Task
                        </button>
                        <button onClick={refreshTasks} className="px-4 py-2 bg-white/10 text-white/80 rounded-md hover:bg-white/20 text-sm font-medium transition-colors">
                            Refresh
                        </button>
                    </div>

                    <div className="mt-4 space-y-2">
                        <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Recent Tasks ({taskList.length})</h3>
                        <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
                            {taskList.slice(0, 5).map((task) => (
                                <li key={task.id} className="flex items-center gap-2 text-sm p-2 bg-white/5 rounded border border-white/10">
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    <span className="truncate flex-1">{task.title}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">{task.id.slice(0, 6)}</span>
                                </li>
                            ))}
                            {taskList.length === 0 && <li className="text-center py-4 text-muted-foreground italic text-sm">No tasks found.</li>}
                        </ul>
                    </div>
                </section>

                {/* 2. Agentic RAG */}
                <section className="space-y-4 border border-white/10 p-6 rounded-xl bg-black/40 backdrop-blur-xl hover:border-white/20 transition-all">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                        <Search className="h-5 w-5 text-indigo-400" />
                        <h2 className="text-xl font-bold font-[family-name:var(--font-space)]">2. Agentic RAG Pipeline</h2>
                    </div>

                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={indexInput}
                                onChange={(e) => setIndexInput(e.target.value)}
                                placeholder="Add knowledge..."
                                className="flex-1 p-2 border border-white/10 rounded-md text-sm bg-white/5 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-muted-foreground"
                            />
                            <button onClick={handleIndex} className="px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-md hover:bg-indigo-500/30 text-sm font-medium border border-indigo-500/20">
                                Index
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Test query..."
                                className="flex-1 p-2 border border-white/10 rounded-md text-sm bg-white/5 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-muted-foreground"
                            />
                            <button onClick={handleSearch} className="px-4 py-2 bg-indigo-600/80 text-white rounded-md hover:bg-indigo-500 text-sm font-medium">
                                Compare Search
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Basic Vector Search</h3>
                            <ul className="space-y-2 min-h-[100px]">
                                {searchResults.slice(0, 3).map((r, i) => (
                                    <li key={i} className="text-xs p-2 bg-white/5 rounded border border-white/10">
                                        <div className="font-bold text-blue-400 mb-1">{Math.round(r.similarity * 100)}% Match</div>
                                        <div className="line-clamp-2">{r.content}</div>
                                    </li>
                                ))}
                                {searchResults.length === 0 && <li className="text-xs text-muted-foreground italic">No results</li>}
                            </ul>
                        </div>
                        <div className="relative">
                            <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">SOTA</div>
                            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Re-ranked (Cross-Encoder)</h3>
                            <ul className="space-y-2 min-h-[100px]">
                                {rerankResults.slice(0, 3).map((r, i) => (
                                    <li key={i} className="text-xs p-2 bg-emerald-500/5 rounded border border-emerald-500/10">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-emerald-400">{Math.round((r.rerank_score ?? r.similarity) * 100)}% Conf.</span>
                                        </div>
                                        <div className="line-clamp-2">{r.content}</div>
                                    </li>
                                ))}
                                {rerankResults.length === 0 && <li className="text-xs text-muted-foreground italic">No high-confidence results</li>}
                            </ul>
                        </div>
                    </div>
                </section>
            </div>

            {/* 3. Agent Chat */}
            <section className="h-[500px] border border-white/10 rounded-xl bg-black/40 backdrop-blur-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-400" />
                    <h2 className="font-bold font-[family-name:var(--font-space)]">3. Full Agent Integration Test</h2>
                    <span className="text-xs text-muted-foreground ml-auto">Try: "Create a task", "Research [topic]", "Search for..."</span>
                </div>
                <ChatInterface />
            </section>
        </div>
    );
}
