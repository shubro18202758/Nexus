"use client";

import { Newspaper, RefreshCw, Zap, Radio, Settings2 } from "lucide-react";
import { motion } from "framer-motion";
import { useDigest } from "@/hooks/use-digest";
import { formatDistanceToNow } from "date-fns";

export function DigestHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
    const { feedItems, activeDomains, isLoading, lastRefreshed, refreshFeed } = useDigest();

    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative"
        >
            {/* Background glow */}
            <div className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[900px] h-[350px] bg-gradient-to-b from-amber-500/8 via-orange-500/5 to-transparent -z-10 blur-3xl rounded-full" />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 p-3.5 rounded-2xl border border-amber-500/20 shadow-[0_0_25px_rgba(245,158,11,0.2)]">
                        <Newspaper className="h-7 w-7 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(245,158,11,0.4)] font-[family-name:var(--font-space)]">
                            DAILY DIGEST
                        </h1>
                        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase flex items-center gap-2 mt-0.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Intel Feed Live // {activeDomains.length} Domains Active
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Stats pills */}
                    <div className="hidden md:flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
                            <Radio className="h-3 w-3 text-amber-400 animate-pulse" />
                            <span className="text-[10px] font-mono font-bold text-amber-300 tracking-wider">
                                {feedItems.length} SIGNALS
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 bg-cyan-500/10 px-3 py-1.5 rounded-full border border-cyan-500/20">
                            <Zap className="h-3 w-3 text-cyan-400" />
                            <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-wider">
                                {activeDomains.length} CHANNELS
                            </span>
                        </div>

                        {lastRefreshed > 0 && (
                            <span className="text-[9px] font-mono text-white/30 tracking-wider">
                                {formatDistanceToNow(new Date(lastRefreshed), { addSuffix: true })}
                            </span>
                        )}
                    </div>

                    {/* Settings button */}
                    <button
                        onClick={onOpenSettings}
                        className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                        <Settings2 className="h-4 w-4 text-white/50 hover:text-white/80" />
                    </button>

                    {/* Refresh button */}
                    <button
                        onClick={() => refreshFeed()}
                        disabled={isLoading}
                        className="h-9 px-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 font-mono text-xs font-bold tracking-wider transition-all hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                        {isLoading ? "SCANNING..." : "REFRESH"}
                    </button>
                </div>
            </div>
        </motion.header>
    );
}
