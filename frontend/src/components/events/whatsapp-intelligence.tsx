"use client";

// ===================================================================
// WhatsApp Intelligence Panel — AUTONOMOUS NanoClaw Intelligence v2
//
// ENHANCED architecture with tabbed interface:
//   1. Credential Manager — one-time QR scan, persistent session
//   2. Command Center Tab — scanner controls, stats, group config
//   3. Live Stream Tab — real-time message feed with search/sort/bookmarks
//   4. Intelligence Tab — auto-detected events, plans, analytics
//   5. Manual NanoClaw Filter — collapsible advanced section
//
// ZERO manual work after initial WhatsApp link.
// ===================================================================

import {
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Loader2, Wifi, WifiOff, QrCode, MessageCircle, Search, Zap,
    Calendar, Brain, ArrowRight, RefreshCw, Trash2, ChevronDown,
    ChevronUp, ExternalLink, MapPin, Clock, AlertTriangle,
    Play, Pause, Square, Eye, Settings2, Shield, Radio,
    Activity, BarChart3, Scan, CheckCircle2, Power,
    Bookmark, BookmarkCheck, SortAsc, SortDesc, Filter,
    Star, Hash, TrendingUp, Timer, Sparkles, ArrowUpDown,
    X, Plus, Save, Tag, Copy, Users,
    FileText, Image, Link2, Globe, Flame, Target, Layers,
    PieChart, BarChart2, Gauge, Cpu, Radar, Hexagon,
    Crown, Medal, Crosshair,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
    useMessageStore,
    type WAMessage,
    type WAStatus,
    type ScannerStatus,
    type GroupClassification,
    type GroupConfig,
    type ScanResult,
} from "@/hooks/use-message-store";
import type { DetectedEvent, MsgFilterIntent, MsgFilterResult, StudentLifeCategory } from "@/lib/msg/msg-filter-engine";

// ─── Category Colours ──────

const CATEGORY_COLORS: Record<string, string> = {
    academic: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    placement: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    scholarship: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    hackathon: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    "club-event": "bg-pink-500/20 text-pink-300 border-pink-500/30",
    hostel: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    administrative: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    research: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    extracurricular: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    networking: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    deadline: "bg-red-500/20 text-red-300 border-red-500/30",
    exam: "bg-red-500/20 text-red-300 border-red-500/30",
    assignment: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    workshop: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    contest: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
    internship: "bg-lime-500/20 text-lime-300 border-lime-500/30",
    social: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    general: "bg-gray-500/20 text-gray-300 border-gray-500/30",
    noise: "bg-zinc-500/20 text-zinc-400 border-zinc-500/20",
};

const CATEGORY_ICONS: Record<string, string> = {
    academic: "📚", placement: "💼", scholarship: "🎓", hackathon: "🚀",
    "club-event": "🎪", hostel: "🏠", administrative: "📋", research: "🔬",
    extracurricular: "🎯", networking: "🤝", deadline: "⏰", exam: "📝",
    assignment: "📄", workshop: "🔧", contest: "🏆", internship: "💡",
    social: "🎉", general: "📌", noise: "🔇",
};

function categoryColor(cat: string | null): string {
    return CATEGORY_COLORS[cat || "general"] || CATEGORY_COLORS.general;
}

const GROUP_COLORS: Record<GroupClassification, string> = {
    academic: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    "non-academic": "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
    monitored: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    unclassified: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ─── Status Indicators ────

function SessionDot({ status }: { status: WAStatus }) {
    const c: Record<WAStatus, string> = {
        disconnected: "bg-zinc-500",
        qr_pending: "bg-amber-500 animate-pulse",
        authenticating: "bg-amber-400 animate-pulse",
        ready: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
        error: "bg-red-500",
    };
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${c[status]}`} />;
}

function ScannerDot({ status }: { status: ScannerStatus }) {
    const c: Record<ScannerStatus, string> = {
        idle: "bg-zinc-500",
        running: "bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]",
        scanning: "bg-violet-500 animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.6)]",
        paused: "bg-amber-500",
        error: "bg-red-500",
    };
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${c[status]}`} />;
}

function scannerLabel(s: ScannerStatus): string {
    return { idle: "IDLE", running: "ACTIVE", scanning: "SCANNING...", paused: "PAUSED", error: "ERROR" }[s];
}

// ─── Time Helpers ────

function relTime(ts: number | null): string {
    if (!ts) return "—";
    const d = Date.now() - ts;
    if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
    if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
}

function duration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Animated Counter ────

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
    const [display, setDisplay] = useState(value);
    useEffect(() => {
        if (display === value) return;
        const step = value > display ? 1 : -1;
        const timer = setInterval(() => {
            setDisplay((prev) => {
                if (prev === value) { clearInterval(timer); return prev; }
                const diff = Math.abs(value - prev);
                const inc = Math.max(1, Math.floor(diff / 8));
                const next = prev + step * inc;
                return step > 0 ? Math.min(next, value) : Math.max(next, value);
            });
        }, 30);
        return () => clearInterval(timer);
    }, [value, display]);
    return <span className={className}>{display}</span>;
}

// ───────────────────────────────────────────────────────────────────
// 1. CREDENTIAL MANAGER — One-time WhatsApp Link
// ───────────────────────────────────────────────────────────────────

function CredentialManager() {
    const { session, isConnecting, connect, disconnect, refreshStatus } = useMessageStore();

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    useEffect(() => {
        if (session.status === "qr_pending" || session.status === "authenticating") {
            const interval = setInterval(() => refreshStatus(), 2000);
            return () => clearInterval(interval);
        }
    }, [session.status, refreshStatus]);

    const showQR = session.status === "qr_pending" && (session.qrDataUrl || session.qrCode);

    if (session.status === "ready") {
        return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/5 via-emerald-500/8 to-cyan-500/5 border border-emerald-500/20 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                    <div className="relative">
                        <SessionDot status="ready" />
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-[0.2em]">
                            WHATSAPP LINKED
                        </span>
                        {session.connectedPhone && (
                            <span className="text-[9px] font-mono text-emerald-400/50">
                                +{session.connectedPhone}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.08] border border-white/10">
                            <MessageCircle className="h-3 w-3 text-blue-400" />
                            <AnimatedNumber value={session.messageCount} className="text-blue-400 font-bold" />
                            <span className="text-muted-foreground/80">msgs</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.08] border border-white/10">
                            <Users className="h-3 w-3 text-violet-400" />
                            <AnimatedNumber value={session.groupCount} className="text-violet-400 font-bold" />
                            <span className="text-muted-foreground/80">groups</span>
                        </div>
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => disconnect()}
                                    className="text-red-400/40 hover:text-red-300 hover:bg-red-500/10 text-[10px] h-7 px-2 rounded-lg"
                                >
                                    <WifiOff className="h-3 w-3" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="text-xs">Unlink WhatsApp</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-4 py-8 px-4 rounded-xl bg-gradient-to-b from-white/[0.02] to-transparent border border-white/10">
            <div className="flex items-center gap-2">
                <SessionDot status={session.status} />
                <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
                    {session.status === "disconnected"
                        ? "LINK YOUR WHATSAPP"
                        : session.status === "qr_pending"
                            ? "SCAN QR CODE"
                            : session.status === "authenticating"
                                ? "AUTHENTICATING..."
                                : "ERROR"}
                </span>
            </div>

            {showQR && (
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-4 bg-white rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.15)]"
                >
                    <img
                        src={session.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(session.qrCode || "")}`}
                        alt="WhatsApp QR Code"
                        className="w-52 h-52"
                    />
                </motion.div>
            )}

            {session.status === "authenticating" && !showQR && (
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin h-6 w-6 text-amber-400" />
                    <p className="text-xs text-muted-foreground font-mono text-center">
                        Launching headless browser... QR will appear shortly
                    </p>
                </div>
            )}

            {session.status === "disconnected" && (
                <>
                    <p className="text-xs text-muted-foreground/80 font-mono text-center max-w-sm leading-relaxed">
                        Link once — NanoClaw will autonomously intercept all group messages,
                        detect events, and generate adaptive plans. Zero manual work.
                    </p>
                    <Button
                        onClick={() => connect()}
                        disabled={isConnecting}
                        className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-full px-8 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                    >
                        {isConnecting ? (
                            <Loader2 className="animate-spin h-4 w-4 mr-2" />
                        ) : (
                            <QrCode className="h-4 w-4 mr-2" />
                        )}
                        Link WhatsApp
                    </Button>
                </>
            )}

            {session.status === "qr_pending" && (
                <p className="text-xs text-muted-foreground font-mono text-center max-w-xs">
                    Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Scan this QR code
                </p>
            )}

            {session.error && (
                <div className="flex flex-col items-center gap-3 mt-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <p className="text-xs text-red-400 font-mono">{session.error}</p>
                    </div>
                    {session.error.includes("retrying") ? (
                        <div className="flex items-center gap-2 text-xs text-amber-400/70 font-mono">
                            <Loader2 className="animate-spin h-3 w-3" />
                            Auto-recovering...
                        </div>
                    ) : session.status === "error" ? (
                        <Button
                            onClick={() => { disconnect().then(() => connect()); }}
                            disabled={isConnecting}
                            className="bg-red-600/80 hover:bg-red-500 text-white text-[11px] h-8 px-5 rounded-full"
                        >
                            {isConnecting ? (
                                <Loader2 className="animate-spin h-3 w-3 mr-1.5" />
                            ) : (
                                <RefreshCw className="h-3 w-3 mr-1.5" />
                            )}
                            Retry Connection
                        </Button>
                    ) : null}
                </div>
            )}
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────
// 2. SCANNER DASHBOARD — Enhanced with progress + live metrics
// ───────────────────────────────────────────────────────────────────

function ScannerDashboard() {
    const {
        scanner,
        isStartingScanner,
        startAutoScan,
        stopAutoScan,
        pauseAutoScan,
        resumeAutoScan,
        forceScan,
        refreshScannerStats,
        syncGroups,
        session,
    } = useMessageStore();

    const isLinked = session.status === "ready";
    const isRunning = scanner.status === "running" || scanner.status === "scanning";
    const isPaused = scanner.status === "paused";

    // Calculate progress for scanning animation
    const scanProgress = scanner.status === "scanning" ? 65 : isRunning ? 100 : isPaused ? 50 : 0;

    return (
        <div className="space-y-3">
            {/* Scanner Status + Controls Header */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-white/[0.02] via-cyan-500/[0.03] to-white/[0.02] border border-white/10">
                <div className="relative">
                    <ScannerDot status={scanner.status} />
                    {isRunning && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-black tracking-[0.2em] bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]">
                        NanoClaw Scanner
                    </span>
                    <span className={`text-[9px] font-mono tracking-wider ${
                        isRunning ? "text-cyan-400" : isPaused ? "text-amber-400" : "text-muted-foreground/80"
                    }`}>
                        {scannerLabel(scanner.status)}
                    </span>
                </div>
                <div className="flex-1" />

                {/* Controls */}
                <div className="flex items-center gap-1">
                    {scanner.status === "idle" && (
                        <Button
                            size="sm"
                            onClick={() => startAutoScan()}
                            disabled={!isLinked || isStartingScanner}
                            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] h-7 px-3 rounded-full shadow-cyan-500/20 shadow-lg"
                        >
                            {isStartingScanner ? (
                                <Loader2 className="animate-spin h-3 w-3 mr-1" />
                            ) : (
                                <Play className="h-3 w-3 mr-1" />
                            )}
                            Start
                        </Button>
                    )}
                    {isRunning && (
                        <>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => pauseAutoScan()}
                                            className="text-amber-400 hover:bg-amber-500/10 h-7 w-7 p-0 rounded-lg"
                                        >
                                            <Pause className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-xs">Pause Scanner</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => stopAutoScan()}
                                            className="text-red-400 hover:bg-red-500/10 h-7 w-7 p-0 rounded-lg"
                                        >
                                            <Square className="h-3 w-3" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p className="text-xs">Stop Scanner</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </>
                    )}
                    {isPaused && (
                        <>
                            <Button
                                size="sm"
                                onClick={() => resumeAutoScan()}
                                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] h-7 px-3 rounded-full"
                            >
                                <Play className="h-3 w-3 mr-1" />
                                Resume
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => stopAutoScan()}
                                className="text-red-400 hover:bg-red-500/10 h-7 w-7 p-0 rounded-lg"
                            >
                                <Square className="h-3 w-3" />
                            </Button>
                        </>
                    )}

                    {(isRunning || isPaused) && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => forceScan()}
                                        disabled={scanner.status === "scanning"}
                                        className="text-violet-400 hover:bg-violet-500/10 h-7 w-7 p-0 rounded-lg"
                                    >
                                        <Scan className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p className="text-xs">Force Scan Now</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => refreshScannerStats()}
                        className="text-muted-foreground hover:text-foreground h-7 w-7 p-0 rounded-lg"
                    >
                        <RefreshCw className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Live scanning progress bar */}
            {scanner.status === "scanning" && (
                <div className="px-1">
                    <div className="h-1 rounded-full bg-violet-500/10 overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-full"
                            initial={{ x: "-100%" }}
                            animate={{ x: "100%" }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            style={{ width: "40%" }}
                        />
                    </div>
                </div>
            )}

            {/* Stats Grid — Enhanced with icons + animated counters */}
            {(isRunning || isPaused || scanner.totalScans > 0) && (
                <div className="grid grid-cols-5 gap-2">
                    <EnhancedStatCard
                        icon={<Scan className="h-3.5 w-3.5" />}
                        label="Scans"
                        value={scanner.totalScans}
                        color="cyan"
                    />
                    <EnhancedStatCard
                        icon={<MessageCircle className="h-3.5 w-3.5" />}
                        label="Processed"
                        value={scanner.totalMessagesProcessed}
                        color="blue"
                    />
                    <EnhancedStatCard
                        icon={<Zap className="h-3.5 w-3.5" />}
                        label="Events"
                        value={scanner.totalEventsDetected}
                        color="violet"
                    />
                    <EnhancedStatCard
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        label="Pinned"
                        value={scanner.totalEventsPinned}
                        color="emerald"
                    />
                    <EnhancedStatCard
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        label="Plans"
                        value={scanner.totalPlansGenerated}
                        color="amber"
                    />
                </div>
            )}

            {/* Scan Timing Row */}
            {isRunning && (
                <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-white/[0.04] text-[10px] font-mono text-muted-foreground/80">
                    <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        Last: {relTime(scanner.lastScanAt)}
                    </span>
                    <span className="flex items-center gap-1">
                        <Timer className="h-2.5 w-2.5" />
                        Interval: {Math.round(scanner.scanIntervalMs / 60000)}min
                    </span>
                    {scanner.startedAt && (
                        <span className="flex items-center gap-1">
                            <TrendingUp className="h-2.5 w-2.5" />
                            Uptime: {duration(Date.now() - scanner.startedAt)}
                        </span>
                    )}
                </div>
            )}

            {scanner.error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] text-red-400 font-mono">{scanner.error}</span>
                </div>
            )}
        </div>
    );
}

function EnhancedStatCard({
    icon, label, value, color,
}: {
    icon: React.ReactNode; label: string; value: number; color: string;
}) {
    const colorMap: Record<string, string> = {
        cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
        violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
        emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    };
    const textColorMap: Record<string, string> = {
        cyan: "text-cyan-400", blue: "text-blue-400", violet: "text-violet-400",
        emerald: "text-emerald-400", amber: "text-amber-400",
    };
    return (
        <div className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border ${colorMap[color]} transition-all hover:scale-[1.02]`}>
            <div className={`${textColorMap[color]} opacity-80`}>{icon}</div>
            <AnimatedNumber value={value} className={`text-lg font-bold tabular-nums ${textColorMap[color]}`} />
            <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-[0.15em]">
                {label}
            </span>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────
