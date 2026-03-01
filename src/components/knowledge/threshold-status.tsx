
"use client";

import { useState, useEffect } from "react";
import { type ThresholdResult } from "@/lib/ai/threshold-detector";
import { checkThreshold } from "@/app/actions/plan-actions";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, Zap, BookOpen, GitGraph, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function ThresholdStatus({
    masteryDepth,
    implementationScore,
    velocityStatus,
    dependenciesSatisfied,
}: {
    masteryDepth?: number;
    implementationScore?: number;
    velocityStatus?: "stable" | "volatile" | "unknown";
    dependenciesSatisfied?: boolean;
}) {
    const [status, setStatus] = useState<ThresholdResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleCheck = async () => {
        setIsLoading(true);
        try {
            // Use real copilot-derived scores when available, sensible defaults otherwise
            const inputs = {
                masteryDepth: masteryDepth ?? 0,
                implementationScore: implementationScore ?? 0,
                velocityStatus: (velocityStatus === "stable" || velocityStatus === "volatile") ? velocityStatus : "stable" as const,
                dependenciesSatisfied: dependenciesSatisfied ?? false,
            };

            // Run real AI threshold detection via on-device LLM
            const detector = await import("@/lib/ai/threshold-detector");
            const result = await detector.detectThreshold(
                inputs.masteryDepth,
                inputs.implementationScore,
                inputs.velocityStatus,
                inputs.dependenciesSatisfied
            );

            setStatus(result);

            if (result.advanced_unlocked) {
                toast.success(`Advanced Mode Unlocked: ${result.new_learning_tier}`);
            } else {
                toast.info("Keep pushing — advanced mode not yet unlocked.");
            }

            // Persist threshold check on server
            await checkThreshold(inputs);

        } catch (error) {
            console.error(error);
            toast.error("Failed to check threshold");
        } finally {
            setIsLoading(false);
        }
    };

    if (!status) {
        return (
            <div className="flex items-center gap-2">
                <HoverCard>
                    <HoverCardTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="bg-black/40 border border-white/5 text-white/40 hover:text-white hover:bg-white/5 h-8 text-xs"
                            onClick={handleCheck}
                            disabled={isLoading}
                        >
                            {isLoading ? <Zap className="h-3 w-3 animate-pulse mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                            Advanced Mode: Locked
                        </Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 bg-black/95 border-red-900/40 text-white">
                        <div className="flex justify-between space-x-4">
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-red-400">Restricted Access</h4>
                                <p className="text-xs text-white/60">
                                    Advanced research papers and FAANG-level system design challenges are locked until you meet mastery thresholds.
                                </p>
                                <div className="flex items-center pt-2">
                                    <span className="text-xs text-muted-foreground">Required Mastery: &gt;80%</span>
                                </div>
                            </div>
                        </div>
                    </HoverCardContent>
                </HoverCard>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-top-2">
            <HoverCard>
                <HoverCardTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-purple-950/20 border-purple-500/30 text-purple-300 hover:bg-purple-950/40 h-8 text-xs group"
                    >
                        <Unlock className="h-3 w-3 mr-1 group-hover:text-purple-200" />
                        {status.new_learning_tier} Unlocked
                    </Button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80 bg-black/95 border-purple-500/30 text-white">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-purple-400">Advanced Privileges</h4>
                            <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-[10px]">
                                {status.challenge_level.toUpperCase()} INTENSITY
                            </Badge>
                        </div>

                        <div className="space-y-2">
                            {status.recommended_advanced_resources.map((res, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-white/70 bg-purple-500/5 p-2 rounded border border-purple-500/10">
                                    {res.includes("Paper") ? <BookOpen className="h-3 w-3 mt-0.5 text-blue-400" /> :
                                        res.includes("OSS") ? <GitGraph className="h-3 w-3 mt-0.5 text-emerald-400" /> :
                                            <ShieldAlert className="h-3 w-3 mt-0.5 text-amber-400" />}
                                    <span>{res}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </HoverCardContent>
            </HoverCard>
        </div>
    );
}
