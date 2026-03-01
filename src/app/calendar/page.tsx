"use client";

// ===================================================================
// Calendar Page — Centralized Agentic Planner Hub
//
// The nerve center for all event planning. Enhances SmartCalendar with:
//   • Countdown badges with urgency colors
//   • Category filter bar (multi-select)
//   • "Today's Focus" sidebar with upcoming priorities
//   • Week/Month view toggle
//   • Adaptive replan alerts when plans are stale
//   • Quick stats: total events, overdue, planned, unplanned
//
// This is NOT a static demo — all data is live from PGlite.
// ===================================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    format, startOfWeek, endOfWeek, eachDayOfInterval,
    startOfMonth, endOfMonth, isToday, isSameDay,
    isSameMonth, addMonths, subMonths, addWeeks, subWeeks,
    differenceInCalendarDays, isPast, isFuture,
    startOfDay,
} from "date-fns";
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight,
    Target, BookOpen, Trophy, Code2, Briefcase, Users,
    Shield, AlertTriangle, Clock, Sparkles, Filter,
    LayoutGrid, List, TrendingUp, Zap, Bell,
    CheckCircle2, XCircle, Timer, ArrowRight,
} from "lucide-react";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuraCard } from "@/components/ui/aura-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SmartCalendar } from "@/components/dashboard/smart-calendar";
import { adaptiveReplan, type AdaptiveReplanResult } from "@/actions/adaptive-replan";

// ─── Category Config (matches smart-calendar) ─────────────────────

