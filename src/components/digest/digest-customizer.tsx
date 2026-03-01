"use client";

import { useState } from "react";
import { X, LayoutGrid, List, Newspaper, Clock, Eye, Video, BarChart3, Bell, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDigest, type LayoutMode, type ContentDensity } from "@/hooks/use-digest";
import { getDomainById, DOMAINS } from "@/lib/digest-domains";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const layoutOptions: { value: LayoutMode; icon: typeof LayoutGrid; label: string }[] = [
    { value: "grid", icon: LayoutGrid, label: "Grid" },
    { value: "list", icon: List, label: "List" },
    { value: "magazine", icon: Newspaper, label: "Magazine" },
];

const densityOptions: { value: ContentDensity; label: string; desc: string }[] = [
    { value: "compact", label: "Compact", desc: "More items, less detail" },
    { value: "comfortable", label: "Comfortable", desc: "Balanced view" },
    { value: "spacious", label: "Spacious", desc: "Rich detail, fewer items" },
];

const refreshOptions = [
    { value: 5, label: "5 min" },
    { value: 15, label: "15 min" },
    { value: 30, label: "30 min" },
    { value: 60, label: "1 hour" },
    { value: 0, label: "Manual" },
];

export function DigestCustomizer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const {
        layout, setLayout,
        contentDensity, setContentDensity,
        refreshInterval, setRefreshInterval,
        showCharts, setShowCharts,
        showVideos, setShowVideos,
        activeDomains,
        domainSettings, updateDomainSettings,
    } = useDigest();

    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-[380px] max-w-[90vw] bg-black/95 border-l border-white/[0.08] backdrop-blur-2xl z-50 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                            <div>
                                <h2 className="text-sm font-bold font-mono tracking-wider text-white">DIGEST SETTINGS</h2>
                                <p className="text-[9px] font-mono text-white/30 tracking-wider uppercase">Customize your intel feed</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <X className="h-4 w-4 text-white/40" />
                            </button>
                        </div>

                        {/* Scrollable content */}
                        <div className="overflow-y-auto h-[calc(100vh-70px)] p-5 space-y-6">
                            {/* Layout */}
                            <section>
                                <h3 className="text-[10px] font-mono font-bold text-amber-400/70 tracking-[0.2em] uppercase mb-3">Layout</h3>
                                <div className="flex gap-2">
                                    {layoutOptions.map(({ value, icon: Icon, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => setLayout(value)}
                                            className={cn(
                                                "flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all",
                                                layout === value
                                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                                    : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.04]"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            <span className="text-[9px] font-mono tracking-wider">{label}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <Separator className="bg-white/[0.04]" />

                            {/* Content Density */}
                            <section>
                                <h3 className="text-[10px] font-mono font-bold text-amber-400/70 tracking-[0.2em] uppercase mb-3">Density</h3>
                                <div className="space-y-2">
                                    {densityOptions.map(({ value, label, desc }) => (
                                        <button
                                            key={value}
                                            onClick={() => setContentDensity(value)}
                                            className={cn(
                                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                                contentDensity === value
                                                    ? "border-amber-500/30 bg-amber-500/5"
                                                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                                            )}
                                        >
                                            <div>
                                                <span className={cn(
                                                    "text-xs font-mono tracking-wider",
                                                    contentDensity === value ? "text-amber-300 font-bold" : "text-white/50"
                                                )}>{label}</span>
                                                <p className="text-[9px] font-mono text-white/20 mt-0.5">{desc}</p>
                                            </div>
                                            {contentDensity === value && (
                                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <Separator className="bg-white/[0.04]" />

                            {/* Refresh Interval */}
                            <section>
                                <h3 className="text-[10px] font-mono font-bold text-amber-400/70 tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5">
                                    <Clock className="h-3 w-3" /> Refresh Interval
                                </h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {refreshOptions.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => setRefreshInterval(value)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-wider border transition-all",
                                                refreshInterval === value
                                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold"
                                                    : "border-white/[0.06] text-white/40 hover:bg-white/[0.04]"
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <Separator className="bg-white/[0.04]" />

                            {/* Toggles */}
                            <section className="space-y-3">
                                <h3 className="text-[10px] font-mono font-bold text-amber-400/70 tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5">
                                    <Eye className="h-3 w-3" /> Visibility
                                </h3>
                                <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
                                        <span className="text-xs font-mono text-white/60">Show Analytics</span>
                                    </div>
                                    <Switch checked={showCharts} onCheckedChange={setShowCharts} />
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                    <div className="flex items-center gap-2">
                                        <Video className="h-3.5 w-3.5 text-red-400" />
                                        <span className="text-xs font-mono text-white/60">Show Videos</span>
                                    </div>
                                    <Switch checked={showVideos} onCheckedChange={setShowVideos} />
                                </div>
                            </section>

                            <Separator className="bg-white/[0.04]" />

                            {/* Per-domain settings */}
                            {activeDomains.length > 0 && (
                                <section>
                                    <h3 className="text-[10px] font-mono font-bold text-amber-400/70 tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5">
                                        <Bell className="h-3 w-3" /> Domain Settings ({activeDomains.length})
                                    </h3>
                                    <div className="space-y-1.5">
                                        {activeDomains.map((id) => {
                                            const domain = getDomainById(id);
                                            if (!domain) return null;
                                            const settings = domainSettings[id] || { freshness: "24h", contentTypes: ["article", "video", "social", "research"], excludeKeywords: [], notifications: false };
                                            const isExpanded = expandedDomain === id;

                                            return (
                                                <div key={id} className="border border-white/[0.06] rounded-xl overflow-hidden">
                                                    <button
                                                        onClick={() => setExpandedDomain(isExpanded ? null : id)}
                                                        className="w-full flex items-center gap-2.5 p-2.5 hover:bg-white/[0.03] transition-all"
                                                    >
                                                        <div
                                                            className="w-3 h-3 rounded-full shrink-0"
                                                            style={{ backgroundColor: domain.accentColor }}
                                                        />
                                                        <span className="text-[10px] font-mono text-white/60 flex-1 text-left truncate">
                                                            {domain.name}
                                                        </span>
                                                        <span className="text-[8px] font-mono text-white/20">{settings.freshness}</span>
                                                    </button>

                                                    <AnimatePresence>
                                                        {isExpanded && (
                                                            <motion.div
                                                                initial={{ height: 0 }}
                                                                animate={{ height: "auto" }}
                                                                exit={{ height: 0 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="p-3 pt-0 space-y-3 border-t border-white/[0.04]">
                                                                    {/* Freshness */}
                                                                    <div>
                                                                        <span className="text-[8px] font-mono text-white/25 tracking-wider">FRESHNESS</span>
                                                                        <div className="flex gap-1 mt-1">
                                                                            {(["1h", "6h", "24h", "7d"] as const).map((f) => (
                                                                                <button
                                                                                    key={f}
                                                                                    onClick={() => updateDomainSettings(id, { freshness: f })}
                                                                                    className={cn(
                                                                                        "px-2 py-0.5 rounded text-[8px] font-mono border transition-all",
                                                                                        settings.freshness === f
                                                                                            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                                                                            : "border-white/[0.06] text-white/30"
                                                                                    )}
                                                                                >
                                                                                    {f}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    {/* Content types */}
                                                                    <div>
                                                                        <span className="text-[8px] font-mono text-white/25 tracking-wider">CONTENT TYPES</span>
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {(["article", "video", "social", "research"] as const).map((t) => {
                                                                                const isActive = settings.contentTypes.includes(t);
                                                                                return (
                                                                                    <button
                                                                                        key={t}
                                                                                        onClick={() => {
                                                                                            const next = isActive
                                                                                                ? settings.contentTypes.filter((ct) => ct !== t)
                                                                                                : [...settings.contentTypes, t];
                                                                                            updateDomainSettings(id, { contentTypes: next });
                                                                                        }}
                                                                                        className={cn(
                                                                                            "px-2 py-0.5 rounded text-[8px] font-mono border transition-all capitalize",
                                                                                            isActive
                                                                                                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                                                                                                : "border-white/[0.06] text-white/25"
                                                                                        )}
                                                                                    >
                                                                                        {t}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>

                                                                    {/* Notifications */}
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[8px] font-mono text-white/25 tracking-wider">NOTIFICATIONS</span>
                                                                        <Switch
                                                                            checked={settings.notifications}
                                                                            onCheckedChange={(v) => updateDomainSettings(id, { notifications: v })}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
