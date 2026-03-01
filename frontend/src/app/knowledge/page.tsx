"use client";

import { useState } from "react";
import { FileUploader } from "@/components/knowledge/file-uploader";
import { KnowledgeList } from "@/components/knowledge/knowledge-list";
import { KnowledgeGraph } from "@/components/knowledge/knowledge-graph";
import { KnowledgeSearch } from "@/components/knowledge/knowledge-search";
import { CopilotRunner } from "@/components/knowledge/copilot-runner";
import { InteractiveRoadmap } from "@/components/knowledge/interactive-roadmap";
import { ResourceRecommendations } from "@/components/knowledge/resource-recommendations";
import { AdaptiveTimeline } from "@/components/knowledge/adaptive-timeline";
import { type CopilotState } from "@/lib/ai/copilot-orchestrator";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, List, Network, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "graph";

export default function KnowledgePage() {
    const [viewMode, setViewMode] = useState<ViewMode>("list");
    const [filter, setFilter] = useState({ query: "", category: "all" });
    const [copilotState, setCopilotState] = useState<CopilotState | null>(null);

    return (
        <div className="flex flex-col h-full space-y-8 p-6 md:p-8 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 p-3 rounded-xl border border-purple-500/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                        <Brain className="h-6 w-6 text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight font-[family-name:var(--font-space)] bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                            Knowledge Copilot
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Your self-optimizing cognitive mastery engine.
                        </p>
                    </div>
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-8 text-xs gap-1.5 rounded-lg",
                            viewMode === "list" ? "bg-purple-500/20 text-purple-300" : "text-muted-foreground"
                        )}
                        onClick={() => setViewMode("list")}
                    >
                        <List className="h-3.5 w-3.5" /> List
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-8 text-xs gap-1.5 rounded-lg",
                            viewMode === "graph" ? "bg-purple-500/20 text-purple-300" : "text-muted-foreground"
                        )}
                        onClick={() => setViewMode("graph")}
                    >
                        <Network className="h-3.5 w-3.5" /> Graph
                    </Button>
                </div>
            </div>

            <CopilotRunner onCycleComplete={setCopilotState} />

            {/* Show 4-Week Adaptive Timeline after copilot cycle completes */}
            {copilotState?.adaptiveRoadmap && (
                <AdaptiveTimeline
                    roadmap={copilotState.adaptiveRoadmap}
                    copilotState={copilotState}
                />
            )}

            <Separator className="bg-white/5" />

            {/* §2 Interactive Roadmap (roadmap.sh-style) */}
            <InteractiveRoadmap />

            <Separator className="bg-white/5" />

            {/* §3 AI Resource Recommendations */}
            <ResourceRecommendations />

            <Separator className="bg-white/5" />

            <FileUploader />

            <Separator className="bg-white/5" />

            {viewMode === "list" ? (
                <div className="space-y-4">
                    <KnowledgeSearch onFilterChange={setFilter} />
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-400 drop-shadow-[0_0_4px_rgba(168,85,247,0.5)]" />
                        <h2 className="text-xl font-semibold font-[family-name:var(--font-space)]">Indexed Documents</h2>
                    </div>
                    <KnowledgeList filter={filter} />
                </div>
            ) : (
                <KnowledgeGraph />
            )}
        </div>
    );
}