// 2.5 STREAM ANALYTICS DASHBOARD — SVG Charts + Data Viz
// ───────────────────────────────────────────────────────────────────

function ActivityHeatmap({ messages }: { messages: WAMessage[] }) {
    const hourlyData = useMemo(() => {
        const hours = Array(24).fill(0);
        messages.forEach(m => {
            const h = new Date(m.timestamp).getHours();
            hours[h]++;
        });
        return hours;
    }, [messages]);

    const maxVal = Math.max(...hourlyData, 1);

    if (messages.length < 3) return null;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-cyan-950/30 to-purple-950/30 border border-cyan-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(6,182,212,0.15)]">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-500/30 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <Activity className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                    ACTIVITY HEATMAP
                </span>
                <div className="flex-1" />
                <span className="text-[10px] font-mono text-white/60">24h pulse</span>
            </div>
            <div className="flex gap-[3px] items-end h-24">
                {hourlyData.map((count, hour) => {
                    const intensity = count / maxVal;
                    const heightPct = Math.max(8, intensity * 100);
                    return (
                        <TooltipProvider key={hour}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${heightPct}%` }}
                                        transition={{ delay: hour * 0.02, type: "spring", damping: 15 }}
                                        className={`flex-1 rounded-t-sm cursor-pointer transition-all hover:brightness-125 ${
                                            intensity === 0 ? "bg-white/[0.04]"
                                            : intensity < 0.25 ? "bg-cyan-500/25"
                                            : intensity < 0.5 ? "bg-cyan-500/45 shadow-[0_0_4px_rgba(6,182,212,0.2)]"
                                            : intensity < 0.75 ? "bg-gradient-to-t from-cyan-500/60 to-blue-400/60 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
                                            : "bg-gradient-to-t from-cyan-400 to-blue-400 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                                        }`}
                                    />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    <p className="text-[10px] font-mono font-bold">{hour}:00 — {count} msgs</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-white/50">
                <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>11PM</span>
            </div>
        </div>
    );
}

function GroupDistributionRing({ messages }: { messages: WAMessage[] }) {
    const groupData = useMemo(() => {
        const counts: Record<string, number> = {};
        messages.forEach(m => {
            const name = m.chatName || "Unknown";
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [messages]);

    const total = groupData.reduce((s, [, c]) => s + c, 0);
    const ringColors = [
        "rgba(6,182,212,0.9)", "rgba(139,92,246,0.9)", "rgba(16,185,129,0.9)",
        "rgba(245,158,11,0.9)", "rgba(244,63,94,0.9)", "rgba(99,102,241,0.9)",
    ];
    const chipColors = [
        "text-cyan-400 bg-cyan-500/15 border-cyan-500/25",
        "text-violet-400 bg-violet-500/15 border-violet-500/25",
        "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
        "text-amber-400 bg-amber-500/15 border-amber-500/25",
        "text-rose-400 bg-rose-500/15 border-rose-500/25",
        "text-indigo-400 bg-indigo-500/15 border-indigo-500/25",
    ];

    // Build conic-gradient
    let gradientParts: string[] = [];
    let cumPct = 0;
    groupData.forEach(([, count], i) => {
        const pct = (count / total) * 100;
        gradientParts.push(`${ringColors[i]} ${cumPct}% ${cumPct + pct}%`);
        cumPct += pct;
    });
    if (cumPct < 100) gradientParts.push(`rgba(255,255,255,0.04) ${cumPct}% 100%`);
    const conicGradient = `conic-gradient(from 0deg, ${gradientParts.join(", ")})`;

    if (groupData.length < 2) return null;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-violet-950/30 to-cyan-950/30 border border-violet-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(139,92,246,0.15)]">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/30 border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.3)]">
                    <PieChart className="h-4 w-4 text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-violet-300 to-purple-300 bg-clip-text text-transparent">
                    GROUP DISTRO
                </span>
            </div>

            <div className="flex items-center gap-4">
                {/* Ring chart */}
                <div className="relative w-28 h-28 shrink-0">
                    <div
                        className="w-full h-full rounded-full shadow-[0_0_30px_rgba(139,92,246,0.3)]"
                        style={{ background: conicGradient }}
                    />
                    <div className="absolute inset-3 rounded-full bg-black/80 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-center">
                            <span className="text-2xl font-black text-white tabular-nums">{groupData.length}</span>
                            <span className="block text-[9px] font-mono text-white/60 -mt-0.5">GROUPS</span>
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex-1 space-y-1 min-w-0">
                    {groupData.map(([name, count], i) => (
                        <div key={name} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[0_0_6px_rgba(255,255,255,0.15)]" style={{ backgroundColor: ringColors[i] }} />
                            <span className="text-[11px] font-mono text-white/80 truncate flex-1">{name}</span>
                            <span className="text-[11px] font-mono font-bold text-white/60 tabular-nums shrink-0">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function MessageVolumeSparkline({ messages }: { messages: WAMessage[] }) {
    const sparkData = useMemo(() => {
        if (messages.length < 5) return [];
        // Group by 10-minute intervals over the last 4 hours
        const now = Date.now();
        const fourHoursAgo = now - 4 * 60 * 60 * 1000;
        const relevant = messages.filter(m => m.timestamp >= fourHoursAgo);
        const buckets = Array(24).fill(0); // 24 ten-minute buckets
        relevant.forEach(m => {
            const mins = Math.floor((m.timestamp - fourHoursAgo) / (600_000));
            if (mins >= 0 && mins < 24) buckets[mins]++;
        });
        return buckets;
    }, [messages]);

    if (sparkData.length < 5) return null;

    const maxSpark = Math.max(...sparkData, 1);
    const points = sparkData.map((v, i) => {
        const x = (i / (sparkData.length - 1)) * 200;
        const y = 40 - (v / maxSpark) * 36;
        return `${x},${y}`;
    }).join(" ");

    const areaPoints = `0,40 ${points} 200,40`;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-emerald-950/30 to-cyan-950/30 border border-emerald-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(16,185,129,0.15)]">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                    <TrendingUp className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent">
                    VOLUME PULSE
                </span>
                <div className="flex-1" />
                <span className="text-[10px] font-mono text-white/60">last 4h</span>
            </div>
            <svg viewBox="0 0 200 44" className="w-full h-20 overflow-visible">
                <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(16,185,129)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="sparkLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgb(6,182,212)" />
                        <stop offset="50%" stopColor="rgb(16,185,129)" />
                        <stop offset="100%" stopColor="rgb(45,212,191)" />
                    </linearGradient>
                </defs>
                <polygon points={areaPoints} fill="url(#sparkGrad)" />
                <polyline points={points} fill="none" stroke="url(#sparkLine)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {/* Glow dot on last point */}
                {sparkData.length > 0 && (() => {
                    const lastX = 200;
                    const lastY = 40 - (sparkData[sparkData.length - 1] / maxSpark) * 36;
                    return (
                        <>
                            <circle cx={lastX} cy={lastY} r="5" fill="rgb(16,185,129)" opacity="0.2" />
                            <circle cx={lastX} cy={lastY} r="3" fill="rgb(16,185,129)" />
                        </>
                    );
                })()}
            </svg>
        </div>
    );
}

function TopSendersLeaderboard({ messages }: { messages: WAMessage[] }) {
    const senders = useMemo(() => {
        const counts: Record<string, number> = {};
        messages.forEach(m => {
            const name = m.authorName || m.chatName || "Unknown";
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [messages]);

    if (senders.length < 2) return null;
    const maxCount = senders[0]?.[1] || 1;
    const rankIcons = [
        <Crown key="c" className="h-3.5 w-3.5 text-amber-400" />,
        <Medal key="m" className="h-3.5 w-3.5 text-zinc-300" />,
        <Medal key="b" className="h-3.5 w-3.5 text-amber-700" />,
    ];

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-amber-950/30 to-orange-950/30 border border-amber-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(245,158,11,0.15)]">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/30 to-orange-500/30 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                    <Crown className="h-4 w-4 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-transparent">
                    TOP SENDERS
                </span>
            </div>
            <div className="space-y-2">
                {senders.map(([name, count], i) => (
                    <div key={name} className="flex items-center gap-2">
                        <div className="w-5 shrink-0 flex justify-center">
                            {i < 3 ? rankIcons[i] : (
                                <span className="text-[10px] font-mono font-bold text-white/30">#{i + 1}</span>
                            )}
                        </div>
                        <span className="text-[11px] font-mono text-white/90 truncate flex-1 min-w-0">{name}</span>
                        <div className="w-28 h-3 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(count / maxCount) * 100}%` }}
                                transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
                                className={`h-full rounded-full ${
                                    i === 0 ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                                    : i === 1 ? "bg-gradient-to-r from-zinc-400 to-zinc-300 shadow-[0_0_6px_rgba(161,161,170,0.3)]"
                                    : i === 2 ? "bg-gradient-to-r from-amber-700 to-amber-600 shadow-[0_0_6px_rgba(180,83,9,0.3)]"
                                    : "bg-white/25"
                                }`}
                            />
                        </div>
                        <span className="text-[11px] font-mono font-bold text-white/60 tabular-nums w-7 text-right shrink-0">{count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StreamAnalyticsDashboard({ messages }: { messages: WAMessage[] }) {
    const [showAnalytics, setShowAnalytics] = useState(false);

    const { groupCount, dmCount, avgLen } = useMemo(() => {
        let gc = 0, dc = 0, totalLen = 0;
        messages.forEach(m => {
            m.isGroup ? gc++ : dc++;
            totalLen += m.body.length;
        });
        return { groupCount: gc, dmCount: dc, avgLen: messages.length > 0 ? Math.round(totalLen / messages.length) : 0 };
    }, [messages]);

    if (messages.length < 5) return null;

    return (
        <div className="space-y-3 w-full max-w-full overflow-hidden">
            <button
                type="button"
                onClick={() => setShowAnalytics(!showAnalytics)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-500/[0.06] via-violet-500/[0.06] to-emerald-500/[0.06] border border-white/10 hover:border-white/20 transition-all group min-w-0 overflow-hidden"
            >
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/15 group-hover:shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-shadow">
                    <BarChart3 className="h-4 w-4 text-cyan-400" />
                </div>
                <span className="text-[11px] font-mono font-black tracking-[0.2em] bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
                    STREAM ANALYTICS
                </span>
                <div className="flex-1" />
                {/* Quick stats pills */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/15">
                        <Users className="h-2.5 w-2.5 text-violet-400" />
                        <span className="text-[9px] font-mono font-bold text-violet-300">{groupCount}</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15">
                        <MessageCircle className="h-2.5 w-2.5 text-emerald-400" />
                        <span className="text-[9px] font-mono font-bold text-emerald-300">{dmCount}</span>
                    </div>
                </div>
                {showAnalytics ? (
                    <ChevronUp className="h-4 w-4 text-white/40 group-hover:text-white/60" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-white/40 group-hover:text-white/60" />
                )}
            </button>

            <AnimatePresence>
                {showAnalytics && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden space-y-3"
                    >
                        {/* Quick Stats Row */}
                        <div className="grid grid-cols-4 gap-2 min-w-0">
                            <GlowStatCard icon={<MessageCircle className="h-3.5 w-3.5" />} label="Total" value={messages.length} color="cyan" />
                            <GlowStatCard icon={<Users className="h-3.5 w-3.5" />} label="Group" value={groupCount} color="violet" />
                            <GlowStatCard icon={<Zap className="h-3.5 w-3.5" />} label="DMs" value={dmCount} color="emerald" />
                            <GlowStatCard icon={<Hash className="h-3.5 w-3.5" />} label="Avg Len" value={avgLen} color="amber" />
                        </div>
                        {/* Charts grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
                            <ActivityHeatmap messages={messages} />
                            <GroupDistributionRing messages={messages} />
                            <MessageVolumeSparkline messages={messages} />
                            <TopSendersLeaderboard messages={messages} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function GlowStatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    const borderMap: Record<string, string> = {
        cyan: "border-cyan-500/30 from-cyan-500/15 to-cyan-500/[0.05] shadow-[0_0_25px_rgba(6,182,212,0.15)]",
        violet: "border-violet-500/30 from-violet-500/15 to-violet-500/[0.05] shadow-[0_0_25px_rgba(139,92,246,0.15)]",
        emerald: "border-emerald-500/30 from-emerald-500/15 to-emerald-500/[0.05] shadow-[0_0_25px_rgba(16,185,129,0.15)]",
        amber: "border-amber-500/30 from-amber-500/15 to-amber-500/[0.05] shadow-[0_0_25px_rgba(245,158,11,0.15)]",
    };
    const textMap: Record<string, string> = {
        cyan: "text-cyan-400", violet: "text-violet-400", emerald: "text-emerald-400", amber: "text-amber-400",
    };
    return (
        <div className={`flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border bg-gradient-to-b min-w-0 overflow-hidden ${borderMap[color]} backdrop-blur-xl transition-all hover:scale-[1.04] hover:brightness-125`}>
            <div className={`${textMap[color]} drop-shadow-[0_0_8px_currentColor]`}>{icon}</div>
            <AnimatedNumber value={value} className={`text-2xl font-black tabular-nums ${textMap[color]} drop-shadow-[0_0_6px_currentColor]`} />
            <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em]">{label}</span>
        </div>
    );
}

// ── NanoClaw Filter Visualization ──

function FilterConfidenceHistogram({ results }: { results: MsgFilterResult[] }) {
    const buckets = useMemo(() => {
        const b = Array(10).fill(0); // 0-10%, 10-20%, etc.
        results.forEach(r => {
            const idx = Math.min(9, Math.floor(r.confidence * 10));
            b[idx]++;
        });
        return b;
    }, [results]);

    const maxBucket = Math.max(...buckets, 1);
    if (results.length < 3) return null;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-indigo-950/30 to-violet-950/30 border border-indigo-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(99,102,241,0.12)]">
            <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
                <span className="text-xs font-mono font-bold tracking-[0.15em] text-indigo-300">CONFIDENCE SPREAD</span>
            </div>
            <div className="flex gap-[3px] items-end h-24">
                {buckets.map((count, i) => {
                    const intensity = count / maxBucket;
                    const h = Math.max(4, intensity * 100);
                    const isRelevant = i >= 5;
                    return (
                        <TooltipProvider key={i}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${h}%` }}
                                        transition={{ delay: i * 0.05 }}
                                        className={`flex-1 rounded-t-sm ${
                                            isRelevant
                                                ? "bg-gradient-to-t from-emerald-500/80 to-emerald-400/90 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                : "bg-gradient-to-t from-red-500/40 to-red-400/60"
                                        }`}
                                    />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-[10px] font-mono">{i * 10}–{(i + 1) * 10}%: {count} msgs</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                })}
            </div>
            <div className="flex items-center justify-between text-[9px] font-mono text-white/40">
                <span>0%</span><span>50%</span><span>100%</span>
            </div>
        </div>
    );
}

function UrgencyMeter({ results }: { results: MsgFilterResult[] }) {
    const distribution = useMemo(() => {
        let low = 0, med = 0, high = 0, critical = 0;
        results.forEach(r => {
            if (r.urgencyScore >= 8) critical++;
            else if (r.urgencyScore >= 5) high++;
            else if (r.urgencyScore >= 3) med++;
            else low++;
        });
        return { low, med, high, critical };
    }, [results]);

    const total = results.length || 1;
    if (results.length < 3) return null;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-red-950/30 to-amber-950/30 border border-red-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(239,68,68,0.12)]">
            <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                <span className="text-xs font-mono font-bold tracking-[0.15em] text-red-300">URGENCY METER</span>
            </div>
            {/* Stacked bar */}
            <div className="h-7 rounded-full overflow-hidden flex bg-white/[0.06]">
                {distribution.critical > 0 && (
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(distribution.critical / total) * 100}%` }}
                        className="bg-gradient-to-r from-red-500 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                    />
                )}
                {distribution.high > 0 && (
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(distribution.high / total) * 100}%` }}
                        className="bg-gradient-to-r from-orange-500 to-amber-500"
                    />
                )}
                {distribution.med > 0 && (
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(distribution.med / total) * 100}%` }}
                        className="bg-gradient-to-r from-amber-500 to-yellow-500"
                    />
                )}
                {distribution.low > 0 && (
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(distribution.low / total) * 100}%` }}
                        className="bg-gradient-to-r from-emerald-500/50 to-emerald-400/50"
                    />
                )}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap">
                {distribution.critical > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
                        <span className="text-[11px] font-mono text-red-300 font-bold">{distribution.critical} critical</span>
                    </div>
                )}
                {distribution.high > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.5)]" />
                        <span className="text-[11px] font-mono text-orange-300">{distribution.high} high</span>
                    </div>
                )}
                {distribution.med > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
                        <span className="text-[11px] font-mono text-amber-300">{distribution.med} medium</span>
                    </div>
                )}
                {distribution.low > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-emerald-500/70 shadow-[0_0_6px_rgba(16,185,129,0.3)]" />
                        <span className="text-[11px] font-mono text-emerald-300">{distribution.low} low</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function TopicWordCloud({ results }: { results: MsgFilterResult[] }) {
    const topicData = useMemo(() => {
        const counts: Record<string, number> = {};
        results.forEach(r => {
            r.matchedTopics?.forEach(t => {
                counts[t] = (counts[t] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    }, [results]);

    if (topicData.length < 2) return null;
    const maxFreq = topicData[0]?.[1] || 1;
    const cloudColors = [
        "text-cyan-400", "text-violet-400", "text-emerald-400", "text-amber-400",
        "text-rose-400", "text-blue-400", "text-teal-400", "text-pink-400",
        "text-indigo-400", "text-lime-400",
    ];

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-teal-950/30 to-cyan-950/30 border border-teal-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(20,184,166,0.12)]">
            <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-teal-400 drop-shadow-[0_0_6px_rgba(20,184,166,0.6)]" />
                <span className="text-xs font-mono font-bold tracking-[0.15em] text-teal-300">TOPIC CLOUD</span>
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-center py-3">
                {topicData.map(([topic, count], i) => {
                    const size = 14 + Math.round((count / maxFreq) * 14);
                    const opacity = 0.6 + (count / maxFreq) * 0.4;
                    return (
                        <motion.span
                            key={topic}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: opacity, scale: 1 }}
                            transition={{ delay: i * 0.04 }}
                            className={`font-mono font-bold ${cloudColors[i % cloudColors.length]} cursor-default hover:brightness-150 transition-all`}
                            style={{ fontSize: `${size}px` }}
                        >
                            #{topic}
                        </motion.span>
                    );
                })}
            </div>
        </div>
    );
}

function FilterVizDashboard({ results, intent }: { results: MsgFilterResult[]; intent: MsgFilterIntent | null }) {
    if (results.length < 3) return null;

    const relevantCount = results.filter(r => r.relevant).length;
    const avgConf = results.length > 0
        ? results.reduce((s, r) => s + r.confidence, 0) / results.length
        : 0;
    const eventCount = results.filter(r => r.isEvent).length;
    const highUrgency = results.filter(r => r.urgencyScore >= 5).length;

    return (
        <div className="space-y-3">
            {/* Summary Stats Row */}
            <div className="grid grid-cols-4 gap-2 min-w-0">
                <div className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/15 to-emerald-500/[0.05] shadow-[0_0_25px_rgba(16,185,129,0.15)] backdrop-blur-xl min-w-0 overflow-hidden">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                    <AnimatedNumber value={relevantCount} className="text-2xl font-black tabular-nums text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em]">RELEVANT</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/15 to-cyan-500/[0.05] shadow-[0_0_25px_rgba(6,182,212,0.15)] backdrop-blur-xl min-w-0 overflow-hidden">
                    <Crosshair className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                    <span className="text-2xl font-black tabular-nums text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]">{Math.round(avgConf * 100)}%</span>
                    <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em]">AVG CONF</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/15 to-violet-500/[0.05] shadow-[0_0_25px_rgba(139,92,246,0.15)] backdrop-blur-xl min-w-0 overflow-hidden">
                    <Calendar className="h-4 w-4 text-violet-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                    <AnimatedNumber value={eventCount} className="text-2xl font-black tabular-nums text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
                    <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em]">EVENTS</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border border-red-500/30 bg-gradient-to-b from-red-500/15 to-red-500/[0.05] shadow-[0_0_25px_rgba(239,68,68,0.15)] backdrop-blur-xl min-w-0 overflow-hidden">
                    <AlertTriangle className="h-4 w-4 text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                    <AnimatedNumber value={highUrgency} className="text-2xl font-black tabular-nums text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                    <span className="text-[10px] font-mono text-white/60 uppercase tracking-[0.2em]">URGENT</span>
                </div>
            </div>

            {/* Relevance Gauge */}
            <RelevanceScoreGauge results={results} />

            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
                <FilterConfidenceHistogram results={results} />
                <UrgencyMeter results={results} />
                <RelevanceRadar results={results} />
                <CategoryBreakdownBars results={results} />
            </div>

            {/* Full-width components */}
            <TopicWordCloud results={results} />
            <MessageTimelineRiver results={results} />
        </div>
    );
}

function CategoryBreakdownBars({ results }: { results: MsgFilterResult[] }) {
    const catData = useMemo(() => {
        const counts: Record<string, number> = {};
        results.forEach(r => {
            if (r.category) counts[r.category] = (counts[r.category] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [results]);

    if (catData.length < 2) return null;
    const maxCat = catData[0]?.[1] || 1;

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-pink-950/30 to-violet-950/30 border border-pink-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(236,72,153,0.12)]">
            <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-pink-400 drop-shadow-[0_0_6px_rgba(236,72,153,0.6)]" />
                <span className="text-xs font-mono font-bold tracking-[0.15em] text-pink-300">CATEGORY BREAKDOWN</span>
            </div>
            <div className="space-y-1.5">
                {catData.map(([cat, count], i) => (
                    <div key={cat} className="flex items-center gap-2">
                        <span className="text-sm shrink-0">{CATEGORY_ICONS[cat] || "📌"}</span>
                        <span className="text-[11px] font-mono text-white/80 w-20 truncate shrink-0">{cat}</span>
                        <div className="flex-1 h-4 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(count / maxCat) * 100}%` }}
                                transition={{ delay: i * 0.08, duration: 0.5 }}
                                className={`h-full rounded-full ${categoryColor(cat).includes("bg-") ? "bg-gradient-to-r from-violet-500/70 to-purple-500/70" : "bg-gradient-to-r from-violet-500/70 to-purple-500/70"}`}
                                style={{
                                    background: `linear-gradient(90deg, ${
                                        cat === "academic" ? "rgb(59,130,246)" : cat === "placement" ? "rgb(16,185,129)"
                                        : cat === "hackathon" ? "rgb(139,92,246)" : cat === "deadline" ? "rgb(239,68,68)"
                                        : cat === "exam" ? "rgb(239,68,68)" : cat === "scholarship" ? "rgb(245,158,11)"
                                        : "rgb(139,92,246)"
                                    }, transparent)`,
                                }}
                            />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-white/50 tabular-nums w-5 text-right shrink-0">{count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Relevance Radar — SVG Pentagon Radar Chart ──

function RelevanceRadar({ results }: { results: MsgFilterResult[] }) {
    const dimensions = useMemo(() => {
        const relevant = results.filter(r => r.relevant);
        const total = results.length || 1;
        const relCount = relevant.length;

        // 5 axes: Relevance Rate, Avg Confidence, Event Density, Urgency Factor, Topic Diversity
        const relevanceRate = relCount / total;
        const avgConfidence = relevant.length > 0
            ? relevant.reduce((s, r) => s + r.confidence, 0) / relevant.length
            : 0;
        const eventDensity = relevant.filter(r => r.isEvent).length / Math.max(relCount, 1);
        const urgencyFactor = relevant.length > 0
            ? Math.min(1, relevant.reduce((s, r) => s + r.urgencyScore, 0) / (relevant.length * 10))
            : 0;
        const uniqueTopics = new Set(relevant.flatMap(r => r.matchedTopics || [])).size;
        const topicDiversity = Math.min(1, uniqueTopics / 8);

        return [
            { label: "RELEVANCE", value: relevanceRate },
            { label: "CONFIDENCE", value: avgConfidence },
            { label: "EVENTS", value: eventDensity },
            { label: "URGENCY", value: urgencyFactor },
            { label: "TOPICS", value: topicDiversity },
        ];
    }, [results]);

    if (results.length < 3) return null;

    const cx = 100, cy = 100, radius = 70;
    const angleStep = (2 * Math.PI) / 5;

    const getPoint = (index: number, value: number) => {
        const angle = -Math.PI / 2 + index * angleStep;
        return {
            x: cx + Math.cos(angle) * radius * value,
            y: cy + Math.sin(angle) * radius * value,
        };
    };

    const dataPoints = dimensions.map((d, i) => getPoint(i, d.value));
    const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ") + " Z";

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-cyan-950/30 to-violet-950/30 border border-cyan-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(6,182,212,0.15)]">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <Radar className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">
                    RELEVANCE RADAR
                </span>
            </div>
            <svg viewBox="0 0 200 200" className="w-full h-56">
                <defs>
                    <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="rgb(6,182,212)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="rgb(139,92,246)" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="radarStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgb(6,182,212)" />
                        <stop offset="100%" stopColor="rgb(139,92,246)" />
                    </linearGradient>
                </defs>
                {/* Grid rings */}
                {[0.25, 0.5, 0.75, 1].map(ring => {
                    const ringPoints = Array.from({ length: 5 }, (_, i) => getPoint(i, ring));
                    const ringPath = ringPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ") + " Z";
                    return <path key={ring} d={ringPath} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.7" />;
                })}
                {/* Axis lines */}
                {dimensions.map((_, i) => {
                    const p = getPoint(i, 1);
                    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.12)" strokeWidth="0.7" />;
                })}
                {/* Data polygon */}
                <motion.path
                    d={dataPath}
                    fill="url(#radarFill)"
                    stroke="url(#radarStroke)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                />
                {/* Data points */}
                {dataPoints.map((p, i) => (
                    <motion.circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="4"
                        fill={i < 2 ? "rgb(6,182,212)" : i < 4 ? "rgb(139,92,246)" : "rgb(16,185,129)"}
                        style={{ filter: `drop-shadow(0 0 6px ${i < 2 ? "rgba(6,182,212,0.6)" : i < 4 ? "rgba(139,92,246,0.6)" : "rgba(16,185,129,0.6)"})` }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                    />
                ))}
                {/* Labels */}
                {dimensions.map((d, i) => {
                    const p = getPoint(i, 1.2);
                    return (
                        <text
                            key={d.label}
                            x={p.x}
                            y={p.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-white/60"
                            style={{ fontSize: "9px", fontFamily: "monospace", fontWeight: 700 }}
                        >
                            {d.label}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
}

// ── Relevance Score Gauge — Animated Arc Gauge ──

function RelevanceScoreGauge({ results }: { results: MsgFilterResult[] }) {
    const { score, relevantPct, noisePct } = useMemo(() => {
        const total = results.length || 1;
        const relevant = results.filter(r => r.relevant).length;
        const noise = results.filter(r => r.category === "noise").length;
        const avgConf = results.reduce((s, r) => s + r.confidence, 0) / total;
        // Composite score: weighted blend of relevance rate, avg confidence, and non-noise ratio
        const relRate = relevant / total;
        const nonNoise = (total - noise) / total;
        const compositeScore = Math.round((relRate * 0.4 + avgConf * 0.35 + nonNoise * 0.25) * 100);
        return { score: compositeScore, relevantPct: Math.round(relRate * 100), noisePct: Math.round((noise / total) * 100) };
    }, [results]);

    if (results.length < 3) return null;

    // Arc math
    const cx = 120, cy = 110, r = 80;
    const startAngle = Math.PI * 0.8;
    const endAngle = Math.PI * 0.2;
    const totalAngle = 2 * Math.PI - (startAngle - endAngle);
    const scoreAngle = startAngle - (score / 100) * totalAngle;

    const arcPath = (angle1: number, angle2: number) => {
        const x1 = cx + r * Math.cos(angle1);
        const y1 = cy - r * Math.sin(angle1);
        const x2 = cx + r * Math.cos(angle2);
        const y2 = cy - r * Math.sin(angle2);
        const largeArc = Math.abs(angle1 - angle2) > Math.PI ? 1 : 0;
        return `M ${x1},${y1} A ${r},${r} 0 ${largeArc} 1 ${x2},${y2}`;
    };

    const colorClass = score >= 70 ? "text-emerald-400" : score >= 40 ? "text-amber-400" : "text-red-400";
    const glowColor = score >= 70 ? "rgba(16,185,129,0.3)" : score >= 40 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";
    const strokeColor = score >= 70 ? "rgb(16,185,129)" : score >= 40 ? "rgb(245,158,11)" : "rgb(239,68,68)";

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-slate-900/40 to-black/60 border border-white/10 p-4 backdrop-blur-xl shadow-[0_0_30px_rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/10">
                        <Cpu className="h-3.5 w-3.5 text-white/60" />
                    </div>
                    <span className="text-[11px] font-mono font-black tracking-[0.2em] bg-gradient-to-r from-white/80 to-white/50 bg-clip-text text-transparent">
                        NANOCLAW SCORE
                    </span>
                </div>
                <div className="flex items-center gap-3 text-[9px] font-mono">
                    <span className="text-emerald-400/80">{relevantPct}% relevant</span>
                    <span className="text-red-400/60">{noisePct}% noise</span>
                </div>
            </div>
            <div className="flex items-center justify-center">
                <svg viewBox="0 0 240 150" className="w-full max-w-[280px] h-32">
                    {/* Background arc */}
                    <path
                        d={arcPath(startAngle, endAngle)}
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="14"
                        strokeLinecap="round"
                    />
                    {/* Score arc */}
                    <motion.path
                        d={arcPath(startAngle, scoreAngle)}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="14"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
                    />
                    {/* Tick marks */}
                    {[0, 25, 50, 75, 100].map(tick => {
                        const tickAngle = startAngle - (tick / 100) * totalAngle;
                        const innerR = r - 8;
                        const outerR = r + 8;
                        return (
                            <line
                                key={tick}
                                x1={cx + innerR * Math.cos(tickAngle)}
                                y1={cy - innerR * Math.sin(tickAngle)}
                                x2={cx + outerR * Math.cos(tickAngle)}
                                y2={cy - outerR * Math.sin(tickAngle)}
                                stroke="rgba(255,255,255,0.25)"
                                strokeWidth="1.5"
                            />
                        );
                    })}
                    {/* Score text */}
                    <text
                        x={cx}
                        y={cy - 10}
                        textAnchor="middle"
                        className={`${colorClass} fill-current`}
                        style={{ fontSize: "48px", fontFamily: "monospace", fontWeight: 900, filter: `drop-shadow(0 0 10px ${glowColor})` }}
                    >
                        {score}
                    </text>
                    <text
                        x={cx}
                        y={cy + 14}
                        textAnchor="middle"
                        className="fill-white/50"
                        style={{ fontSize: "10px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.3em" }}
                    >
                        INTELLIGENCE SCORE
                    </text>
                </svg>
            </div>
        </div>
    );
}

// ── Message Timeline River — Time-series Flow Chart ──

function MessageTimelineRiver({ results }: { results: MsgFilterResult[] }) {
    if (results.length < 5) return null;

    // We don't have timestamps in results directly, so we show distribution by confidence bands over result index
    const bandData = useMemo(() => {
        const bucketCount = Math.min(20, results.length);
        const bucketSize = Math.ceil(results.length / bucketCount);
        const buckets: { relevant: number; irrelevant: number; events: number }[] = [];

        for (let i = 0; i < bucketCount; i++) {
            const slice = results.slice(i * bucketSize, (i + 1) * bucketSize);
            buckets.push({
                relevant: slice.filter(r => r.relevant && !r.isEvent).length,
                irrelevant: slice.filter(r => !r.relevant).length,
                events: slice.filter(r => r.isEvent).length,
            });
        }
        return buckets;
    }, [results]);

    const maxStack = Math.max(...bandData.map(b => b.relevant + b.irrelevant + b.events), 1);
    const width = 300, height = 60;

    // Build stacked area paths
    const buildPath = (data: number[], baseline: number[]) => {
        const points = data.map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((baseline[i] + v) / maxStack) * height;
            return `${x},${y}`;
        });
        const basePoints = baseline.map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (v / maxStack) * height;
            return `${x},${y}`;
        }).reverse();
        return `M ${points.join(" L ")} L ${basePoints.join(" L ")} Z`;
    };

    const irrelBase = bandData.map(() => 0);
    const relBase = bandData.map(b => b.irrelevant);
    const eventBase = bandData.map(b => b.irrelevant + b.relevant);

    return (
        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-indigo-950/30 to-cyan-950/30 border border-indigo-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(99,102,241,0.15)]">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500/30 to-blue-500/30 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                    <Layers className="h-4 w-4 text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-indigo-300 to-blue-300 bg-clip-text text-transparent">
                    CLASSIFICATION RIVER
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-zinc-500/40 shadow-[0_0_6px_rgba(113,113,122,0.3)]" />
                        <span className="text-[10px] font-mono text-white/50">noise</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.4)]" />
                        <span className="text-[10px] font-mono text-white/50">relevant</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.4)]" />
                        <span className="text-[10px] font-mono text-white/50">events</span>
                    </div>
                </div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
                <defs>
                    <linearGradient id="riverIrrel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(113,113,122)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="rgb(113,113,122)" stopOpacity="0.05" />
                    </linearGradient>
                    <linearGradient id="riverRel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(6,182,212)" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="rgb(6,182,212)" stopOpacity="0.15" />
                    </linearGradient>
                    <linearGradient id="riverEvent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(139,92,246)" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="rgb(139,92,246)" stopOpacity="0.2" />
                    </linearGradient>
                </defs>
                <motion.path
                    d={buildPath(bandData.map(b => b.irrelevant), irrelBase)}
                    fill="url(#riverIrrel)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                />
                <motion.path
                    d={buildPath(bandData.map(b => b.relevant), relBase)}
                    fill="url(#riverRel)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                />
                <motion.path
                    d={buildPath(bandData.map(b => b.events), eventBase)}
                    fill="url(#riverEvent)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                />
            </svg>
            <div className="flex items-center justify-between text-[7px] font-mono text-white/25">
                <span>first</span>
                <span>→ message sequence →</span>
                <span>last</span>
            </div>
        </div>
    );
}

// ── Media Detection Helpers ──

function detectMediaType(body: string): "pdf" | "image" | "link" | "doc" | null {
    const lower = body.toLowerCase();
    if (lower.includes(".pdf")) return "pdf";
    if (/\.(jpg|jpeg|png|gif|webp|svg)/.test(lower)) return "image";
    if (/\.(doc|docx|ppt|pptx|xls|xlsx)/.test(lower)) return "doc";
    if (/https?:\/\/\S+/.test(body)) return "link";
    return null;
}

function MediaBadge({ type }: { type: "pdf" | "image" | "link" | "doc" }) {
    const config = {
        pdf: { icon: <FileText className="h-2.5 w-2.5" />, label: "PDF", cls: "text-red-400 bg-red-500/15 border-red-500/20" },
        image: { icon: <Image className="h-2.5 w-2.5" />, label: "IMG", cls: "text-green-400 bg-green-500/15 border-green-500/20" },
        link: { icon: <Link2 className="h-2.5 w-2.5" />, label: "URL", cls: "text-blue-400 bg-blue-500/15 border-blue-500/20" },
        doc: { icon: <FileText className="h-2.5 w-2.5" />, label: "DOC", cls: "text-amber-400 bg-amber-500/15 border-amber-500/20" },
    };
    const c = config[type];
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-mono font-bold border ${c.cls}`}>
            {c.icon} {c.label}
        </span>
    );
}

function extractUrl(body: string): string | null {
    const match = body.match(/https?:\/\/\S+/);
    return match ? match[0] : null;
}

function GroupConfigPanel() {
    const { scanner, classifyGroup, syncGroups } = useMessageStore();
    const [expanded, setExpanded] = useState(false);
    const [groupSearch, setGroupSearch] = useState("");
    const groups = scanner.groups;

    if (groups.length === 0) return null;

    const academicCount = groups.filter(g => g.classification === "academic").length;
    const monitoredCount = groups.filter(g => g.classification === "monitored").length;
    const enabledCount = groups.filter(g => g.enabled).length;

    const filteredGroups = useMemo(() => {
        if (!groupSearch.trim()) return groups;
        const q = groupSearch.toLowerCase();
        return groups.filter(g => (g.name || g.id).toLowerCase().includes(q));
    }, [groups, groupSearch]);

    return (
        <div className="rounded-xl bg-white/[0.06] border border-white/12 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
            >
                <Shield className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[10px] font-mono font-bold tracking-[0.1em]">
                    GROUP INTELLIGENCE
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-blue-500/10 text-blue-300 border-blue-500/20">
                        {academicCount} academic
                    </Badge>
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-amber-500/10 text-amber-300 border-amber-500/20">
                        {monitoredCount} monitored
                    </Badge>
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                        {enabledCount}/{groups.length} on
                    </Badge>
                </div>
                {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/10"
                    >
                        <div className="px-3 pt-3 pb-2">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/85" />
                                    <Input
                                        placeholder="Search groups..."
                                        value={groupSearch}
                                        onChange={(e) => setGroupSearch(e.target.value)}
                                        className="h-7 text-[10px] pl-7 bg-black/30 border-white/10"
                                    />
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => syncGroups()}
                                    className="text-[10px] h-7 text-muted-foreground hover:text-foreground"
                                >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Sync
                                </Button>
                            </div>
                        </div>
                        <ScrollArea className="h-56">
                            <div className="px-3 pb-3 space-y-1">
                                {filteredGroups.map((g) => (
                                    <GroupRow key={g.id} group={g} onClassify={classifyGroup} />
                                ))}
                                {filteredGroups.length === 0 && (
                                    <p className="text-[10px] text-muted-foreground/85 font-mono text-center py-4">
                                        No groups matching &quot;{groupSearch}&quot;
                                    </p>
                                )}
                            </div>
                        </ScrollArea>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function GroupRow({
    group,
    onClassify,
}: {
    group: GroupConfig;
    onClassify: (id: string, c: GroupClassification, enabled?: boolean) => Promise<void>;
}) {
    const classifications: GroupClassification[] = ["academic", "non-academic", "monitored", "unclassified"];

    return (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.08] transition-colors group">
            <span className="text-[10px] text-foreground/90 truncate flex-1 font-mono">
                {group.name || group.id}
            </span>
            <div className="flex gap-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                {classifications.map((c) => (
                    <button
                        type="button"
                        key={c}
                        onClick={() => onClassify(group.id, c, group.enabled)}
                        className={`px-1.5 py-0.5 rounded-full text-[8px] font-mono border transition-all ${
                            group.classification === c
                                ? GROUP_COLORS[c]
                                : "bg-transparent text-muted-foreground/80 border-transparent hover:border-white/12 hover:text-muted-foreground/80"
                        }`}
                    >
                        {c === "non-academic" ? "non" : c === "unclassified" ? "unc" : c.slice(0, 4)}
                    </button>
                ))}
            </div>
            <button
                type="button"
                onClick={() => onClassify(group.id, group.classification, !group.enabled)}
                className={`w-7 h-5 rounded-full text-[8px] font-mono font-bold border transition-all ${
                    group.enabled
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                        : "bg-red-500/10 text-red-400/40 border-red-500/20 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30"
                }`}
            >
                {group.enabled ? "ON" : "OFF"}
            </button>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────
// 4. LIVE MESSAGE STREAM — Search, Sort, Filter, Bookmark, Expand
// ───────────────────────────────────────────────────────────────────

function LiveMessageStream() {
    // NOTE: Parent <TabsContent> now has overflow-x-hidden + max-w-full
    const {
        messages,
        fetchMessages,
        isLoadingMessages,
        messageSearch,
        setMessageSearch,
        messageSortBy,
        setMessageSort,
        selectedGroupFilter,
        setGroupFilter,
        bookmarkedIds,
        toggleBookmark,
        expandedMessageId,
        setExpandedMessage,
        scanner,
        filterPresets,
        saveFilterPreset,
        removeFilterPreset,
        runNanoClawFilter,
        isFiltering,
    } = useMessageStore();

    const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
    const [presetName, setPresetName] = useState("");
    const [showNewPreset, setShowNewPreset] = useState(false);

    // Auto-fetch messages on mount
    const hasFetchedRef = useRef(false);
    useEffect(() => {
        if (!hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchMessages();
        }
    }, [fetchMessages]);

    // Unique chat names for group filter
    const chatNames = useMemo(() => {
        const names = new Set(messages.map((m) => m.chatName).filter(Boolean));
        return Array.from(names).sort();
    }, [messages]);

    // Filter + Sort + Search pipeline
    const processedMessages = useMemo(() => {
        let result = [...messages];

        // Bookmark filter
        if (showBookmarksOnly) {
            result = result.filter((m) => bookmarkedIds.includes(m.id));
        }

        // Group filter
        if (selectedGroupFilter) {
            result = result.filter((m) => m.chatName === selectedGroupFilter);
        }

        // Text search
        if (messageSearch.trim()) {
            const q = messageSearch.toLowerCase();
            result = result.filter(
                (m) =>
                    m.body.toLowerCase().includes(q) ||
                    m.chatName?.toLowerCase().includes(q) ||
                    m.authorName?.toLowerCase().includes(q)
            );
        }

        // Sort
        switch (messageSortBy) {
            case "time":
                result.sort((a, b) => b.timestamp - a.timestamp);
                break;
            case "chat":
                result.sort((a, b) => (a.chatName || "").localeCompare(b.chatName || ""));
                break;
            case "sender":
                result.sort((a, b) => (a.authorName || "").localeCompare(b.authorName || ""));
                break;
        }

        return result;
    }, [messages, messageSearch, messageSortBy, selectedGroupFilter, bookmarkedIds, showBookmarksOnly]);

    return (
        <div className="space-y-3 w-full max-w-full overflow-x-hidden">
            {/* Search + Controls Bar */}
            <div className="flex items-center gap-2 min-w-0">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/85" />
                    <Input
                        placeholder="Search messages, chats, senders..."
                        value={messageSearch}
                        onChange={(e) => setMessageSearch(e.target.value)}
                        className="h-8 text-xs pl-8 bg-black/30 border-white/12 focus:border-cyan-500/30"
                    />
                    {messageSearch && (
                        <button
                            type="button"
                            title="Clear search"
                            onClick={() => setMessageSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/85 hover:text-muted-foreground"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {/* Sort */}
                <Select value={messageSortBy} onValueChange={(v) => setMessageSort(v as "time" | "chat" | "sender")}>
                    <SelectTrigger className="h-8 w-[100px] text-[10px] bg-black/30 border-white/10">
                        <ArrowUpDown className="h-3 w-3 mr-1 text-muted-foreground/80" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="time">Time</SelectItem>
                        <SelectItem value="chat">Chat</SelectItem>
                        <SelectItem value="sender">Sender</SelectItem>
                    </SelectContent>
                </Select>

                {/* Bookmark toggle */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
                                className={`h-8 w-8 p-0 rounded-lg ${
                                    showBookmarksOnly
                                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                        : "text-muted-foreground/85 hover:text-amber-400"
                                }`}
                            >
                                {showBookmarksOnly ? (
                                    <BookmarkCheck className="h-3.5 w-3.5" />
                                ) : (
                                    <Bookmark className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="text-xs">{showBookmarksOnly ? "Show all" : `Bookmarks (${bookmarkedIds.length})`}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                {/* Refresh */}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fetchMessages()}
                    disabled={isLoadingMessages}
                    className="h-8 w-8 p-0 rounded-lg text-muted-foreground/85 hover:text-foreground"
                >
                    {isLoadingMessages ? (
                        <Loader2 className="animate-spin h-3.5 w-3.5" />
                    ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                    )}
                </Button>
            </div>

            {/* Group Filter Chips */}
            {chatNames.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none max-w-full">
                    <button
                        type="button"
                        onClick={() => setGroupFilter(null)}
                        className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-mono border transition-all ${
                            !selectedGroupFilter
                                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                : "bg-transparent text-muted-foreground/85 border-white/12 hover:border-white/20"
                        }`}
                    >
                        All ({messages.length})
                    </button>
                    {chatNames.slice(0, 15).map((name) => {
                        const count = messages.filter((m) => m.chatName === name).length;
                        return (
                            <button
                                type="button"
                                key={name}
                                onClick={() => setGroupFilter(selectedGroupFilter === name ? null : name)}
                                className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-mono border transition-all truncate max-w-[140px] ${
                                    selectedGroupFilter === name
                                        ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                                        : "bg-transparent text-muted-foreground/85 border-white/12 hover:border-white/20"
                                }`}
                            >
                                {name} ({count})
                            </button>
                        );
                    })}
                    {chatNames.length > 15 && (
                        <span className="text-[9px] text-muted-foreground/80 font-mono shrink-0">
                            +{chatNames.length - 15} more
                        </span>
                    )}
                </div>
            )}

            {/* Quick Filter Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-mono text-muted-foreground/80 mr-1">PRESETS:</span>
                {filterPresets.map((preset) => (
                    <div key={preset.name} className="flex items-center gap-0 group/preset">
                        <button
                            type="button"
                            onClick={() => runNanoClawFilter(preset.prompt)}
                            disabled={isFiltering}
                            className="px-2 py-0.5 rounded-l-full text-[9px] font-mono bg-white/[0.08] border border-white/12 text-muted-foreground/80 hover:text-foreground hover:bg-white/[0.06] hover:border-white/12 transition-all"
                        >
                            <Sparkles className="h-2.5 w-2.5 inline mr-1 text-violet-400/60" />
                            {preset.name}
                        </button>
                        <button
                            type="button"
                            title={`Remove ${preset.name} preset`}
                            onClick={() => removeFilterPreset(preset.name)}
                            className="px-1 py-0.5 rounded-r-full text-[9px] border border-l-0 border-white/12 text-muted-foreground/80 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/preset:opacity-100"
                        >
                            <X className="h-2.5 w-2.5" />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    title="Add new preset"
                    onClick={() => setShowNewPreset(!showNewPreset)}
                    className="px-1.5 py-0.5 rounded-full text-[9px] text-muted-foreground/80 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
                >
                    <Plus className="h-2.5 w-2.5 inline" />
                </button>
            </div>

            {/* New Preset Form */}
            <AnimatePresence>
                {showNewPreset && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.06] border border-white/10">
                            <Input
                                placeholder="Preset name"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                className="h-7 text-[10px] bg-black/30 border-white/12 flex-1"
                            />
                            <Button
                                size="sm"
                                onClick={() => {
                                    if (presetName.trim() && messageSearch.trim()) {
                                        saveFilterPreset(presetName.trim(), messageSearch.trim());
                                        setPresetName("");
                                        setShowNewPreset(false);
                                        toast.success(`Preset "${presetName}" saved`);
                                    }
                                }}
                                disabled={!presetName.trim() || !messageSearch.trim()}
                                className="h-7 text-[10px] px-3 bg-violet-600 hover:bg-violet-500 text-white rounded-full"
                            >
                                <Save className="h-3 w-3 mr-1" />
                                Save
                            </Button>
                        </div>
                        <p className="text-[9px] text-muted-foreground/80 font-mono mt-1 px-1">
                            Saves current search as a NanoClaw filter preset
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results summary */}
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/85">
                <span>{processedMessages.length} messages</span>
                {messageSearch && <span>· matching &quot;{messageSearch}&quot;</span>}
                {selectedGroupFilter && <span>· in &quot;{selectedGroupFilter}&quot;</span>}
                {showBookmarksOnly && <span>· bookmarked only</span>}
            </div>

            {/* ═══ STREAM ANALYTICS DASHBOARD ═══ */}
            <StreamAnalyticsDashboard messages={messages} />

            {/* Message List */}
            {messages.length === 0 && !isLoadingMessages ? (
                <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground/85">
                    <MessageCircle className="h-8 w-8" />
                    <p className="text-xs font-mono">No messages captured yet</p>
                    <p className="text-[10px] font-mono text-muted-foreground/80">
                        Messages will appear as the scanner processes group chats
                    </p>
                </div>
            ) : isLoadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10">
                    <Loader2 className="animate-spin h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-mono text-muted-foreground/80">Loading messages...</span>
                </div>
            ) : (
                <ScrollArea className="h-[400px]">
                    <div className="space-y-1 pr-2">
                        {processedMessages.slice(0, 100).map((msg) => (
                            <MessageCard
                                key={msg.id}
                                message={msg}
                                isBookmarked={bookmarkedIds.includes(msg.id)}
                                isExpanded={expandedMessageId === msg.id}
                                onToggleBookmark={() => toggleBookmark(msg.id)}
                                onToggleExpand={() =>
                                    setExpandedMessage(expandedMessageId === msg.id ? null : msg.id)
                                }
                                searchQuery={messageSearch}
                            />
                        ))}
                        {processedMessages.length > 100 && (
                            <p className="text-center text-[10px] text-muted-foreground/80 font-mono py-2">
                                Showing 100 of {processedMessages.length} messages
                            </p>
                        )}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}

function MessageCard({
    message: msg,
    isBookmarked,
    isExpanded,
    onToggleBookmark,
    onToggleExpand,
    searchQuery,
}: {
    message: WAMessage;
    isBookmarked: boolean;
    isExpanded: boolean;
    onToggleBookmark: () => void;
    onToggleExpand: () => void;
    searchQuery: string;
}) {
    const highlightMatch = (text: string) => {
        if (!searchQuery.trim()) return text;
        const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
        if (idx === -1) return text;
        return (
            <>
                {text.slice(0, idx)}
                <mark className="bg-cyan-500/30 text-cyan-200 rounded px-0.5">{text.slice(idx, idx + searchQuery.length)}</mark>
                {text.slice(idx + searchQuery.length)}
            </>
        );
    };

    const isGroup = msg.isGroup;
    const truncatedBody = msg.body.length > 120 && !isExpanded ? msg.body.slice(0, 120) + "..." : msg.body;
    const mediaType = detectMediaType(msg.body);
    const url = extractUrl(msg.body);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`group/msg rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                isBookmarked
                    ? "bg-gradient-to-r from-amber-500/[0.08] to-amber-500/[0.03] border-amber-500/25 hover:border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.06)]"
                    : "bg-gradient-to-r from-white/[0.04] to-white/[0.02] border-white/10 hover:border-cyan-500/25 hover:shadow-[0_0_15px_rgba(6,182,212,0.06)]"
            }`}
        >
            {/* Subtle animated gradient top border for group messages */}
            {isGroup && (
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
            )}

            <div
                role="button"
                tabIndex={0}
                onClick={onToggleExpand}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
                className="w-full text-left px-3 py-2.5 flex items-start gap-2.5"
            >
                {/* Group/DM indicator — now a glow bar */}
                <div className={`shrink-0 w-1 h-full min-h-[28px] rounded-full ${
                    isGroup
                        ? "bg-gradient-to-b from-violet-500/60 to-purple-500/30 shadow-[0_0_6px_rgba(139,92,246,0.3)]"
                        : "bg-gradient-to-b from-emerald-500/60 to-teal-500/30 shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                }`} />

                <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-white/90 truncate max-w-[180px]">
                            {msg.chatName || "Unknown"}
                        </span>
                        {isGroup && msg.authorName && (
                            <span className="text-[9px] font-mono text-cyan-300/60 truncate max-w-[120px]">
                                @{msg.authorName}
                            </span>
                        )}
                        {/* Media badges */}
                        {mediaType && <MediaBadge type={mediaType} />}
                        <div className="flex-1" />
                        <span className="text-[9px] font-mono text-white/40 shrink-0 tabular-nums">
                            {formatTime(msg.timestamp)}
                        </span>
                    </div>

                    {/* Body */}
                    <p className="text-[11px] text-white/75 mt-0.5 leading-relaxed">
                        {searchQuery ? highlightMatch(truncatedBody) : truncatedBody}
                    </p>

                    {/* URL Preview (when link detected) */}
                    {url && isExpanded && (
                        <motion.a
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/15 hover:border-blue-500/30 transition-all group/link"
                        >
                            <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span className="text-[10px] font-mono text-blue-300/80 truncate flex-1 group-hover/link:text-blue-200">{url}</span>
                            <ExternalLink className="h-3 w-3 text-blue-400/50 shrink-0" />
                        </motion.a>
                    )}

                </div>

            </div>

            {/* Tags row — outside role="button" to allow nested button */}
            {isExpanded && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 mx-3 mb-2.5 pt-2 border-t border-white/8 flex-wrap"
                >
                    <Badge variant="outline" className={`text-[8px] h-4 px-1.5 ${isGroup ? "bg-violet-500/10 text-violet-300 border-violet-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}`}>
                        {isGroup ? "Group" : "DM"}
                    </Badge>
                    {mediaType && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-indigo-500/10 text-indigo-300 border-indigo-500/20">
                            {mediaType.toUpperCase()} attachment
                        </Badge>
                    )}
                    <span className="text-[9px] font-mono text-white/35">
                        ID: {msg.id.slice(0, 12)}...
                    </span>
                    <div className="flex-1" />
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    title="Copy message text"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(msg.body);
                                        toast.success("Copied message");
                                    }}
                                    className="text-white/40 hover:text-cyan-400 transition-colors"
                                >
                                    <Copy className="h-3 w-3" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Copy message</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </motion.div>
            )}

            {/* Bookmark button — kept outside role="button" to avoid nested interactive controls */}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
                className={`absolute top-2.5 right-2.5 shrink-0 transition-all z-10 ${
                    isBookmarked
                        ? "text-amber-400 scale-110 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]"
                        : "text-white/30 hover:text-amber-400/70 opacity-0 group-hover/msg:opacity-100"
                }`}
            >
                {isBookmarked ? (
                    <BookmarkCheck className="h-3.5 w-3.5" />
                ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                )}
            </button>
        </motion.div>
    );
}

// ───────────────────────────────────────────────────────────────────
// 5. INTELLIGENCE TAB — Auto-detected events + Analytics
// ───────────────────────────────────────────────────────────────────

// ── Intel Event Analytics Dashboard — Advanced visualizations for detected events ──

function IntelEventAnalyticsDashboard({ events }: { events: DetectedEvent[] }) {
    if (events.length < 2) return null;

    const stats = useMemo(() => {
        const avgConf = events.reduce((s, e) => s + (e.confidence || 0), 0) / events.length;
        const urgentCount = events.filter(e => (e.priority || 0) >= 7).length;
        const cats = new Set(events.map(e => e.category || "general"));
        const highConf = events.filter(e => (e.confidence || 0) >= 0.8).length;
        return { avgConf, urgentCount, categories: cats.size, highConf, total: events.length };
    }, [events]);

    // Category ring data
    const catData = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const ev of events) {
            const cat = ev.category || "general";
            counts[cat] = (counts[cat] || 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [events]);

    const catColors: Record<string, string> = {
        academic: "rgb(59,130,246)",
        cultural: "rgb(168,85,247)",
        career: "rgb(16,185,129)",
        social: "rgb(245,158,11)",
        sports: "rgb(239,68,68)",
        tech: "rgb(6,182,212)",
        general: "rgb(161,161,170)",
        deadline: "rgb(244,63,94)",
        workshop: "rgb(99,102,241)",
        competition: "rgb(234,179,8)",
    };

    // Confidence distribution
    const confBuckets = useMemo(() => {
        const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
        for (const ev of events) {
            const c = (ev.confidence || 0) * 100;
            const idx = Math.min(4, Math.floor(c / 20));
            buckets[idx]++;
        }
        return buckets;
    }, [events]);

    // Priority histogram
    const priorityData = useMemo(() => {
        const buckets: Record<string, number> = { "Low (1-3)": 0, "Med (4-6)": 0, "High (7-8)": 0, "Crit (9-10)": 0 };
        for (const ev of events) {
            const p = ev.priority || 5;
            if (p <= 3) buckets["Low (1-3)"]++;
            else if (p <= 6) buckets["Med (4-6)"]++;
            else if (p <= 8) buckets["High (7-8)"]++;
            else buckets["Crit (9-10)"]++;
        }
        return Object.entries(buckets);
    }, [events]);

    const maxConf = Math.max(...confBuckets, 1);
    const maxPriority = Math.max(...priorityData.map(([, v]) => v), 1);

    // Build conic ring
    const catTotal = catData.reduce((s, [, c]) => s + c, 0);
    let catAngle = 0;
    const conicStops = catData.map(([cat, count]) => {
        const start = catAngle;
        const end = catAngle + (count / catTotal) * 360;
        catAngle = end;
        const color = catColors[cat] || "rgb(161,161,170)";
        return `${color} ${start}deg ${end}deg`;
    }).join(", ");

    const [showAnalytics, setShowAnalytics] = useState(true);

    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={() => setShowAnalytics(!showAnalytics)}
                className="flex items-center gap-2 w-full px-1 group"
            >
                <div className="p-1 rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.3)]">
                    <PieChart className="h-4 w-4 text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                </div>
                <span className="text-xs font-mono font-black tracking-[0.2em] bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                    EVENT INTELLIGENCE
                </span>
                <div className="flex-1" />
                {showAnalytics ? (
                    <ChevronUp className="h-3.5 w-3.5 text-violet-400/60 group-hover:text-violet-400 transition-colors" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-violet-400/60 group-hover:text-violet-400 transition-colors" />
                )}
            </button>

            <AnimatePresence>
                {showAnalytics && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="space-y-3 overflow-hidden"
                    >
                        {/* ── Stat Cards Row ── */}
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { label: "TOTAL EVENTS", value: stats.total, color: "violet", icon: Zap },
                                { label: "AVG CONFIDENCE", value: `${Math.round(stats.avgConf * 100)}%`, color: "emerald", icon: Target },
                                { label: "URGENT", value: stats.urgentCount, color: "red", icon: Flame },
                                { label: "CATEGORIES", value: stats.categories, color: "cyan", icon: Layers },
                            ].map((card) => {
                                const colorMap: Record<string, string> = {
                                    violet: "from-violet-500/15 via-fuchsia-500/10 to-violet-500/15 border-violet-500/30 shadow-[0_0_30px_rgba(139,92,246,0.15)] text-violet-300",
                                    emerald: "from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.15)] text-emerald-300",
                                    red: "from-red-500/15 via-rose-500/10 to-red-500/15 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.15)] text-red-300",
                                    cyan: "from-cyan-500/15 via-blue-500/10 to-cyan-500/15 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] text-cyan-300",
                                };
                                return (
                                    <motion.div
                                        key={card.label}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className={`rounded-xl bg-gradient-to-br ${colorMap[card.color]} border py-4 px-3 flex flex-col items-center gap-1 backdrop-blur-xl hover:scale-[1.04] hover:brightness-125 transition-all duration-200`}
                                    >
                                        <card.icon className={`h-4 w-4 drop-shadow-[0_0_8px_currentColor]`} />
                                        <span className="text-2xl font-mono font-black drop-shadow-[0_0_6px_currentColor]">{card.value}</span>
                                        <span className="text-[10px] font-mono text-white/60 tracking-wider">{card.label}</span>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* ── Category Ring + Confidence Bars Side by Side ── */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Category Distribution Ring */}
                            <div className="rounded-2xl bg-gradient-to-br from-black/60 via-violet-950/30 to-fuchsia-950/30 border border-violet-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(139,92,246,0.15)]">
                                <div className="flex items-center gap-2">
                                    <PieChart className="h-4 w-4 text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                                    <span className="text-xs font-mono font-black tracking-[0.15em] bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                                        CATEGORY RING
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="relative w-28 h-28 shrink-0">
                                        <div
                                            className="absolute inset-0 rounded-full shadow-[0_0_30px_rgba(139,92,246,0.3)]"
                                            style={{ background: `conic-gradient(${conicStops})` }}
                                        />
                                        <div className="absolute inset-3 rounded-full bg-black/80 flex items-center justify-center flex-col backdrop-blur-xl">
                                            <span className="text-2xl font-mono font-black text-white/90">{catData.length}</span>
                                            <span className="text-[9px] font-mono text-white/60">types</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                        {catData.slice(0, 5).map(([cat, count]) => (
                                            <div key={cat} className="flex items-center gap-2">
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                                    style={{
                                                        backgroundColor: catColors[cat] || "rgb(161,161,170)",
                                                        boxShadow: `0 0 8px ${catColors[cat] || "rgb(161,161,170)"}80`,
                                                    }}
                                                />
                                                <span className="text-[11px] font-mono text-white/80 truncate flex-1">{cat}</span>
                                                <span className="text-[11px] font-mono text-white/60">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Confidence Distribution */}
                            <div className="rounded-2xl bg-gradient-to-br from-black/60 via-emerald-950/30 to-cyan-950/30 border border-emerald-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                                <div className="flex items-center gap-2">
                                    <Gauge className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                                    <span className="text-xs font-mono font-black tracking-[0.15em] bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                                        CONFIDENCE
                                    </span>
                                </div>
                                <div className="flex items-end gap-1.5 h-24">
                                    {confBuckets.map((count, i) => {
                                        const pct = (count / maxConf) * 100;
                                        const colors = [
                                            "bg-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.4)]",
                                            "bg-orange-500/60 shadow-[0_0_8px_rgba(249,115,22,0.4)]",
                                            "bg-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.4)]",
                                            "bg-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
                                            "bg-cyan-400/70 shadow-[0_0_12px_rgba(6,182,212,0.5)]",
                                        ];
                                        const labels = ["0-20", "20-40", "40-60", "60-80", "80-100"];
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                                <span className="text-[10px] font-mono text-white/60 font-bold">{count}</span>
                                                <motion.div
                                                    className={`w-full rounded-t-lg ${colors[i]}`}
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${Math.max(pct, 6)}%` }}
                                                    transition={{ duration: 0.5, delay: i * 0.1 }}
                                                />
                                                <span className="text-[9px] font-mono text-white/40">{labels[i]}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* ── Priority Distribution ── */}
                        <div className="rounded-2xl bg-gradient-to-br from-black/60 via-red-950/30 to-orange-950/30 border border-red-500/30 p-5 space-y-3 backdrop-blur-xl shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                            <div className="flex items-center gap-2">
                                <Flame className="h-4 w-4 text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                                <span className="text-xs font-mono font-black tracking-[0.15em] bg-gradient-to-r from-red-300 to-orange-300 bg-clip-text text-transparent">
                                    PRIORITY MATRIX
                                </span>
                            </div>
                            <div className="space-y-2">
                                {priorityData.map(([label, count], i) => {
                                    const pct = (count / maxPriority) * 100;
                                    const colors = [
                                        "bg-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.4)]",
                                        "bg-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.4)]",
                                        "bg-orange-500/70 shadow-[0_0_10px_rgba(249,115,22,0.5)]",
                                        "bg-red-500/80 shadow-[0_0_14px_rgba(239,68,68,0.6)]",
                                    ];
                                    return (
                                        <div key={label} className="flex items-center gap-3">
                                            <span className="text-[11px] font-mono text-white/80 w-20 shrink-0">{label}</span>
                                            <div className="flex-1 h-4 rounded-full bg-white/[0.06] overflow-hidden">
                                                <motion.div
                                                    className={`h-full rounded-full ${colors[i]}`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.max(pct, 4)}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.1 }}
                                                />
                                            </div>
                                            <span className="text-[11px] font-mono text-white/60 w-6 text-right font-bold">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function IntelligenceFeed() {
    const { scanner, createPlansFromEvents, isPlanning, createdPlans, clearPlans } = useMessageStore();
    const events = scanner.autoDetectedEvents;
    const [eventSearch, setEventSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Category breakdown
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const ev of events) {
            const cat = ev.category || "general";
            counts[cat] = (counts[cat] || 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [events]);

    // Filter events
    const filteredEvents = useMemo(() => {
        let result = [...events];
        if (selectedCategory) {
            result = result.filter((ev) => ev.category === selectedCategory);
        }
        if (eventSearch.trim()) {
            const q = eventSearch.toLowerCase();
            result = result.filter(
                (ev) =>
                    ev.title.toLowerCase().includes(q) ||
                    ev.description?.toLowerCase().includes(q) ||
                    ev.chatName?.toLowerCase().includes(q)
            );
        }
        return result;
    }, [events, eventSearch, selectedCategory]);

    if (events.length === 0 && scanner.totalScans === 0) {
        return (
            <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground/85">
                <div className="relative">
                    <Radio className="h-10 w-10" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 border-2 border-background bg-zinc-600 rounded-full" />
                </div>
                <div className="text-center">
                    <p className="text-xs font-mono">Waiting for scanner to detect events...</p>
                    <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">
                        Events will appear automatically as NanoClaw intercepts messages
                    </p>
                </div>
            </div>
        );
    }

    if (events.length === 0 && scanner.totalScans > 0) {
        return (
            <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground/85">
                <Activity className="h-10 w-10" />
                <div className="text-center">
                    <p className="text-xs font-mono">
                        No events detected — {scanner.totalScans} scans completed
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">
                        {scanner.totalMessagesProcessed} messages processed
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* ── Event Intelligence Analytics Dashboard ── */}
            <IntelEventAnalyticsDashboard events={events} />

            {/* Analytics Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                {categoryCounts.map(([cat, count]) => (
                    <button
                        type="button"
                        key={cat}
                        onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono border transition-all ${
                            selectedCategory === cat
                                ? categoryColor(cat)
                                : "bg-white/[0.06] text-muted-foreground/80 border-white/12 hover:border-white/20"
                        }`}
                    >
                        <span>{CATEGORY_ICONS[cat] || "📌"}</span>
                        <span>{cat}</span>
                        <span className="opacity-80">({count})</span>
                    </button>
                ))}
            </div>

            {/* Event Search */}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/85" />
                <Input
                    placeholder="Search events..."
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    className="h-8 text-xs pl-8 bg-black/30 border-white/10"
                />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-1">
                <Zap className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[10px] font-mono font-bold tracking-[0.1em] text-violet-400">
                    AUTO-DETECTED EVENTS
                </span>
                <div className="flex-1" />
                <span className="text-[10px] font-mono text-muted-foreground/85">
                    {filteredEvents.length} of {events.length}
                </span>
            </div>

            {/* Events List */}
            <ScrollArea className="h-[450px]">
                <div className="space-y-1.5 pr-1">
                    {filteredEvents.map((ev, i) => (
                        <DetectedEventCard key={`${ev.title}-${ev.eventDate}-${i}`} event={ev} index={i} />
                    ))}
                    {filteredEvents.length === 0 && (
                        <p className="text-center text-[10px] text-muted-foreground/80 font-mono py-6">
                            No events match current filters
                        </p>
                    )}
                </div>
            </ScrollArea>

            {/* Plans section */}
            {createdPlans.length > 0 && (
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400">
                            GENERATED PLANS
                        </span>
                        <div className="flex-1" />
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={clearPlans}
                            className="h-6 px-2 text-[9px] text-muted-foreground/85 hover:text-red-400"
                        >
                            <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                    </div>
                    {createdPlans.map((plan, i) => (
                        <div key={i} className="px-2 py-1.5 rounded-lg bg-white/[0.06] text-[10px] font-mono">
                            <span className="text-emerald-400">{plan.event?.title ?? "Untitled"}</span>
                            <span className="text-muted-foreground/85 mx-1">→</span>
                            <span className="text-foreground/90">{plan.plan ? "planned" : "pending"}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function DetectedEventCard({ event, index }: { event: DetectedEvent; index: number }) {
    const [expanded, setExpanded] = useState(false);
    const conf = Math.round((event.confidence || 0) * 100);
    const priority = event.priority || 5;
    const isUrgent = priority >= 7;
    const isCritical = priority >= 9;

    // Category color mapping
    const catColorMap: Record<string, { border: string; glow: string; bg: string; text: string }> = {
        academic: { border: "border-blue-500/40", glow: "shadow-[0_0_20px_rgba(59,130,246,0.2)]", bg: "bg-blue-500/15", text: "text-blue-300" },
        cultural: { border: "border-purple-500/40", glow: "shadow-[0_0_20px_rgba(168,85,247,0.2)]", bg: "bg-purple-500/15", text: "text-purple-300" },
        career: { border: "border-emerald-500/40", glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]", bg: "bg-emerald-500/15", text: "text-emerald-300" },
        social: { border: "border-amber-500/40", glow: "shadow-[0_0_20px_rgba(245,158,11,0.2)]", bg: "bg-amber-500/15", text: "text-amber-300" },
        sports: { border: "border-red-500/40", glow: "shadow-[0_0_20px_rgba(239,68,68,0.2)]", bg: "bg-red-500/15", text: "text-red-300" },
        tech: { border: "border-cyan-500/40", glow: "shadow-[0_0_20px_rgba(6,182,212,0.2)]", bg: "bg-cyan-500/15", text: "text-cyan-300" },
        deadline: { border: "border-rose-500/40", glow: "shadow-[0_0_20px_rgba(244,63,94,0.2)]", bg: "bg-rose-500/15", text: "text-rose-300" },
        workshop: { border: "border-indigo-500/40", glow: "shadow-[0_0_20px_rgba(99,102,241,0.2)]", bg: "bg-indigo-500/15", text: "text-indigo-300" },
        competition: { border: "border-yellow-500/40", glow: "shadow-[0_0_20px_rgba(234,179,8,0.2)]", bg: "bg-yellow-500/15", text: "text-yellow-300" },
        general: { border: "border-zinc-500/40", glow: "shadow-[0_0_20px_rgba(161,161,170,0.2)]", bg: "bg-zinc-500/15", text: "text-zinc-300" },
    };
    const catStyle = catColorMap[event.category || "general"] || catColorMap.general;

    // Confidence color
    const confColor = conf >= 80 ? "text-emerald-400" : conf >= 50 ? "text-amber-400" : "text-red-400";
    const confBg = conf >= 80 ? "bg-emerald-500" : conf >= 50 ? "bg-amber-500" : "bg-red-500";
    const confGlow = conf >= 80 ? "shadow-[0_0_8px_rgba(16,185,129,0.5)]" : conf >= 50 ? "shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "shadow-[0_0_8px_rgba(239,68,68,0.5)]";

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, type: "spring", stiffness: 300, damping: 30 }}
            className={`rounded-xl bg-gradient-to-br from-black/60 via-white/[0.04] to-black/60 ${catStyle.border} border-l-[3px] ${catStyle.glow} transition-all overflow-hidden group hover:brightness-110`}
        >
            {/* ── Main Card Content (always visible) ── */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left px-4 py-3.5 space-y-2.5"
            >
                {/* Top row: Icon + Title + Badges */}
                <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5 shrink-0 drop-shadow-lg">
                        {CATEGORY_ICONS[event.category || "general"] || "📌"}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-foreground/95 leading-snug">
                                {event.title}
                            </span>
                            <Badge
                                variant="outline"
                                className={`text-[9px] px-2 py-0.5 h-5 font-mono font-bold ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                            >
                                {event.category}
                            </Badge>
                            {isUrgent && (
                                <Badge
                                    variant="outline"
                                    className={`text-[9px] px-2 py-0.5 h-5 font-mono font-bold ${
                                        isCritical
                                            ? "bg-red-500/25 text-red-300 border-red-500/40 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                                            : "bg-orange-500/20 text-orange-300 border-orange-500/30"
                                    }`}
                                >
                                    <Flame className="h-3 w-3 mr-0.5" />
                                    {isCritical ? "CRITICAL" : "URGENT"}
                                </Badge>
                            )}
                        </div>

                        {/* Meta row: Date, Chat, Priority */}
                        <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground/80">
                            {event.eventDate && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10">
                                    <Calendar className="h-3 w-3 text-violet-400" />
                                    {event.eventDate}
                                </span>
                            )}
                            {event.chatName && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10">
                                    <MessageCircle className="h-3 w-3 text-cyan-400" />
                                    {event.chatName}
                                </span>
                            )}
                            {event.location && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/10">
                                    <MapPin className="h-3 w-3 text-blue-400" />
                                    {event.location}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right side: Confidence gauge + expand */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                        {/* Mini confidence arc */}
                        <div className="relative w-14 h-14">
                            <svg viewBox="0 0 56 56" className="w-full h-full">
                                <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                                <circle
                                    cx="28" cy="28" r="22"
                                    fill="none"
                                    stroke={conf >= 80 ? "rgb(16,185,129)" : conf >= 50 ? "rgb(245,158,11)" : "rgb(239,68,68)"}
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(conf / 100) * 138.2} 138.2`}
                                    transform="rotate(-90 28 28)"
                                    style={{ filter: `drop-shadow(0 0 4px ${conf >= 80 ? "rgba(16,185,129,0.5)" : conf >= 50 ? "rgba(245,158,11,0.5)" : "rgba(239,68,68,0.5)"})` }}
                                />
                                <text x="28" y="26" textAnchor="middle" className={`${confColor} fill-current`} style={{ fontSize: "14px", fontFamily: "monospace", fontWeight: 900 }}>
                                    {conf}
                                </text>
                                <text x="28" y="36" textAnchor="middle" className="fill-white/40" style={{ fontSize: "6px", fontFamily: "monospace", fontWeight: 700 }}>
                                    CONF
                                </text>
                            </svg>
                        </div>
                        {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-white/80 transition-colors" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-white/80 transition-colors" />
                        )}
                    </div>
                </div>

                {/* Description preview (always visible, 2 lines) */}
                {event.description && (
                    <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2 pl-9">
                        {event.description}
                    </p>
                )}

                {/* Source message preview (always visible if rawContext exists) */}
                {event.rawContext && (
                    <div className="ml-9 px-3 py-2 rounded-lg bg-black/40 border border-white/[0.08] relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-500 to-cyan-500" />
                        <div className="flex items-center gap-1.5 mb-1">
                            <MessageCircle className="h-2.5 w-2.5 text-violet-400/70" />
                            <span className="text-[9px] font-mono text-violet-400/70 tracking-wider font-bold">SOURCE MESSAGE</span>
                        </div>
                        <p className="text-[11px] text-white/70 font-mono leading-relaxed line-clamp-3">
                            {event.rawContext}
                        </p>
                    </div>
                )}
            </button>

            {/* ── Expanded Details ── */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/12 overflow-hidden"
                    >
                        <div className="px-4 py-3.5 space-y-3">
                            {/* Full description */}
                            {event.description && (
                                <div className="space-y-1">
                                    <span className="text-[10px] font-mono text-white/40 tracking-wider font-bold">FULL DESCRIPTION</span>
                                    <p className="text-xs text-foreground/90 leading-relaxed">{event.description}</p>
                                </div>
                            )}

                            {/* Detail chips */}
                            <div className="flex flex-wrap gap-2">
                                {event.deadline && (
                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-mono text-amber-400">
                                        <Clock className="h-3 w-3" /> Deadline: {event.deadline}
                                    </span>
                                )}
                                {event.url && (
                                    <a
                                        href={event.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-[11px] font-mono text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ExternalLink className="h-3 w-3" /> Open Link
                                    </a>
                                )}
                                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono ${
                                    priority >= 8 ? "bg-red-500/15 border-red-500/30 text-red-400" :
                                    priority >= 5 ? "bg-amber-500/15 border-amber-500/30 text-amber-400" :
                                    "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                }`}>
                                    <Target className="h-3 w-3" /> Priority: {priority}/10
                                </span>
                            </div>

                            {/* Full raw context */}
                            {event.rawContext && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-mono text-white/40 tracking-wider font-bold">FULL SOURCE CONTEXT</span>
                                    <div className="px-3 py-2.5 rounded-lg bg-black/50 border border-white/10 relative">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-gradient-to-b from-violet-500 via-cyan-500 to-emerald-500" />
                                        <p className="text-[11px] text-white/80 font-mono leading-relaxed whitespace-pre-wrap pl-2">
                                            {event.rawContext}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Confidence visualization bar */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-white/40 tracking-wider font-bold">CONFIDENCE LEVEL</span>
                                    <span className={`text-sm font-mono font-black ${confColor}`}>{conf}%</span>
                                </div>
                                <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                                    <motion.div
                                        className={`h-full rounded-full ${confBg} ${confGlow}`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${conf}%` }}
                                        transition={{ duration: 0.8, ease: "easeOut" }}
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ───────────────────────────────────────────────────────────────────
// 6. RECENT SCAN HISTORY
// ───────────────────────────────────────────────────────────────────

function ScanHistory() {
    const { scanner } = useMessageStore();
    const scans = scanner.recentScans;

    if (scans.length === 0) return null;

    return (
        <div className="rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-cyan-500/15 hover:border-cyan-500/25 overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.04)] transition-all">
            <div className="flex items-center gap-2 px-4 py-2.5">
                <BarChart3 className="h-3.5 w-3.5 text-cyan-400 drop-shadow-[0_0_4px_rgba(6,182,212,0.4)]" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
                    SCAN HISTORY
                </span>
                <div className="flex-1" />
                <span className="text-[9px] font-mono text-muted-foreground/80">
                    last {scans.length}
                </span>
            </div>
            <div className="px-3 pb-3 space-y-0.5">
                {scans.slice(0, 8).map((scan, i) => (
                    <div
                        key={`${scan.timestamp}-${i}`}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-lg text-[10px] font-mono text-muted-foreground/80 hover:bg-white/[0.06] transition-colors"
                    >
                        <span className="text-muted-foreground/80 w-14 shrink-0">
                            {new Date(scan.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <MessageCircle className="h-2.5 w-2.5 text-blue-400/40" />
                            <span>{scan.messagesProcessed}</span>
                        </div>
                        <ArrowRight className="h-2 w-2 text-muted-foreground/85" />
                        <div className="flex items-center gap-1.5">
                            <Zap className={`h-2.5 w-2.5 ${scan.eventsDetected > 0 ? "text-violet-400" : "text-muted-foreground/80"}`} />
                            <span className={scan.eventsDetected > 0 ? "text-violet-400" : ""}>
                                {scan.eventsDetected}
                            </span>
                        </div>
                        <ArrowRight className="h-2 w-2 text-muted-foreground/85" />
                        <div className="flex items-center gap-1.5">
                            <Calendar className={`h-2.5 w-2.5 ${scan.plansGenerated > 0 ? "text-amber-400" : "text-muted-foreground/80"}`} />
                            <span className={scan.plansGenerated > 0 ? "text-amber-400" : ""}>
                                {scan.plansGenerated}
                            </span>
                        </div>
                        <div className="flex-1" />
                        <span className="text-muted-foreground/80">{duration(scan.duration)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────
// 7. MANUAL NANOCLAW FILTER (collapsible advanced section)
// ───────────────────────────────────────────────────────────────────

function ManualFilterSection() {
    const {
        isFiltering,
        nlPrompt,
        filterResults,
        filteredMessages,
        manualDetectedEvents,
        filterIntent,
        messages,
        runNanoClawFilter,
        clearFilter,
        fetchMessages,
        isLoadingMessages,
        createPlansFromEvents,
        isPlanning,
    } = useMessageStore();
    const [expanded, setExpanded] = useState(false);
    const [prompt, setPrompt] = useState("");

    const hasFetchedRef = useRef(false);
    useEffect(() => {
        if (expanded && !hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchMessages();
        }
    }, [expanded, fetchMessages]);

    const handleFilter = async (e: FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;
        runNanoClawFilter(prompt.trim());
    };

    return (
        <div className="rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-violet-500/15 hover:border-violet-500/25 overflow-hidden shadow-[0_0_20px_rgba(139,92,246,0.04)] transition-all">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
            >
                <Brain className="h-3.5 w-3.5 text-violet-400 drop-shadow-[0_0_4px_rgba(139,92,246,0.4)]" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                    MANUAL NANOCLAW FILTER
                </span>
                <div className="flex-1" />
                {filterResults.length > 0 && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-violet-500/10 text-violet-300 border-violet-500/20">
                        {filteredMessages.length} results
                    </Badge>
                )}
                <span className="text-[9px] font-mono text-muted-foreground/80">Advanced</span>
                {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/80" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/80" />
                )}
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/12 p-3 space-y-3"
                    >
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => fetchMessages()}
                                disabled={isLoadingMessages}
                                className="text-[10px] h-7"
                            >
                                {isLoadingMessages ? (
                                    <Loader2 className="animate-spin h-3 w-3 mr-1" />
                                ) : (
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                )}
                                Load Messages ({messages.length})
                            </Button>
                        </div>

                        <form onSubmit={handleFilter} className="flex gap-2">
                            <Input
                                placeholder="e.g. upcoming exams, hackathon deadlines..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="h-8 text-xs bg-black/30 border-white/10"
                            />
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isFiltering || !prompt.trim()}
                                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-[10px] h-8 px-4 rounded-lg"
                            >
                                {isFiltering ? (
                                    <Loader2 className="animate-spin h-3 w-3 mr-1" />
                                ) : (
                                    <Brain className="h-3 w-3 mr-1" />
                                )}
                                Filter
                            </Button>
                            {filterResults.length > 0 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={clearFilter}
                                    className="text-[10px] h-8 text-muted-foreground/85 hover:text-red-400"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            )}
                        </form>

                        {/* ── Enhanced Filter Intent Breakdown ── */}
                        {filterIntent && (
                            <div className="rounded-xl bg-gradient-to-b from-violet-500/[0.06] to-purple-500/[0.03] border border-violet-500/20 overflow-hidden">
                                {/* Header with confidence meter */}
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/10">
                                    <Sparkles className="h-3.5 w-3.5 text-violet-400 animate-pulse drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
                                    <span className="text-[10px] font-mono font-black tracking-[0.2em] bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
                                        NanoClaw INTENT ANALYSIS
                                    </span>
                                    <div className="flex-1" />
                                    {/* Parse Confidence */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-mono text-muted-foreground/80">Confidence</span>
                                        <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    (filterIntent.parseConfidence ?? 0) >= 0.8
                                                        ? "bg-emerald-500"
                                                        : (filterIntent.parseConfidence ?? 0) >= 0.5
                                                            ? "bg-amber-500"
                                                            : "bg-red-500"
                                                }`}
                                                style={{ width: `${Math.round((filterIntent.parseConfidence ?? 0) * 100)}%` }}
                                            />
                                        </div>
                                        <span className={`text-[9px] font-mono font-bold tabular-nums ${
                                            (filterIntent.parseConfidence ?? 0) >= 0.8
                                                ? "text-emerald-400"
                                                : (filterIntent.parseConfidence ?? 0) >= 0.5
                                                    ? "text-amber-400"
                                                    : "text-red-400"
                                        }`}>
                                            {Math.round((filterIntent.parseConfidence ?? 0) * 100)}%
                                        </span>
                                    </div>
                                </div>

                                <div className="p-3 space-y-2.5">
                                    {/* Parsed Query */}
                                    {filterIntent.parsedQuery && (
                                        <div className="flex items-start gap-2">
                                            <Search className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider">Parsed Query</span>
                                                <p className="text-[11px] text-foreground/85 mt-0.5 leading-relaxed">{filterIntent.parsedQuery}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Intent Type + Category Row */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {filterIntent.intentType && (
                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                                                <Zap className="h-2.5 w-2.5 text-cyan-400" />
                                                <span className="text-[9px] font-mono font-bold text-cyan-300 uppercase">{filterIntent.intentType}</span>
                                            </div>
                                        )}
                                        {filterIntent.studentLifeCategory && (
                                            <Badge variant="outline" className={`text-[8px] h-5 px-2 ${categoryColor(filterIntent.studentLifeCategory)}`}>
                                                {CATEGORY_ICONS[filterIntent.studentLifeCategory] || "📌"} {filterIntent.studentLifeCategory}
                                            </Badge>
                                        )}
                                        {filterIntent.urgencyBias && filterIntent.urgencyBias !== "any" && (
                                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                                                filterIntent.urgencyBias === "urgent-only"
                                                    ? "bg-red-500/10 border-red-500/20 text-red-300"
                                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                            }`}>
                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                <span className="text-[9px] font-mono font-bold uppercase">{filterIntent.urgencyBias}</span>
                                            </div>
                                        )}
                                        {filterIntent.deadlineFocus && (
                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                                                <Timer className="h-2.5 w-2.5 text-amber-400" />
                                                <span className="text-[9px] font-mono font-bold text-amber-300">DEADLINE FOCUS</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Topics */}
                                    {filterIntent.topics && filterIntent.topics.length > 0 && (
                                        <div className="flex items-start gap-2">
                                            <Tag className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" />
                                            <div className="flex-1">
                                                <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider">Topics</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {filterIntent.topics.map((topic, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/15 text-[9px] font-mono text-violet-300">
                                                            {topic}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Group Hints */}
                                    {filterIntent.groupHints && filterIntent.groupHints.length > 0 && (
                                        <div className="flex items-start gap-2">
                                            <Users className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                                            <div className="flex-1">
                                                <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider">Group Hints</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {filterIntent.groupHints.map((g, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/15 text-[9px] font-mono text-blue-300">
                                                            {g}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Date Range + Time Hint Row */}
                                    {(filterIntent.timeHint || filterIntent.dateRange) && (
                                        <div className="flex items-start gap-2">
                                            <Clock className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                                            <div className="flex-1">
                                                <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider">Temporal Filter</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {filterIntent.timeHint && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15 text-[9px] font-mono text-amber-300">
                                                            🕐 {filterIntent.timeHint}
                                                        </span>
                                                    )}
                                                    {filterIntent.dateRange?.after && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-mono text-emerald-300">
                                                            After: {filterIntent.dateRange.after}
                                                        </span>
                                                    )}
                                                    {filterIntent.dateRange?.before && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/15 text-[9px] font-mono text-rose-300">
                                                            Before: {filterIntent.dateRange.before}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Include / Exclude Keywords */}
                                    {((filterIntent.includeKeywords && filterIntent.includeKeywords.length > 0) ||
                                      (filterIntent.excludeKeywords && filterIntent.excludeKeywords.length > 0)) && (
                                        <div className="flex items-start gap-2">
                                            <Filter className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" />
                                            <div className="flex-1">
                                                <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider">Keywords</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {filterIntent.includeKeywords?.map((kw, i) => (
                                                        <span key={`inc-${i}`} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-mono text-emerald-300">
                                                            <Plus className="h-2 w-2" />{kw}
                                                        </span>
                                                    ))}
                                                    {filterIntent.excludeKeywords?.map((kw, i) => (
                                                        <span key={`exc-${i}`} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/15 text-[9px] font-mono text-red-300">
                                                            <X className="h-2 w-2" />{kw}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Enhanced Filter Results ── */}
                        {filterResults.length > 0 && (
                            <div className="space-y-3">
                                {/* Results Statistics Bar */}
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-white/[0.04] via-cyan-500/[0.03] to-white/[0.04] border border-white/10">
                                    <div className="flex items-center gap-3 text-[10px] font-mono flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-emerald-400 font-bold">{filteredMessages.length}</span>
                                            <span className="text-muted-foreground/80">relevant</span>
                                        </div>
                                        <span className="text-muted-foreground/30">|</span>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-zinc-500" />
                                            <span className="text-muted-foreground/85">{filterResults.length - filteredMessages.length}</span>
                                            <span className="text-muted-foreground/80">filtered out</span>
                                        </div>
                                        <span className="text-muted-foreground/30">|</span>
                                        <div className="flex items-center gap-1.5">
                                            <Scan className="h-3 w-3 text-blue-400" />
                                            <span className="text-blue-400">{filterResults.length}</span>
                                            <span className="text-muted-foreground/80">processed</span>
                                        </div>
                                        {manualDetectedEvents.length > 0 && (
                                            <>
                                                <span className="text-muted-foreground/30">|</span>
                                                <div className="flex items-center gap-1.5">
                                                    <Zap className="h-3 w-3 text-violet-400" />
                                                    <span className="text-violet-400 font-bold">{manualDetectedEvents.length}</span>
                                                    <span className="text-muted-foreground/80">events</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex-1" />
                                    {/* Average confidence */}
                                    {(() => {
                                        const relevantResults = filterResults.filter(r => r.relevant);
                                        const avgConf = relevantResults.length > 0
                                            ? relevantResults.reduce((sum, r) => sum + r.confidence, 0) / relevantResults.length
                                            : 0;
                                        return (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-mono text-muted-foreground/80">Avg. conf</span>
                                                <span className={`text-[10px] font-mono font-bold ${
                                                    avgConf >= 0.8 ? "text-emerald-400" : avgConf >= 0.5 ? "text-amber-400" : "text-red-400"
                                                }`}>
                                                    {Math.round(avgConf * 100)}%
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* ═══ FILTER VISUALIZATION DASHBOARD ═══ */}
                                <FilterVizDashboard results={filterResults} intent={filterIntent} />

                                {/* Category & Topic breakdown chips from results */}
                                {(() => {
                                    const relevantResults = filterResults.filter(r => r.relevant);
                                    const catCounts: Record<string, number> = {};
                                    const topicSet = new Set<string>();
                                    let eventCount = 0;
                                    let urgentCount = 0;
                                    for (const r of relevantResults) {
                                        if (r.category) catCounts[r.category] = (catCounts[r.category] || 0) + 1;
                                        r.matchedTopics?.forEach(t => topicSet.add(t));
                                        if (r.isEvent) eventCount++;
                                        if (r.urgencyScore >= 7) urgentCount++;
                                    }
                                    const cats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
                                    const topics = Array.from(topicSet);

                                    return (cats.length > 0 || topics.length > 0) ? (
                                        <div className="space-y-1.5">
                                            {cats.length > 0 && (
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider mr-0.5">Categories:</span>
                                                    {cats.map(([cat, count]) => (
                                                        <Badge key={cat} variant="outline" className={`text-[8px] h-4 px-1.5 ${categoryColor(cat)}`}>
                                                            {CATEGORY_ICONS[cat] || "📌"} {cat} ({count})
                                                        </Badge>
                                                    ))}
                                                    {eventCount > 0 && (
                                                        <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-violet-500/10 text-violet-300 border-violet-500/20">
                                                            ⚡ {eventCount} events
                                                        </Badge>
                                                    )}
                                                    {urgentCount > 0 && (
                                                        <Badge variant="outline" className="text-[8px] h-4 px-1.5 bg-red-500/10 text-red-300 border-red-500/20 animate-pulse">
                                                            🔴 {urgentCount} urgent
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                            {topics.length > 0 && (
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    <span className="text-[8px] font-mono text-muted-foreground/80 uppercase tracking-wider mr-0.5">Matched:</span>
                                                    {topics.map((t, i) => (
                                                        <span key={i} className="px-1.5 py-0.5 rounded-md bg-cyan-500/8 border border-cyan-500/12 text-[8px] font-mono text-cyan-300">
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : null;
                                })()}

                                {/* Manual detected events */}
                                {manualDetectedEvents.length > 0 && (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 px-1">
                                            <Zap className="h-3 w-3 text-violet-400" />
                                            <span className="text-[9px] font-mono font-bold text-violet-300 tracking-wider">DETECTED EVENTS</span>
                                        </div>
                                        {manualDetectedEvents.map((ev, i) => (
                                            <div
                                                key={`manual-${i}`}
                                                className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/12 text-xs"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">{CATEGORY_ICONS[ev.category || "general"]}</span>
                                                    <span className="text-foreground/90 font-medium">{ev.title}</span>
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[8px] px-1.5 py-0 h-4 ${categoryColor(ev.category)}`}
                                                    >
                                                        {ev.category}
                                                    </Badge>
                                                    {ev.priority && ev.priority >= 8 && (
                                                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 bg-red-500/15 text-red-300 border-red-500/20 animate-pulse">
                                                            URGENT
                                                        </Badge>
                                                    )}
                                                    <div className="flex-1" />
                                                    <span className={`text-[9px] font-mono font-bold ${
                                                        (ev.confidence ?? 0) >= 0.8 ? "text-emerald-400" : (ev.confidence ?? 0) >= 0.5 ? "text-amber-400" : "text-red-400"
                                                    }`}>
                                                        {Math.round((ev.confidence ?? 0) * 100)}%
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-muted-foreground/80">
                                                    {ev.eventDate && (
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-2.5 w-2.5 text-blue-400" /> {ev.eventDate}
                                                        </span>
                                                    )}
                                                    {ev.deadline && (
                                                        <span className="flex items-center gap-1 text-amber-400/70">
                                                            <Timer className="h-2.5 w-2.5" /> Deadline: {ev.deadline}
                                                        </span>
                                                    )}
                                                    {ev.location && (
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="h-2.5 w-2.5 text-emerald-400" /> {ev.location}
                                                        </span>
                                                    )}
                                                    {ev.chatName && (
                                                        <span className="flex items-center gap-1">
                                                            <MessageCircle className="h-2.5 w-2.5" /> {ev.chatName}
                                                        </span>
                                                    )}
                                                </div>
                                                {ev.description && (
                                                    <p className="text-[10px] text-foreground/70 mt-1 leading-relaxed line-clamp-2">{ev.description}</p>
                                                )}
                                            </div>
                                        ))}
                                        <Button
                                            size="sm"
                                            onClick={() => createPlansFromEvents()}
                                            disabled={isPlanning}
                                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] h-7 px-4 rounded-full"
                                        >
                                            {isPlanning ? (
                                                <Loader2 className="animate-spin h-3 w-3 mr-1" />
                                            ) : (
                                                <Calendar className="h-3 w-3 mr-1" />
                                            )}
                                            Pin & Plan All Events
                                        </Button>
                                    </div>
                                )}

                                {/* ── Enhanced Relevant Messages with Per-Message Analysis ── */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 px-1 mb-1.5">
                                        <Eye className="h-3 w-3 text-cyan-400" />
                                        <span className="text-[9px] font-mono font-bold text-cyan-300 tracking-wider">RELEVANT MESSAGES</span>
                                        <div className="flex-1" />
                                        <span className="text-[9px] font-mono text-muted-foreground/80">
                                            {Math.min(filteredMessages.length, 30)} shown
                                        </span>
                                    </div>
                                </div>
                                <ScrollArea className="h-64">
                                    <div className="space-y-1.5">
                                        {filteredMessages.slice(0, 30).map((m) => {
                                            const analysis = filterResults.find(r => r.msgId === m.id);
                                            return (
                                                <div
                                                    key={m.id}
                                                    className="rounded-lg bg-white/[0.04] border border-white/8 hover:border-white/15 transition-all overflow-hidden"
                                                >
                                                    {/* Message header */}
                                                    <div className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-mono font-semibold text-foreground/85 truncate max-w-[160px]">
                                                                {m.chatName}
                                                            </span>
                                                            {m.authorName && (
                                                                <span className="text-[9px] font-mono text-muted-foreground/80 truncate max-w-[100px]">
                                                                    {m.authorName}
                                                                </span>
                                                            )}
                                                            <div className="flex-1" />
                                                            {/* Per-message confidence */}
                                                            {analysis && (
                                                                <div className="flex items-center gap-1">
                                                                    <div className="w-10 h-1 rounded-full bg-white/5 overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${
                                                                                analysis.confidence >= 0.8 ? "bg-emerald-500" : analysis.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"
                                                                            }`}
                                                                            style={{ width: `${Math.round(analysis.confidence * 100)}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className={`text-[8px] font-mono tabular-nums font-bold ${
                                                                        analysis.confidence >= 0.8 ? "text-emerald-400" : analysis.confidence >= 0.5 ? "text-amber-400" : "text-red-400"
                                                                    }`}>
                                                                        {Math.round(analysis.confidence * 100)}%
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Message body */}
                                                        <p className="text-[10px] text-foreground/70 mt-0.5 leading-relaxed line-clamp-2">
                                                            {m.body.slice(0, 200)}
                                                        </p>

                                                        {/* Per-message analysis tags */}
                                                        {analysis && (
                                                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                                {/* Category */}
                                                                <Badge variant="outline" className={`text-[7px] h-3.5 px-1 ${categoryColor(analysis.category)}`}>
                                                                    {analysis.category}
                                                                </Badge>
                                                                {/* Urgency */}
                                                                {analysis.urgencyScore >= 5 && (
                                                                    <span className={`text-[8px] font-mono font-bold px-1 py-0 rounded ${
                                                                        analysis.urgencyScore >= 8
                                                                            ? "bg-red-500/15 text-red-300"
                                                                            : analysis.urgencyScore >= 5
                                                                                ? "bg-amber-500/15 text-amber-300"
                                                                                : "text-muted-foreground/80"
                                                                    }`}>
                                                                        ⚡{analysis.urgencyScore}/10
                                                                    </span>
                                                                )}
                                                                {/* Event flag */}
                                                                {analysis.isEvent && (
                                                                    <span className="text-[8px] font-mono px-1 py-0 rounded bg-violet-500/10 text-violet-300 border border-violet-500/15">
                                                                        📅 Event
                                                                    </span>
                                                                )}
                                                                {/* Extracted date */}
                                                                {analysis.extractedDate && (
                                                                    <span className="text-[8px] font-mono px-1 py-0 rounded bg-blue-500/8 text-blue-300 border border-blue-500/12">
                                                                        🗓 {analysis.extractedDate}
                                                                    </span>
                                                                )}
                                                                {/* Matched topics */}
                                                                {analysis.matchedTopics?.slice(0, 3).map((t, i) => (
                                                                    <span key={i} className="text-[7px] font-mono px-1 py-0 rounded bg-white/[0.04] text-muted-foreground/80 border border-white/8">
                                                                        #{t}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Reason text */}
                                                        {analysis?.reason && (
                                                            <p className="text-[9px] font-mono text-muted-foreground/80 mt-1 italic leading-relaxed">
                                                                💡 {analysis.reason}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────
// MAIN PANEL — Tabbed Interface
// ───────────────────────────────────────────────────────────────────

export function WhatsAppIntelligencePanel() {
    const {
        session, scanner, refreshStatus, refreshScannerStats,
        error, clearError, startAutoScan, isStartingScanner,
        activeTab, setActiveTab,
    } = useMessageStore();

    // On mount: check existing session + scanner status
    useEffect(() => {
        refreshStatus();
        refreshScannerStats();
    }, [refreshStatus, refreshScannerStats]);

    // Adaptive polling: fast when connecting, slow when stable
    useEffect(() => {
        const interval = setInterval(() => {
            refreshStatus();
            refreshScannerStats();
        }, session.status === "ready" ? 15000 : 2500);
        return () => clearInterval(interval);
    }, [session.status, refreshStatus, refreshScannerStats]);

    // Safety net: auto-start scanner
    useEffect(() => {
        if (session.status === "ready" && scanner.status === "idle" && !isStartingScanner) {
            const timer = setTimeout(() => {
                const s = useMessageStore.getState();
                if (s.session.status === "ready" && s.scanner.status === "idle" && !s.isStartingScanner) {
                    console.log("[NEXUS-UI] Safety net → auto-starting scanner");
                    s.startAutoScan();
                }
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [session.status, scanner.status, isStartingScanner]);

    const isLinked = session.status === "ready";
    const hasActivity = scanner.totalScans > 0 || scanner.status !== "idle";

    return (
        <TooltipProvider>
            <div className="space-y-4 w-full max-w-full overflow-x-hidden">
                {/* Error Banner */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                        >
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            <span className="text-[11px] text-red-400 font-mono flex-1">{error}</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={clearError}
                                className="text-red-400/50 hover:text-red-300 h-6 px-2 text-[10px]"
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Credential Manager — always visible */}
                <CredentialManager />

                {/* Main Content — Tabbed Interface */}
                {isLinked && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Tabs
                            value={activeTab}
                            onValueChange={(v) => setActiveTab(v as "command" | "stream" | "intel")}
                            className="space-y-3"
                        >
                            <TabsList className="w-full bg-gradient-to-r from-black/60 via-white/[0.06] to-black/60 border border-white/15 rounded-2xl p-1.5 h-auto backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
                                <TabsTrigger
                                    value="command"
                                    className="flex-1 text-[10px] font-mono font-bold tracking-[0.15em] h-9 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-blue-500/15 data-[state=active]:text-cyan-300 data-[state=active]:border data-[state=active]:border-cyan-500/25 data-[state=active]:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all"
                                >
                                    <Settings2 className="h-3 w-3 mr-1.5" />
                                    COMMAND
                                    {hasActivity && (
                                        <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="stream"
                                    className="flex-1 text-[10px] font-mono font-bold tracking-[0.15em] h-9 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/20 data-[state=active]:to-violet-500/15 data-[state=active]:text-blue-300 data-[state=active]:border data-[state=active]:border-blue-500/25 data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all"
                                >
                                    <MessageCircle className="h-3 w-3 mr-1.5" />
                                    STREAM
                                    {session.messageCount > 0 && (
                                        <Badge variant="outline" className="ml-1.5 text-[8px] h-4 px-1 border-blue-500/20 text-blue-300">
                                            {session.messageCount}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="intel"
                                    className="flex-1 text-[10px] font-mono font-bold tracking-[0.15em] h-9 rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-purple-500/15 data-[state=active]:text-violet-300 data-[state=active]:border data-[state=active]:border-violet-500/25 data-[state=active]:shadow-[0_0_15px_rgba(139,92,246,0.15)] transition-all"
                                >
                                    <Zap className="h-3 w-3 mr-1.5" />
                                    INTEL
                                    {scanner.totalEventsDetected > 0 && (
                                        <Badge variant="outline" className="ml-1.5 text-[8px] h-4 px-1 border-violet-500/20 text-violet-300">
                                            {scanner.totalEventsDetected}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>

                            {/* ── COMMAND CENTER TAB ── */}
                            <TabsContent value="command" className="space-y-3 mt-0">
                                <ScannerDashboard />
                                <GroupConfigPanel />
                                <ScanHistory />
                                <ManualFilterSection />
                            </TabsContent>

                            {/* ── LIVE STREAM TAB ── */}
                            <TabsContent value="stream" className="mt-0 w-full max-w-full overflow-x-hidden">
                                <LiveMessageStream />
                            </TabsContent>

                            {/* ── INTELLIGENCE TAB ── */}
                            <TabsContent value="intel" className="mt-0">
                                <IntelligenceFeed />
                            </TabsContent>
                        </Tabs>
                    </motion.div>
                )}
            </div>
        </TooltipProvider>
    );
}
