"use client";

// ===================================================================
// Smart Calendar — Command Center "Mission Control" Calendar
//
// Features:
//   • Month view with color-coded event pills (category → color)
//   • Click event → Sheet with full details
//   • Plan checklist with task completion tracking
//   • "Generate Strategy" button calls Strategist server action
//   • Drag-and-drop tasks between days (DnD Kit)
//   • Progress tracking (auto-calculated from done tasks)
//
// Data flow:
//   Events ← GET /api/events (server DB)
//   Plans  ← GET /api/event-plans?eventId=xxx (on-demand)
//   Plan mutations → PATCH /api/event-plans
//   Plan generation → generateEventPlan server action
// ===================================================================

import { useState, useEffect, useCallback, useMemo, useTransition } from "react";
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, format, isSameMonth, isSameDay,
    isToday, addMonths, subMonths, isPast, isFuture,
    differenceInCalendarDays,
} from "date-fns";
import {
    DndContext, DragOverlay, useDroppable, useDraggable,
    closestCenter, type DragEndEvent, type DragStartEvent,
    PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
    ChevronLeft, ChevronRight, Calendar as CalendarIcon,
    MapPin, ExternalLink, Clock, Sparkles, Loader2, GripVertical,
    CheckCircle2, Circle, Target, BookOpen, Trophy, Code2,
    Briefcase, Users, Shield, AlertTriangle, X, Timer, Zap,
} from "lucide-react";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { generateEventPlan, type PlanDay } from "@/actions/generate-event-plan";
import { refinePlan } from "@/actions/refine-plan";
import { adaptiveReplan, type AdaptiveReplanResult } from "@/actions/adaptive-replan";

// ─── Category Color System ───────────────────────────────────────

const CATEGORY_CONFIG: Record<
    string,
    {
        label: string;
        color: string;          // text color
        bg: string;             // pill background
        border: string;         // pill border
        badgeClass: string;     // badge variant
        icon: typeof Target;    // lucide icon
    }
> = {
    exam: {
        label: "Exam",
        color: "text-red-300",
        bg: "bg-red-500/15",
        border: "border-red-500/30",
        badgeClass: "border-red-500/30 text-red-400 bg-red-500/10",
        icon: AlertTriangle,
    },
    assignment: {
        label: "Assignment",
        color: "text-amber-300",
        bg: "bg-amber-500/15",
        border: "border-amber-500/30",
        badgeClass: "border-amber-500/30 text-amber-400 bg-amber-500/10",
        icon: BookOpen,
    },
    hackathon: {
        label: "Hackathon",
        color: "text-blue-300",
        bg: "bg-blue-500/15",
        border: "border-blue-500/30",
        badgeClass: "border-blue-500/30 text-blue-400 bg-blue-500/10",
        icon: Code2,
    },
    workshop: {
        label: "Workshop",
        color: "text-violet-300",
        bg: "bg-violet-500/15",
        border: "border-violet-500/30",
        badgeClass: "border-violet-500/30 text-violet-400 bg-violet-500/10",
        icon: Users,
    },
    contest: {
        label: "Contest",
        color: "text-cyan-300",
        bg: "bg-cyan-500/15",
        border: "border-cyan-500/30",
        badgeClass: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
        icon: Trophy,
    },
    internship: {
        label: "Internship",
        color: "text-emerald-300",
        bg: "bg-emerald-500/15",
        border: "border-emerald-500/30",
        badgeClass: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
        icon: Briefcase,
    },
    social: {
        label: "Social",
        color: "text-zinc-400",
        bg: "bg-zinc-500/10",
        border: "border-zinc-500/20",
        badgeClass: "border-zinc-500/30 text-zinc-400 bg-zinc-500/10",
        icon: Users,
    },
    noise: {
        label: "Noise",
        color: "text-zinc-500",
        bg: "bg-zinc-500/5",
        border: "border-zinc-500/10",
        badgeClass: "border-zinc-500/20 text-zinc-500 bg-zinc-500/5",
        icon: Shield,
    },
};

function getCategoryConfig(category: string | null) {
    return CATEGORY_CONFIG[category || "noise"] ?? CATEGORY_CONFIG.noise;
}

