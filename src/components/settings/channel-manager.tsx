"use client";

// ===================================================================
// Channel Manager — Settings UI for mapping WhatsApp/Telegram groups
//
// Lists all auto-discovered channel_settings from the ingestion pipeline.
// Lets the student tag each group as Official Academic, Coding Club,
// Study Group, Spam/Ignore, etc. This directly feeds The Sentinel's
// channel-aware filtering thresholds.
// ===================================================================

import { useState, useEffect, useCallback } from "react";
import {
    Radio, Wifi, WifiOff, RefreshCw, Search,
    Shield, BookOpen, Code2, Users, Ban, HelpCircle,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

// ─── Channel Type Metadata ───────────────────────────────────────

const CHANNEL_TYPES = [
    {
        value: "academic_official",
        label: "Official Academic",
        description: "University announcements, professor channels",
        icon: Shield,
        color: "text-emerald-400",
        badgeClass: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    },
    {
        value: "academic_unofficial",
        label: "Study Group",
        description: "Peer study groups, notes sharing",
        icon: BookOpen,
        color: "text-blue-400",
        badgeClass: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    },
    {
        value: "career",
        label: "Coding Club / Career",
        description: "Hackathons, internships, job boards",
        icon: Code2,
        color: "text-amber-400",
        badgeClass: "border-amber-500/30 text-amber-400 bg-amber-500/10",
    },
    {
        value: "social",
        label: "Spam / Ignore",
        description: "Casual chats, memes — heavily filtered",
        icon: Ban,
        color: "text-red-400",
        badgeClass: "border-red-500/30 text-red-400 bg-red-500/10",
    },
    {
        value: "uncategorized",
        label: "Uncategorized",
        description: "Newly discovered — needs your attention",
        icon: HelpCircle,
        color: "text-zinc-400",
        badgeClass: "border-zinc-500/30 text-zinc-400 bg-zinc-500/10",
    },
] as const;

function getTypeInfo(type: string) {
    return CHANNEL_TYPES.find((t) => t.value === type) ?? CHANNEL_TYPES[4]; // fallback to uncategorized
}

// ─── Types ───────────────────────────────────────────────────────

interface Channel {
    id: string;
    sourceId: string;
    name: string;
    type: string;
    platform: string;
    isActive: boolean;
    createdAt: string;
}

// ─── Component ───────────────────────────────────────────────────

export function ChannelManager() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null); // id of channel being updated
    const [searchQuery, setSearchQuery] = useState("");
    const [error, setError] = useState<string | null>(null);

    // ── Fetch channels ───────────────────────────────────────────
    const fetchChannels = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch("/api/channels");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setChannels(data.channels || []);
        } catch (err) {
            setError("Failed to load channels. Make sure the database is initialized.");
            console.error("[ChannelManager] Fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchChannels();
    }, [fetchChannels]);

    // ── Update channel type ──────────────────────────────────────
    const updateType = async (id: string, type: string) => {
        setUpdating(id);
        try {
            const res = await fetch("/api/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, type }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setChannels((prev) =>
                prev.map((ch) => (ch.id === id ? { ...ch, ...data.channel } : ch))
            );
        } catch (err) {
            console.error("[ChannelManager] Update type error:", err);
        } finally {
            setUpdating(null);
        }
    };

    // ── Toggle active status ─────────────────────────────────────
    const toggleActive = async (id: string, isActive: boolean) => {
        setUpdating(id);
        try {
            const res = await fetch("/api/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, isActive }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setChannels((prev) =>
                prev.map((ch) => (ch.id === id ? { ...ch, ...data.channel } : ch))
            );
        } catch (err) {
            console.error("[ChannelManager] Toggle error:", err);
        } finally {
            setUpdating(null);
        }
    };

    // ── Filter channels by search ────────────────────────────────
    const filtered = channels.filter(
        (ch) =>
            ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ch.platform.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ch.type.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ── Stats ────────────────────────────────────────────────────
    const stats = {
        total: channels.length,
        active: channels.filter((c) => c.isActive).length,
        uncategorized: channels.filter((c) => c.type === "uncategorized").length,
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-violet-500/10 p-2 rounded-lg border border-violet-500/10">
                                <Radio className="h-4 w-4 text-violet-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-xs text-muted-foreground">Total Channels</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/10">
                                <Wifi className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.active}</p>
                                <p className="text-xs text-muted-foreground">Active Listening</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/10">
                                <HelpCircle className="h-4 w-4 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.uncategorized}</p>
                                <p className="text-xs text-muted-foreground">Need Tagging</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Channel Table */}
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">Channel Configuration</CardTitle>
                            <CardDescription>
                                Map your WhatsApp/Telegram groups so the Sentinel knows how to filter them.
                                Official channels get everything captured. Spam gets ignored.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchChannels}
                            disabled={loading}
                            className="border-white/10 hover:bg-white/5"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>

                    {/* Search */}
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search channels by name, platform, or type..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white/5 border-white/10"
                        />
                    </div>
                </CardHeader>

                <CardContent>
                    {error ? (
                        <div className="text-center py-12 text-red-400">
                            <WifiOff className="h-8 w-8 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">{error}</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchChannels}
                                className="mt-3 text-violet-400 hover:text-violet-300"
                            >
                                Try Again
                            </Button>
                        </div>
                    ) : loading ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <RefreshCw className="h-6 w-6 mx-auto mb-3 animate-spin opacity-50" />
                            <p className="text-sm">Loading channels...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Radio className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">
                                {channels.length === 0
                                    ? "No channels discovered yet"
                                    : "No channels match your search"}
                            </p>
                            <p className="text-xs mt-1 opacity-70">
                                {channels.length === 0
                                    ? "Channels appear automatically when messages arrive via the ingestion pipeline."
                                    : "Try a different search term."}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-md border border-white/10 overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-transparent">
                                        <TableHead className="text-muted-foreground">Channel</TableHead>
                                        <TableHead className="text-muted-foreground">Platform</TableHead>
                                        <TableHead className="text-muted-foreground">Category</TableHead>
                                        <TableHead className="text-muted-foreground text-center">Active</TableHead>
                                        <TableHead className="text-muted-foreground text-right">Discovered</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((ch) => {
                                        const info = getTypeInfo(ch.type);
                                        const IconComponent = info.icon;
                                        const isUpdating = updating === ch.id;

                                        return (
                                            <TableRow
                                                key={ch.id}
                                                className={`border-white/10 transition-opacity ${
                                                    isUpdating ? "opacity-60" : ""
                                                } ${!ch.isActive ? "opacity-50" : ""}`}
                                            >
                                                {/* Channel Name */}
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`${info.color}`}>
                                                            <IconComponent className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm">
                                                                {ch.name}
                                                            </p>
                                                            <p className="text-[10px] text-muted-foreground font-mono">
                                                                {ch.sourceId}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </TableCell>

                                                {/* Platform */}
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            ch.platform === "WhatsApp"
                                                                ? "border-green-500/30 text-green-400 bg-green-500/10"
                                                                : "border-sky-500/30 text-sky-400 bg-sky-500/10"
                                                        }
                                                    >
                                                        {ch.platform}
                                                    </Badge>
                                                </TableCell>

                                                {/* Category Dropdown */}
                                                <TableCell>
                                                    <Select
                                                        value={ch.type}
                                                        onValueChange={(val) => updateType(ch.id, val)}
                                                        disabled={isUpdating}
                                                    >
                                                        <SelectTrigger className="w-[200px] bg-white/5 border-white/10 h-9 text-sm">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {CHANNEL_TYPES.map((ct) => {
                                                                const CtIcon = ct.icon;
                                                                return (
                                                                    <SelectItem
                                                                        key={ct.value}
                                                                        value={ct.value}
                                                                    >
                                                                        <span className="flex items-center gap-2">
                                                                            <CtIcon className={`h-3.5 w-3.5 ${ct.color}`} />
                                                                            <span>{ct.label}</span>
                                                                        </span>
                                                                    </SelectItem>
                                                                );
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>

                                                {/* Active Toggle */}
                                                <TableCell className="text-center">
                                                    <Switch
                                                        checked={ch.isActive}
                                                        onCheckedChange={(val) =>
                                                            toggleActive(ch.id, val)
                                                        }
                                                        disabled={isUpdating}
                                                    />
                                                </TableCell>

                                                {/* Discovered Date */}
                                                <TableCell className="text-right text-xs text-muted-foreground">
                                                    {new Date(ch.createdAt).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        }
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* How It Works */}
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-sm">How Channel Mapping Works</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {CHANNEL_TYPES.filter((t) => t.value !== "uncategorized").map(
                            (ct) => {
                                const CtIcon = ct.icon;
                                return (
                                    <div
                                        key={ct.value}
                                        className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                                    >
                                        <CtIcon className={`h-4 w-4 mt-0.5 ${ct.color}`} />
                                        <div>
                                            <p className="font-medium">{ct.label}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {ct.description}
                                            </p>
                                        </div>
                                    </div>
                                );
                            }
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