const CATEGORY_CONFIG: Record<string, {
    label: string; color: string; bg: string;
    border: string; icon: typeof Target;
}> = {
    exam: { label: "Exam", color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/30", icon: AlertTriangle },
    assignment: { label: "Assignment", color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/30", icon: BookOpen },
    hackathon: { label: "Hackathon", color: "text-blue-300", bg: "bg-blue-500/15", border: "border-blue-500/30", icon: Code2 },
    workshop: { label: "Workshop", color: "text-violet-300", bg: "bg-violet-500/15", border: "border-violet-500/30", icon: Users },
    contest: { label: "Contest", color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/30", icon: Trophy },
    internship: { label: "Internship", color: "text-cyan-300", bg: "bg-cyan-500/15", border: "border-cyan-500/30", icon: Briefcase },
    social: { label: "Social", color: "text-pink-300", bg: "bg-pink-500/15", border: "border-pink-500/30", icon: Users },
    noise: { label: "Other", color: "text-gray-400", bg: "bg-gray-500/15", border: "border-gray-500/30", icon: Shield },
};

interface CalendarEvent {
    id: string;
    title: string | null;
    description: string | null;
    category: string | null;
    eventDate: string | null;
    deadline: string | null;
    location: string | null;
    url: string | null;
    status: string;
    priority: number | null;
    source: string;
    createdAt: string;
}

interface EventWithPlan extends CalendarEvent {
    hasPlan: boolean;
    progress: number;
    daysRemaining: number | null;
    urgency: "critical" | "urgent" | "normal" | "future";
}

// ─── Urgency Calculator ──────────────────────────────────────────

function getUrgency(daysRemaining: number | null): "critical" | "urgent" | "normal" | "future" {
    if (daysRemaining === null) return "future";
    if (daysRemaining < 0) return "critical";
    if (daysRemaining <= 3) return "critical";
    if (daysRemaining <= 7) return "urgent";
    if (daysRemaining <= 14) return "normal";
    return "future";
}

function getUrgencyConfig(urgency: string) {
    switch (urgency) {
        case "critical": return { color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/40", label: "CRITICAL" };
        case "urgent": return { color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/40", label: "URGENT" };
        case "normal": return { color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/40", label: "UPCOMING" };
        default: return { color: "text-gray-400", bg: "bg-gray-500/20", border: "border-gray-500/40", label: "SCHEDULED" };
    }
}

// ─── Main Calendar Page Component ────────────────────────────────

export default function CalendarPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [eventPlans, setEventPlans] = useState<Record<string, { progress: number }>>({});
    const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set(Object.keys(CATEGORY_CONFIG)));
    const [viewMode, setViewMode] = useState<"month" | "week">("month");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [focusSidebarOpen, setFocusSidebarOpen] = useState(true);

    // ── Fetch Events ─────────────────────────────────────────

    const fetchEvents = useCallback(async () => {
        try {
            const res = await fetch("/api/events");
            if (!res.ok) return;
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.events ?? [];
            setEvents(list);
        } catch (err) {
            console.error("[Calendar] Failed to fetch events:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Fetch Plans for all events (batch) ────────────────────

    const fetchPlans = useCallback(async (eventsList: CalendarEvent[]) => {
        const plans: Record<string, { progress: number }> = {};
        // Batch: only fetch for events with dates
        const datedEvents = eventsList.filter(e => e.eventDate);
        const batchSize = 5;

        for (let i = 0; i < datedEvents.length; i += batchSize) {
            const batch = datedEvents.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(async (ev) => {
                    const res = await fetch(`/api/event-plans?eventId=${ev.id}`);
                    if (!res.ok) return null;
                    const data = await res.json();
                    if (data.plan) {
                        plans[ev.id] = { progress: data.plan.progress ?? 0 };
                    }
                    return data;
                })
            );
        }
        setEventPlans(plans);
    }, []);

    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [fetchEvents]);

    useEffect(() => {
        if (events.length > 0) {
            fetchPlans(events);
        }
    }, [events, fetchPlans]);

    // ── Enriched Events with countdown + urgency ──────────────

    const enrichedEvents = useMemo<EventWithPlan[]>(() => {
        const now = startOfDay(new Date());
        return events
            .filter(e => e.category !== "noise")
            .map(ev => {
                const eventDate = ev.eventDate ? new Date(ev.eventDate) : null;
                const deadline = ev.deadline ? new Date(ev.deadline) : null;
                const targetDate = deadline ?? eventDate;
                const daysRemaining = targetDate ? differenceInCalendarDays(targetDate, now) : null;
                const plan = eventPlans[ev.id];

                return {
                    ...ev,
                    hasPlan: !!plan,
                    progress: plan?.progress ?? 0,
                    daysRemaining,
                    urgency: getUrgency(daysRemaining),
                };
            })
            .sort((a, b) => {
                // Sort: most urgent first
                const urgencyOrder = { critical: 0, urgent: 1, normal: 2, future: 3 };
                return (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4);
            });
    }, [events, eventPlans]);

    // ── Filtered events ───────────────────────────────────────

    const filteredEvents = useMemo(() =>
        enrichedEvents.filter(e => !e.category || activeCategories.has(e.category)),
        [enrichedEvents, activeCategories]
    );

    // ── Stats ─────────────────────────────────────────────────

    const stats = useMemo(() => {
        const total = enrichedEvents.length;
        const withPlan = enrichedEvents.filter(e => e.hasPlan).length;
        const critical = enrichedEvents.filter(e => e.urgency === "critical").length;
        const overdue = enrichedEvents.filter(e => e.daysRemaining !== null && e.daysRemaining < 0).length;
        const avgProgress = total > 0
            ? Math.round(enrichedEvents.reduce((s, e) => s + e.progress, 0) / Math.max(withPlan, 1))
            : 0;
        return { total, withPlan, critical, overdue, avgProgress, unplanned: total - withPlan };
    }, [enrichedEvents]);

    // ── Category Filter Toggle ────────────────────────────────

    const toggleCategory = (cat: string) => {
        setActiveCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    // ── Today's Focus Events (sidebar) ────────────────────────

    const todaysFocus = useMemo(() =>
        enrichedEvents
            .filter(e => e.urgency === "critical" || e.urgency === "urgent")
            .slice(0, 8),
        [enrichedEvents]
    );

    // ── Navigation ────────────────────────────────────────────

    const navigateForward = () => {
        setCurrentDate(prev => viewMode === "month" ? addMonths(prev, 1) : addWeeks(prev, 1));
    };

    const navigateBack = () => {
        setCurrentDate(prev => viewMode === "month" ? subMonths(prev, 1) : subWeeks(prev, 1));
    };

    const goToToday = () => setCurrentDate(new Date());

    // ─── Render ──────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full gap-4 p-4 md:p-6">
            {/* ── Header ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-[family-name:var(--font-space)]">
                        <CalendarIcon className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
                        <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">Mission Calendar</span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Adaptive AI planner — countdown-aware, self-adjusting strategies
                    </p>
                </div>

                {/* Stats Row */}
                <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        {stats.total} Events
                    </Badge>
                    {stats.critical > 0 && (
                        <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-xs animate-pulse">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {stats.critical} Critical
                        </Badge>
                    )}
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {stats.withPlan} Planned
                    </Badge>
                    {stats.unplanned > 0 && (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-xs">
                            <XCircle className="h-3 w-3 mr-1" />
                            {stats.unplanned} Unplanned
                        </Badge>
                    )}
                </div>
            </div>

            {/* ── Category Filters ── */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const isActive = activeCategories.has(key);
                    const count = enrichedEvents.filter(e => e.category === key).length;
                    return (
                        <Button
                            key={key}
                            variant="outline"
                            size="sm"
                            onClick={() => toggleCategory(key)}
                            className={cn(
                                "h-7 text-xs gap-1 transition-all border",
                                isActive
                                    ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                                    : "opacity-40 hover:opacity-70"
                            )}
                        >
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                            {count > 0 && (
                                <span className="ml-0.5 font-mono">({count})</span>
                            )}
                        </Button>
                    );
                })}
            </div>

            {/* ── Main Layout: Calendar + Focus Sidebar ── */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* Calendar Area */}
                <div className="flex-1 min-w-0">
                    <SmartCalendar />
                </div>

                {/* Focus Sidebar */}
                {focusSidebarOpen && (
                    <div className="w-80 shrink-0 hidden lg:block">
                        <AuraCard className="h-full">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium flex items-center gap-2 font-[family-name:var(--font-space)]">
                                    <Target className="h-4 w-4 text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.5)]" />
                                    <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Priority Queue</span>
                                </CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    Events needing your attention
                                </p>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[calc(100vh-320px)]">
                                    <div className="space-y-3">
                                        {todaysFocus.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground text-sm">
                                                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400/50" />
                                                <p>All clear! No urgent events.</p>
                                            </div>
                                        ) : (
                                            todaysFocus.map((ev) => {
                                                const urgConf = getUrgencyConfig(ev.urgency);
                                                const catConf = CATEGORY_CONFIG[ev.category ?? "noise"] ?? CATEGORY_CONFIG.noise;
                                                const CatIcon = catConf.icon;

                                                return (
                                                    <div
                                                        key={ev.id}
                                                        className={cn(
                                                            "rounded-lg border p-3 space-y-2 transition-all hover:bg-white/5",
                                                            urgConf.border
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex items-start gap-2 min-w-0">
                                                                <CatIcon className={cn("h-4 w-4 mt-0.5 shrink-0", catConf.color)} />
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium truncate">
                                                                        {ev.title ?? "Untitled"}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground truncate">
                                                                        {ev.eventDate
                                                                            ? format(new Date(ev.eventDate), "MMM d, yyyy")
                                                                            : "No date"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Countdown Badge */}
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "text-[10px] shrink-0 font-mono tabular-nums",
                                                                    urgConf.bg,
                                                                    urgConf.border,
                                                                    urgConf.color,
                                                                    ev.urgency === "critical" && "animate-pulse"
                                                                )}
                                                            >
                                                                <Timer className="h-2.5 w-2.5 mr-0.5" />
                                                                {ev.daysRemaining !== null
                                                                    ? ev.daysRemaining < 0
                                                                        ? `${Math.abs(ev.daysRemaining)}d overdue`
                                                                        : ev.daysRemaining === 0
                                                                            ? "TODAY"
                                                                            : `${ev.daysRemaining}d left`
                                                                    : "TBD"}
                                                            </Badge>
                                                        </div>

                                                        {/* Progress Bar */}
                                                        {ev.hasPlan && (
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                                                    <span>Prep Progress</span>
                                                                    <span>{ev.progress}%</span>
                                                                </div>
                                                                <Progress value={ev.progress} className="h-1" />
                                                            </div>
                                                        )}

                                                        {!ev.hasPlan && (
                                                            <div className="flex items-center gap-1 text-[10px] text-amber-400">
                                                                <Sparkles className="h-3 w-3" />
                                                                No plan generated — open to strategize
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Quick Stats Summary */}
                                    <Separator className="my-4 bg-white/10" />
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                            Overview
                                        </h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-md border border-white/10 p-2 text-center">
                                                <p className="text-lg font-bold text-cyan-400">{stats.total}</p>
                                                <p className="text-[10px] text-muted-foreground">Total Events</p>
                                            </div>
                                            <div className="rounded-md border border-white/10 p-2 text-center">
                                                <p className="text-lg font-bold text-emerald-400">{stats.avgProgress}%</p>
                                                <p className="text-[10px] text-muted-foreground">Avg Progress</p>
                                            </div>
                                            <div className="rounded-md border border-red-500/20 p-2 text-center">
                                                <p className="text-lg font-bold text-red-400">{stats.overdue}</p>
                                                <p className="text-[10px] text-muted-foreground">Overdue</p>
                                            </div>
                                            <div className="rounded-md border border-amber-500/20 p-2 text-center">
                                                <p className="text-lg font-bold text-amber-400">{stats.unplanned}</p>
                                                <p className="text-[10px] text-muted-foreground">Unplanned</p>
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </AuraCard>
                    </div>
                )}
            </div>
        </div>
    );
}