// ─── Types ───────────────────────────────────────────────────────

interface CalendarEvent {
    id: string;
    title: string | null;
    description: string | null;
    category: string | null;
    eventDate: string | null;
    deadline: string | null;
    location: string | null;
    url: string | null;
    source: string;
    status: string;
    priority: number | null;
    rawContext: string;
    createdAt: string;
}

// Plan task — supports both legacy string[] and rich { title, done }[] formats
interface PlanTask {
    title: string;
    done: boolean;
}

interface NormalizedPlanDay {
    day: number;
    focus: string;
    tasks: PlanTask[];
    resources: string[];
}

interface StoredPlan {
    id: string;
    eventId: string;
    generatedPlan: unknown;
    progress: number;
    isLocked: boolean;
}

// Normalize plan data: handle both string[] and {title,done}[] task formats
function normalizePlan(raw: unknown): NormalizedPlanDay[] {
    if (!raw) return [];
    const planArr = Array.isArray(raw) ? raw : (raw as { plan?: unknown[] }).plan;
    if (!Array.isArray(planArr)) return [];

    return planArr.map((d: Record<string, unknown>) => ({
        day: (d.day as number) ?? 0,
        focus: (d.focus as string) ?? "",
        tasks: ((d.tasks as unknown[]) ?? []).map((t) => {
            if (typeof t === "string") return { title: t, done: false };
            const obj = t as { title?: string; done?: boolean };
            return { title: obj.title ?? "", done: !!obj.done };
        }),
        resources: ((d.resources as string[]) ?? []),
    }));
}

function calculateProgress(days: NormalizedPlanDay[]): number {
    let total = 0;
    let done = 0;
    for (const d of days) {
        for (const t of d.tasks) {
            total++;
            if (t.done) done++;
        }
    }
    return total === 0 ? 0 : Math.round((done / total) * 100);
}

// ─── Draggable Task Component ────────────────────────────────────

function DraggableTask({
    task,
    dayIndex,
    taskIndex,
    onToggle,
    isLocked,
}: {
    task: PlanTask;
    dayIndex: number;
    taskIndex: number;
    onToggle: () => void;
    isLocked: boolean;
}) {
    const dragId = `task-${dayIndex}-${taskIndex}`;
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: dragId,
        data: { dayIndex, taskIndex, task },
        disabled: isLocked,
    });

    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 p-2 rounded-lg transition-all group",
                "bg-white/5 border border-white/10 hover:border-white/20",
                isDragging && "opacity-40 scale-95",
                task.done && "opacity-60",
            )}
        >
            {!isLocked && (
                <button
                    {...listeners}
                    {...attributes}
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-white transition-colors shrink-0"
                    aria-label="Drag to reorder"
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </button>
            )}
            <Checkbox
                checked={task.done}
                onCheckedChange={onToggle}
                disabled={isLocked}
                className="shrink-0"
            />
            <span
                className={cn(
                    "text-sm flex-1",
                    task.done && "line-through text-muted-foreground"
                )}
            >
                {task.title}
            </span>
        </div>
    );
}

// ─── Droppable Day Column ────────────────────────────────────────

