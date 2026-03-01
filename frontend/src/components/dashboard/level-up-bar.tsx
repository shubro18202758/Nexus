"use client";

import { AuraCard } from "@/components/ui/aura-card";
import { Zap, Crown } from "lucide-react";

export function LevelUpBar() {
    const progress = 75; // Mock progress
    const currentRank = "Cyber Adept";
    const nextRank = "Code Sentinel";
    const currentXP = 2450;
    const nextRankXP = 3000;

    return (
        <AuraCard className="relative overflow-hidden group border-violet-500/20 bg-violet-950/10">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 via-transparent to-cyan-600/5" />

            <div className="flex items-center justify-between mb-2 relative z-10">
                <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                    <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Current Rank</span>
                        <div className="text-lg font-bold text-white tracking-tight text-neon-purple leading-none">{currentRank}</div>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Next Rank</span>
                    <div className="text-sm font-bold text-white/80 leading-none">{nextRank}</div>
                </div>
            </div>

            {/* XP Progress Bar */}
            <div className="relative h-4 bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-1000 ease-out"
                    style={{ width: `${progress}%` }}
                >
                    {/* Animated Shimmer on Bar */}
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                </div>
            </div>

            <div className="flex justify-between mt-1 text-[10px] font-mono text-muted-foreground relative z-10">
                <span>{currentXP} XP</span>
                <span className="text-cyan-400">{nextRankXP - currentXP} XP to Level Up</span>
                <span>{nextRankXP} XP</span>
            </div>
        </AuraCard>
    );
}
