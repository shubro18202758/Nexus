"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    SlidersHorizontal,
    X,
    MapPin,
    Calendar,
    Trophy,
    Users,
    Sparkles,
    Filter,
    RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchFilters } from "@/lib/events/research-engine";

// ─── Constants ───────────────────────────────────────────────────

const EVENT_TYPES = [
    { value: "hackathon", label: "Hackathons", icon: "🏆" },
    { value: "coding-contest", label: "Coding Contests", icon: "💻" },
    { value: "networking", label: "Networking Events", icon: "🤝" },
    { value: "startup-pitch", label: "Startup Pitching", icon: "🚀" },
    { value: "speaker-session", label: "Speaker Sessions", icon: "🎤" },
    { value: "workshop", label: "Workshops", icon: "🔧" },
    { value: "conference", label: "Conferences", icon: "🎪" },
    { value: "meetup", label: "Meetups", icon: "👥" },
];

const THEMES = [
    "AI / ML", "Web Development", "Blockchain / Web3", "Cybersecurity",
    "Cloud Computing", "Mobile Dev", "Data Science", "IoT",
    "Game Dev", "Open Source", "FinTech", "HealthTech",
    "EdTech", "Sustainability", "Robotics", "AR / VR",
];

const LOCATIONS = [
    "Virtual / Online",
    "India",
    "USA",
    "Europe",
    "Asia",
    "Global",
];