function DroppableDayColumn({
    day,
    dayIndex,
    onToggleTask,
    isLocked,
    isOver,
}: {
    day: NormalizedPlanDay;
    dayIndex: number;
    onToggleTask: (dayIndex: number, taskIndex: number) => void;
    isLocked: boolean;
    isOver: boolean;
}) {
    const { setNodeRef } = useDroppable({
        id: `day-${dayIndex}`,
        data: { dayIndex },
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "rounded-xl border p-3 transition-all",
                isOver
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-white/10 bg-white/[0.02]",
            )}
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="bg-violet-500/10 text-violet-400 text-xs font-bold px-2 py-1 rounded-md">
                    Day {day.day}
                </div>
                <span className="text-sm font-medium text-muted-foreground truncate">
                    {day.focus}
                </span>
            </div>

            <div className="space-y-1.5">
                {day.tasks.map((task, ti) => (
                    <DraggableTask
                        key={`${dayIndex}-${ti}-${task.title}`}
                        task={task}
                        dayIndex={dayIndex}
                        taskIndex={ti}
                        onToggle={() => onToggleTask(dayIndex, ti)}
                        isLocked={isLocked}
                    />
                ))}
                {day.tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-2">
                        Drop tasks here
                    </p>
                )}
            </div>

            {day.resources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/5">
                    <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
                        Resources
                    </p>
                    {day.resources.map((r, ri) => (
                        <p key={ri} className="text-xs text-violet-400/70 truncate">
                            {r}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main Smart Calendar ─────────────────────────────────────────

export function SmartCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);

    // Sheet state
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Plan state
    const [planDays, setPlanDays] = useState<NormalizedPlanDay[]>([]);
    const [planMeta, setPlanMeta] = useState<{ isLocked: boolean; progress: number } | null>(null);
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [generatingPlan, startGenerating] = useTransition();

    // Re-Strategize (refinement) state
    const [feedbackText, setFeedbackText] = useState("");
    const [refining, startRefining] = useTransition();

    // Countdown + Adaptive Replan state
    const [replanResult, setReplanResult] = useState<AdaptiveReplanResult | null>(null);
    const [replanChecking, setReplanChecking] = useState(false);

    // DnD state
    const [activeTask, setActiveTask] = useState<{ task: PlanTask; dayIndex: number; taskIndex: number } | null>(null);
    const [overDayIndex, setOverDayIndex] = useState<number | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // ── Fetch events ─────────────────────────────────────────
    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/events");
            if (!res.ok) return;
            const data = await res.json();
            setEvents(data.events ?? []);
        } catch (err) {
            console.error("[SmartCalendar] Fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // ── Calendar grid computation ────────────────────────────
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
        return eachDayOfInterval({ start: calStart, end: calEnd });
    }, [currentMonth]);

    // Group events by date
    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const ev of events) {
            const dateStr = ev.eventDate
                ? format(new Date(ev.eventDate), "yyyy-MM-dd")
                : null;
            if (!dateStr) continue;
            if (!map.has(dateStr)) map.set(dateStr, []);
            map.get(dateStr)!.push(ev);
        }
        return map;
    }, [events]);

    // Stats
    const stats = useMemo(() => {
        const now = new Date();
        const upcoming = events.filter(
            (e) => e.eventDate && isFuture(new Date(e.eventDate))
        ).length;
        const thisWeek = events.filter((e) => {
            if (!e.eventDate) return false;
            const d = new Date(e.eventDate);
            return differenceInCalendarDays(d, now) >= 0 && differenceInCalendarDays(d, now) <= 7;
        }).length;
        return { total: events.length, upcoming, thisWeek };
    }, [events]);

    // ── Open event detail ────────────────────────────────────
    const openEventSheet = async (ev: CalendarEvent) => {
        setSelectedEvent(ev);
        setSheetOpen(true);
        setPlanDays([]);
        setPlanMeta(null);
        setReplanResult(null);
        setReplanChecking(false);

        // Fetch plan on-demand
        try {
            setLoadingPlan(true);
            const res = await fetch(`/api/event-plans?eventId=${ev.id}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.plan) {
                const stored = data.plan as StoredPlan;
                const normalized = normalizePlan(stored.generatedPlan);
                setPlanDays(normalized);
                setPlanMeta({
                    isLocked: stored.isLocked,
                    progress: stored.progress,
                });

                // Auto-check staleness for adaptive replanning
                if (!stored.isLocked && normalized.length > 0) {
                    setReplanChecking(true);
                    try {
                        const replan = await adaptiveReplan(ev.id);
                        setReplanResult(replan);
                        if (replan.success && replan.wasStale && replan.plan) {
                            // Auto-update with compressed plan
                            setPlanDays(normalizePlan(replan.plan));
                            setPlanMeta(prev => prev ? { ...prev, progress: calculateProgress(normalizePlan(replan.plan!)) } : null);
                        }
                    } catch (err) {
                        console.error("[SmartCalendar] Replan check error:", err);
                    } finally {
                        setReplanChecking(false);
                    }
                }
            }
        } catch (err) {
            console.error("[SmartCalendar] Plan fetch error:", err);
        } finally {
            setLoadingPlan(false);
        }
    };

    // ── Generate plan ────────────────────────────────────────
    const handleGeneratePlan = () => {
        if (!selectedEvent) return;
        startGenerating(async () => {
            const result = await generateEventPlan(selectedEvent.id);
            if (result.success && result.plan) {
                const normalized = normalizePlan(result.plan);
                setPlanDays(normalized);
                setPlanMeta({ isLocked: false, progress: 0 });
            }
        });
    };

    // ── Save plan to server ──────────────────────────────────
    const savePlan = useCallback(
        async (days: NormalizedPlanDay[]) => {
            if (!selectedEvent) return;
            const progress = calculateProgress(days);
            try {
                await fetch("/api/event-plans", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        eventId: selectedEvent.id,
                        generatedPlan: days,
                        progress,
                    }),
                });
                setPlanMeta((prev) => prev ? { ...prev, progress } : null);
            } catch (err) {
                console.error("[SmartCalendar] Save error:", err);
            }
        },
        [selectedEvent]
    );

    // ── Toggle task completion ───────────────────────────────
    const toggleTask = (dayIndex: number, taskIndex: number) => {
        setPlanDays((prev) => {
            const next = prev.map((d, di) =>
                di === dayIndex
                    ? {
                          ...d,
                          tasks: d.tasks.map((t, ti) =>
                              ti === taskIndex ? { ...t, done: !t.done } : t
                          ),
                      }
                    : d
            );
            savePlan(next);
            return next;
        });
    };

    // ── DnD handlers ─────────────────────────────────────────
    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as {
            dayIndex: number;
            taskIndex: number;
            task: PlanTask;
        } | undefined;
        if (data) {
            setActiveTask(data);
        }
    };

    const handleDragOver = (event: { over: { data?: { current?: { dayIndex?: number } } } | null }) => {
        const dayIdx = event.over?.data?.current?.dayIndex;
        setOverDayIndex(dayIdx !== undefined ? (dayIdx as number) : null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveTask(null);
        setOverDayIndex(null);

        const activeData = event.active.data.current as {
            dayIndex: number;
            taskIndex: number;
            task: PlanTask;
        } | undefined;

        const overData = event.over?.data?.current as { dayIndex?: number } | undefined;

        if (!activeData || overData?.dayIndex === undefined) return;
        const fromDay = activeData.dayIndex;
        const toDay = overData.dayIndex;
        if (fromDay === toDay) return;

        setPlanDays((prev) => {
            const next = prev.map((d) => ({ ...d, tasks: [...d.tasks] }));
            const [movedTask] = next[fromDay].tasks.splice(activeData.taskIndex, 1);
            next[toDay].tasks.push(movedTask);
            savePlan(next);
            return next;
        });
    };

    const handleDragCancel = () => {
        setActiveTask(null);
        setOverDayIndex(null);
    };

    // ── Refine plan (Re-Strategize) ──────────────────────────
    const handleRefinePlan = () => {
        if (!selectedEvent || !feedbackText.trim() || planDays.length === 0) return;
        startRefining(async () => {
            const result = await refinePlan(
                selectedEvent.id,
                planDays,
                feedbackText.trim()
            );
            if (result.success && result.plan) {
                const normalized = normalizePlan(result.plan);
                setPlanDays(normalized);
                const newProgress = calculateProgress(normalized);
                setPlanMeta((prev) => prev ? { ...prev, progress: newProgress } : null);
                setFeedbackText("");
            }
        });
    };

    // ── Navigation ───────────────────────────────────────────
    const goToday = () => setCurrentMonth(new Date());
    const goPrev = () => setCurrentMonth((m) => subMonths(m, 1));
    const goNext = () => setCurrentMonth((m) => addMonths(m, 1));

    // ── Render ───────────────────────────────────────────────
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const progress = planDays.length > 0 ? calculateProgress(planDays) : 0;

    return (
        <div className="space-y-6">
            {/* ── Stats Row ─────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
                <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-violet-500/10 p-2 rounded-lg border border-violet-500/10">
                                <CalendarIcon className="h-4 w-4 text-violet-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                    Total Events
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/10">
                                <Clock className="h-4 w-4 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.thisWeek}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                    This Week
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/10">
                                <Target className="h-4 w-4 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.upcoming}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                    Upcoming
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Calendar Card ─────────────────────────────── */}
            <Card className="border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
                {/* Header */}
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-bold">
                            {format(currentMonth, "MMMM yyyy")}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={goToday}
                                className="text-xs text-muted-foreground hover:text-white"
                            >
                                Today
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="px-3 pb-3">
                    {/* Category Legend */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {Object.entries(CATEGORY_CONFIG)
                            .filter(([k]) => !["noise", "social"].includes(k))
                            .map(([key, cfg]) => (
                                <div key={key} className="flex items-center gap-1.5">
                                    <div className={cn("h-2.5 w-2.5 rounded-full", cfg.bg, cfg.border, "border")} />
                                    <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                                </div>
                            ))}
                    </div>

                    {/* Weekday Header */}
                    <div className="grid grid-cols-7 mb-1">
                        {weekDays.map((d) => (
                            <div
                                key={d}
                                className="text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider py-2"
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Day Grid */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden border border-white/10">
                            {calendarDays.map((day) => {
                                const dayStr = format(day, "yyyy-MM-dd");
                                const dayEvents = eventsByDate.get(dayStr) ?? [];
                                const inMonth = isSameMonth(day, currentMonth);
                                const today = isToday(day);
                                const past = isPast(day) && !today;
                                const MAX_PILLS = 3;

                                return (
                                    <div
                                        key={dayStr}
                                        className={cn(
                                            "min-h-[90px] p-1.5 bg-background/80 transition-colors",
                                            !inMonth && "opacity-30",
                                            today && "ring-1 ring-inset ring-violet-500/40 bg-violet-500/[0.03]",
                                            past && inMonth && "opacity-60",
                                        )}
                                    >
                                        {/* Day Number */}
                                        <div
                                            className={cn(
                                                "text-xs font-medium mb-1 h-5 w-5 flex items-center justify-center rounded-full",
                                                today
                                                    ? "bg-violet-500 text-white"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {format(day, "d")}
                                        </div>

                                        {/* Event Pills */}
                                        <div className="space-y-0.5">
                                            {dayEvents.slice(0, MAX_PILLS).map((ev) => {
                                                const cfg = getCategoryConfig(ev.category);
                                                return (
                                                    <button
                                                        key={ev.id}
                                                        onClick={() => openEventSheet(ev)}
                                                        className={cn(
                                                            "w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate",
                                                            "border transition-all hover:brightness-125 cursor-pointer flex items-center gap-1",
                                                            cfg.bg,
                                                            cfg.border,
                                                            cfg.color,
                                                        )}
                                                        title={ev.title ?? "Untitled event"}
                                                    >
                                                        <span className="truncate flex-1">{ev.title ?? "Untitled"}</span>
                                                        {(() => {
                                                            const td = ev.deadline ?? ev.eventDate;
                                                            if (!td) return null;
                                                            const dl = differenceInCalendarDays(new Date(td), new Date());
                                                            if (dl > 14) return null;
                                                            return (
                                                                <span className={cn(
                                                                    "shrink-0 text-[8px] font-bold tabular-nums",
                                                                    dl <= 0 ? "text-red-400" : dl <= 3 ? "text-red-400" : dl <= 7 ? "text-amber-400" : "text-blue-400"
                                                                )}>
                                                                    {dl <= 0 ? "!" : `${dl}d`}
                                                                </span>
                                                            );
                                                        })()}
                                                    </button>
                                                );
                                            })}
                                            {dayEvents.length > MAX_PILLS && (
                                                <p className="text-[9px] text-muted-foreground text-center">
                                                    +{dayEvents.length - MAX_PILLS} more
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Event Detail Sheet ────────────────────────── */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto border-white/10 bg-background/95 backdrop-blur-xl">
                    {selectedEvent && (
                        <>
                            <SheetHeader className="pb-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1.5 flex-1 min-w-0">
                                        <SheetTitle className="text-xl leading-tight">
                                            {selectedEvent.title ?? "Untitled Event"}
                                        </SheetTitle>
                                        <SheetDescription className="sr-only">
                                            Event details and preparation plan
                                        </SheetDescription>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedEvent.category && (
                                                <Badge
                                                    variant="outline"
                                                    className={getCategoryConfig(selectedEvent.category).badgeClass}
                                                >
                                                    {getCategoryConfig(selectedEvent.category).label}
                                                </Badge>
                                            )}
                                            <Badge variant="outline" className="border-white/10 text-muted-foreground">
                                                {selectedEvent.source}
                                            </Badge>
                                            <Badge variant="outline" className="border-white/10 text-muted-foreground">
                                                {selectedEvent.status}
                                            </Badge>
                                            {/* Countdown Badge */}
                                            {(() => {
                                                const targetDate = selectedEvent.deadline ?? selectedEvent.eventDate;
                                                if (!targetDate) return null;
                                                const daysLeft = differenceInCalendarDays(new Date(targetDate), new Date());
                                                const urgency = daysLeft <= 0 ? "overdue" : daysLeft <= 3 ? "critical" : daysLeft <= 7 ? "urgent" : daysLeft <= 14 ? "normal" : "future";
                                                const urgencyStyles = {
                                                    overdue: "border-red-500/50 bg-red-500/20 text-red-400 animate-pulse",
                                                    critical: "border-red-500/40 bg-red-500/15 text-red-400 animate-pulse",
                                                    urgent: "border-amber-500/40 bg-amber-500/15 text-amber-400",
                                                    normal: "border-blue-500/30 bg-blue-500/10 text-blue-400",
                                                    future: "border-white/10 text-muted-foreground",
                                                };
                                                return (
                                                    <Badge variant="outline" className={cn("gap-1", urgencyStyles[urgency])}>
                                                        <Timer className="h-3 w-3" />
                                                        {daysLeft <= 0 ? "Overdue" : `${daysLeft}d left`}
                                                    </Badge>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </SheetHeader>

                            <Separator className="bg-white/10" />

                            {/* Event Info */}
                            <div className="grid grid-cols-2 gap-3 py-4">
                                {selectedEvent.eventDate && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <CalendarIcon className="h-4 w-4 text-violet-400 shrink-0" />
                                        <span className="text-muted-foreground">
                                            {format(new Date(selectedEvent.eventDate), "MMM d, yyyy")}
                                        </span>
                                    </div>
                                )}
                                {selectedEvent.deadline && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                                        <span className="text-muted-foreground">
                                            Deadline: {format(new Date(selectedEvent.deadline), "MMM d, yyyy")}
                                        </span>
                                    </div>
                                )}
                                {selectedEvent.location && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                                        <span className="text-muted-foreground truncate">
                                            {selectedEvent.location}
                                        </span>
                                    </div>
                                )}
                                {selectedEvent.url && (
                                    <a
                                        href={selectedEvent.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        <ExternalLink className="h-4 w-4 shrink-0" />
                                        <span className="truncate">Open Link</span>
                                    </a>
                                )}
                            </div>

                            {selectedEvent.description && (
                                <div className="pb-4">
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {selectedEvent.description}
                                    </p>
                                </div>
                            )}

                            <Separator className="bg-white/10" />

                            {/* Replan Status Banner */}
                            {replanChecking && (
                                <div className="flex items-center gap-2 py-3 px-4 bg-violet-500/10 border border-violet-500/20 rounded-lg mt-4">
                                    <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                                    <span className="text-xs text-violet-300">Checking plan freshness...</span>
                                </div>
                            )}
                            {replanResult?.wasStale && !replanChecking && (
                                <div className="flex items-center gap-2 py-3 px-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-4">
                                    <Zap className="h-4 w-4 text-amber-400" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-amber-300">
                                            Plan auto-compressed: {replanResult.originalDays} → {replanResult.newDays} days
                                        </p>
                                        <p className="text-[10px] text-amber-400/70">
                                            {replanResult.daysRemaining}d remaining · {replanResult.urgency} priority
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* ── Plan Section ──────────────────── */}
                            <div className="pt-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-violet-400" />
                                        Preparation Plan
                                    </h3>
                                    {planDays.length > 0 && (
                                        <Badge variant="outline" className="border-violet-500/30 text-violet-400 text-[10px]">
                                            {planDays.length} days
                                        </Badge>
                                    )}
                                </div>

                                {loadingPlan ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        <span className="ml-2 text-sm text-muted-foreground">
                                            Loading plan...
                                        </span>
                                    </div>
                                ) : planDays.length === 0 ? (
                                    /* No plan — Generate Strategy CTA */
                                    <Card className="border-dashed border-white/10 bg-white/[0.02]">
                                        <CardContent className="py-10 text-center">
                                            <Sparkles className="h-10 w-10 mx-auto mb-3 text-violet-500/40" />
                                            <p className="text-sm font-medium mb-1">
                                                No preparation plan yet
                                            </p>
                                            <p className="text-xs text-muted-foreground mb-4">
                                                Let The Strategist create a personalized day-by-day plan
                                                based on your skill profile.
                                            </p>
                                            <Button
                                                onClick={handleGeneratePlan}
                                                disabled={generatingPlan}
                                                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white"
                                            >
                                                {generatingPlan ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Generating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="h-4 w-4 mr-2" />
                                                        Generate Strategy
                                                    </>
                                                )}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    /* Plan exists — show checklist with DnD */
                                    <div className="space-y-4">
                                        {/* Progress Bar */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">
                                                    Progress
                                                </span>
                                                <span className={cn(
                                                    "font-bold",
                                                    progress >= 100
                                                        ? "text-emerald-400"
                                                        : progress >= 50
                                                            ? "text-amber-400"
                                                            : "text-muted-foreground"
                                                )}>
                                                    {progress}%
                                                </span>
                                            </div>
                                            <Progress
                                                value={progress}
                                                className="h-2"
                                            />
                                        </div>

                                        {planMeta?.isLocked && (
                                            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                <Shield className="h-4 w-4 text-amber-400" />
                                                <span className="text-xs text-amber-400">
                                                    Plan is locked — task completion is frozen
                                                </span>
                                            </div>
                                        )}

                                        {/* Day-by-day Plan with DnD */}
                                        <ScrollArea className="max-h-[50vh]">
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragStart={handleDragStart}
                                                onDragOver={handleDragOver}
                                                onDragEnd={handleDragEnd}
                                                onDragCancel={handleDragCancel}
                                            >
                                                <div className="space-y-3 pr-3">
                                                    {planDays.map((day, di) => (
                                                        <DroppableDayColumn
                                                            key={`day-${di}`}
                                                            day={day}
                                                            dayIndex={di}
                                                            onToggleTask={toggleTask}
                                                            isLocked={planMeta?.isLocked ?? false}
                                                            isOver={overDayIndex === di}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Drag Overlay */}
                                                <DragOverlay>
                                                    {activeTask ? (
                                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-500/20 border border-violet-500/40 shadow-xl">
                                                            <GripVertical className="h-3.5 w-3.5 text-violet-400" />
                                                            <span className="text-sm">{activeTask.task.title}</span>
                                                        </div>
                                                    ) : null}
                                                </DragOverlay>
                                            </DndContext>
                                        </ScrollArea>

                                        {/* ── Re-Strategize Input ──────── */}
                                        {!planMeta?.isLocked && (
                                            <div className="space-y-2 pt-2">
                                                <Separator className="bg-white/10" />
                                                <p className="text-xs text-muted-foreground">
                                                    Ask Jarvis to tweak this plan
                                                </p>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={feedbackText}
                                                        onChange={(e) => setFeedbackText(e.target.value)}
                                                        placeholder="e.g. I'm sick today, shift everything by one day..."
                                                        className="flex-1 bg-white/5 border-white/10 text-sm placeholder:text-muted-foreground/50"
                                                        disabled={refining}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" && !e.shiftKey) {
                                                                e.preventDefault();
                                                                handleRefinePlan();
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        size="sm"
                                                        onClick={handleRefinePlan}
                                                        disabled={refining || !feedbackText.trim()}
                                                        className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shrink-0"
                                                    >
                                                        {refining ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Regenerate Button */}
                                        {!planMeta?.isLocked && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleGeneratePlan}
                                                disabled={generatingPlan}
                                                className="w-full border-white/10 hover:bg-white/5"
                                            >
                                                {generatingPlan ? (
                                                    <>
                                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                                        Regenerating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="h-3.5 w-3.5 mr-2" />
                                                        Regenerate Plan
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