interface ResearchFiltersProps {
    filters: ResearchFilters;
    onFiltersChange: (filters: ResearchFilters) => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export function ResearchFiltersPanel({
    filters,
    onFiltersChange,
    isCollapsed = true,
    onToggleCollapse,
}: ResearchFiltersProps) {
    const [localFilters, setLocalFilters] = useState<ResearchFilters>(filters);

    const updateFilter = <K extends keyof ResearchFilters>(key: K, value: ResearchFilters[K]) => {
        const updated = { ...localFilters, [key]: value };
        setLocalFilters(updated);
        onFiltersChange(updated);
    };

    const toggleEventType = (type: string) => {
        const current = localFilters.eventType || [];
        const updated = current.includes(type)
            ? current.filter(t => t !== type)
            : [...current, type];
        updateFilter("eventType", updated.length > 0 ? updated : undefined);
    };

    const toggleTheme = (theme: string) => {
        const current = localFilters.themes || [];
        const updated = current.includes(theme)
            ? current.filter(t => t !== theme)
            : [...current, theme];
        updateFilter("themes", updated.length > 0 ? updated : undefined);
    };

    const resetFilters = () => {
        const empty: ResearchFilters = {};
        setLocalFilters(empty);
        onFiltersChange(empty);
    };

    const activeCount = Object.values(localFilters).filter(
        v => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
    ).length;

    return (
        <div className="space-y-3">
            {/* Toggle button */}
            <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCollapse}
                className={cn(
                    "w-full justify-between h-9 px-4 rounded-lg font-mono text-xs tracking-wide transition-all",
                    !isCollapsed
                        ? "bg-violet-500/10 text-violet-300 border-2 border-violet-500/25"
                        : "bg-white/5 text-white/65 border-2 border-white/10 hover:bg-white/10 hover:text-white/80",
                )}
            >
                <span className="flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    MANUAL FILTERS
                    {activeCount > 0 && (
                        <Badge className="h-4 px-1.5 text-[9px] bg-violet-500/30 text-violet-300 border-0">
                            {activeCount}
                        </Badge>
                    )}
                </span>
                <span className="text-[10px] text-white/50 font-semibold">{isCollapsed ? "EXPAND" : "COLLAPSE"}</span>
            </Button>

            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-5 p-5 rounded-xl bg-black/40 border-2 border-white/10 backdrop-blur-xl">
                            {/* Event Types */}
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-white/75 uppercase tracking-wider flex items-center gap-1.5">
                                    <Filter className="w-3 h-3 text-violet-400" /> Event Type
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                    {EVENT_TYPES.map(({ value, label, icon }) => {
                                        const active = localFilters.eventType?.includes(value);
                                        return (
                                            <button
                                                key={value}
                                                onClick={() => toggleEventType(value)}
                                                className={cn(
                                                    "text-xs px-3 py-1.5 rounded-lg border font-mono transition-all",
                                                    active
                                                        ? "bg-violet-500/20 text-violet-300 border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.15)]"
                                                        : "bg-white/5 text-white/60 border-white/12 hover:bg-white/10 hover:text-white/80",
                                                )}
                                            >
                                                {icon} {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Themes */}
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-white/75 uppercase tracking-wider flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3 text-cyan-400" /> Themes / Domains
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {THEMES.map((theme) => {
                                        const active = localFilters.themes?.includes(theme);
                                        return (
                                            <button
                                                key={theme}
                                                onClick={() => toggleTheme(theme)}
                                                className={cn(
                                                    "text-[11px] px-2.5 py-1 rounded-full border font-mono transition-all",
                                                    active
                                                        ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                                                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/75",
                                                )}
                                            >
                                                {theme}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Location + Date Row */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Location */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono text-white/75 uppercase tracking-wider flex items-center gap-1.5">
                                        <MapPin className="w-3 h-3 text-red-400" /> Location
                                    </Label>
                                    <Select
                                        value={localFilters.location || ""}
                                        onValueChange={(v) => updateFilter("location", v || undefined)}
                                    >
                                        <SelectTrigger className="h-9 bg-white/5 border-2 border-white/12 text-white/80 text-xs font-mono">
                                            <SelectValue placeholder="Any location" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="any">Any location</SelectItem>
                                            {LOCATIONS.map(loc => (
                                                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Prize Pool Min */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono text-white/75 uppercase tracking-wider flex items-center gap-1.5">
                                        <Trophy className="w-3 h-3 text-amber-400" /> Min Prize Pool
                                    </Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 1000"
                                        value={localFilters.prizePool?.min || ""}
                                        onChange={(e) => {
                                            const val = e.target.value ? Number(e.target.value) : undefined;
                                            updateFilter("prizePool", val ? { min: val, currency: "USD" } : undefined);
                                        }}
                                        className="h-9 bg-white/5 border-2 border-white/12 text-white/80 text-xs font-mono"
                                    />
                                </div>
                            </div>

                            {/* Team Size + Eligibility Row */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Team Size */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono text-white/75 uppercase tracking-wider flex items-center gap-1.5">
                                        <Users className="w-3 h-3 text-violet-400" /> Team Size
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="number"
                                            placeholder="Min"
                                            value={localFilters.teamSize?.min || ""}
                                            onChange={(e) => {
                                                const val = e.target.value ? Number(e.target.value) : undefined;
                                                updateFilter("teamSize", val ? { min: val, max: localFilters.teamSize?.max } : undefined);
                                            }}
                                            className="h-9 bg-white/5 border-2 border-white/12 text-white/80 text-xs font-mono"
                                        />
                                        <Input
                                            type="number"
                                            placeholder="Max"
                                            value={localFilters.teamSize?.max || ""}
                                            onChange={(e) => {
                                                const val = e.target.value ? Number(e.target.value) : undefined;
                                                updateFilter("teamSize", { min: localFilters.teamSize?.min, max: val });
                                            }}
                                            className="h-9 bg-white/5 border-2 border-white/12 text-white/80 text-xs font-mono"
                                        />
                                    </div>
                                </div>

                                {/* Eligibility */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-mono text-white/75 uppercase tracking-wider flex items-center gap-1.5">
                                        <Calendar className="w-3 h-3 text-cyan-400" /> Eligibility
                                    </Label>
                                    <Select
                                        value={localFilters.eligibility || ""}
                                        onValueChange={(v) => updateFilter("eligibility", v || undefined)}
                                    >
                                        <SelectTrigger className="h-9 bg-white/5 border-2 border-white/12 text-white/80 text-xs font-mono">
                                            <SelectValue placeholder="Any" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="any">Any</SelectItem>
                                            <SelectItem value="college students">College Students</SelectItem>
                                            <SelectItem value="open to all">Open to All</SelectItem>
                                            <SelectItem value="professionals">Professionals</SelectItem>
                                            <SelectItem value="beginners">Beginners</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Free Only Toggle + Reset */}
                            <div className="flex items-center justify-between pt-3 border-t border-white/10">
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={localFilters.freeOnly || false}
                                        onCheckedChange={(checked) => updateFilter("freeOnly", checked || undefined)}
                                    />
                                    <Label className="text-xs text-white/70 font-mono font-medium">Free events only</Label>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetFilters}
                                    className="h-7 text-xs text-white/55 hover:text-red-400 hover:bg-red-500/10 font-mono font-semibold"
                                >
                                    <RotateCcw className="w-3 h-3 mr-1" />
                                    Reset All
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
