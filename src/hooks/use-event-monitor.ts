"use client";

/**
 * useEventMonitor — Periodic event staleness checker + notification system.
 *
 * Features:
 *   • Auto-polls every N minutes for stale plans
 *   • Tracks new events detected since last check
 *   • Surfaces urgent unplanned events
 *   • Provides notification state for UI banners/toasts
 *
 * Uses the adaptive-replan action to detect plan staleness.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { checkAllPlanStaleness, type StalenessReport } from "@/actions/adaptive-replan";
import { differenceInCalendarDays } from "date-fns";

// ─── Types ──────────────────────────────────────────────────

interface EventMonitorAlert {
    id: string;
    type: "stale_plan" | "urgent_unplanned" | "new_event" | "overdue";
    eventId: string;
    title: string;
    message: string;
    urgency: "critical" | "urgent" | "normal";
    timestamp: number;
    dismissed: boolean;
}

interface EventMonitorState {
    alerts: EventMonitorAlert[];
    staleness: StalenessReport | null;
    lastChecked: Date | null;
    isChecking: boolean;
    urgentCount: number;
    staleCount: number;
}

interface CalendarEvent {
    id: string;
    title: string | null;
    category: string | null;
    eventDate: string | null;
    deadline: string | null;
    status: string | null;
}

// ─── Hook ───────────────────────────────────────────────────

export function useEventMonitor(options?: {
    pollIntervalMs?: number;
    enabled?: boolean;
}) {
    const {
        pollIntervalMs = 10 * 60 * 1000, // 10 minutes default
        enabled = true,
    } = options ?? {};

    const [state, setState] = useState<EventMonitorState>({
        alerts: [],
        staleness: null,
        lastChecked: null,
        isChecking: false,
        urgentCount: 0,
        staleCount: 0,
    });

    const knownEventIds = useRef<Set<string>>(new Set());
    const isFirstRun = useRef(true);

    // ── Check for stale plans ──────────────────────────────

    const checkStaleness = useCallback(async () => {
        setState(prev => ({ ...prev, isChecking: true }));
        try {
            const report = await checkAllPlanStaleness();
            const newAlerts: EventMonitorAlert[] = [];

            for (const staleEvent of report.staleEvents) {
                newAlerts.push({
                    id: `stale-${staleEvent.eventId}-${Date.now()}`,
                    type: "stale_plan",
                    eventId: staleEvent.eventId,
                    title: staleEvent.title ?? "Untitled",
                    message: `Plan has ${staleEvent.planDays} days but only ${staleEvent.daysRemaining}d remain — needs recompression`,
                    urgency: staleEvent.daysRemaining <= 3 ? "critical" : staleEvent.daysRemaining <= 7 ? "urgent" : "normal",
                    timestamp: Date.now(),
                    dismissed: false,
                });
            }

            setState(prev => ({
                ...prev,
                staleness: report,
                lastChecked: new Date(),
                isChecking: false,
                staleCount: report.staleCount,
                alerts: [
                    // Keep existing non-stale alerts
                    ...prev.alerts.filter(a => a.type !== "stale_plan"),
                    ...newAlerts,
                ],
            }));
        } catch (err) {
            console.error("[EventMonitor] Staleness check error:", err);
            setState(prev => ({ ...prev, isChecking: false }));
        }
    }, []);

    // ── Check for urgent unplanned + new events ────────────

    const checkEvents = useCallback(async () => {
        try {
            const res = await fetch("/api/events");
            if (!res.ok) return;
            const data = await res.json();
            const events: CalendarEvent[] = Array.isArray(data) ? data : data.events ?? [];

            const now = new Date();
            const newAlerts: EventMonitorAlert[] = [];
            let urgentCount = 0;

            for (const ev of events) {
                const targetDate = ev.deadline ?? ev.eventDate;
                if (!targetDate) continue;

                const daysLeft = differenceInCalendarDays(new Date(targetDate), now);

                // Track new events (skip on first run to avoid flooding)
                if (!isFirstRun.current && !knownEventIds.current.has(ev.id)) {
                    newAlerts.push({
                        id: `new-${ev.id}-${Date.now()}`,
                        type: "new_event",
                        eventId: ev.id,
                        title: ev.title ?? "Untitled",
                        message: `New event detected: ${ev.title ?? "Untitled"} (${ev.category ?? "unknown"})`,
                        urgency: daysLeft <= 3 ? "critical" : daysLeft <= 7 ? "urgent" : "normal",
                        timestamp: Date.now(),
                        dismissed: false,
                    });
                }
                knownEventIds.current.add(ev.id);

                // Track urgent unplanned
                if (daysLeft >= 0 && daysLeft <= 7) {
                    urgentCount++;

                    // Check if has plan
                    if (daysLeft <= 3) {
                        try {
                            const planRes = await fetch(`/api/event-plans?eventId=${ev.id}`);
                            if (planRes.ok) {
                                const planData = await planRes.json();
                                if (!planData.plan) {
                                    newAlerts.push({
                                        id: `unplanned-${ev.id}-${Date.now()}`,
                                        type: "urgent_unplanned",
                                        eventId: ev.id,
                                        title: ev.title ?? "Untitled",
                                        message: `Critical: "${ev.title}" in ${daysLeft}d with NO preparation plan!`,
                                        urgency: "critical",
                                        timestamp: Date.now(),
                                        dismissed: false,
                                    });
                                }
                            }
                        } catch {
                            // Skip plan check failures
                        }
                    }

                    // Check overdue
                    if (daysLeft < 0) {
                        newAlerts.push({
                            id: `overdue-${ev.id}-${Date.now()}`,
                            type: "overdue",
                            eventId: ev.id,
                            title: ev.title ?? "Untitled",
                            message: `"${ev.title}" is ${Math.abs(daysLeft)} days overdue!`,
                            urgency: "critical",
                            timestamp: Date.now(),
                            dismissed: false,
                        });
                    }
                }
            }

            isFirstRun.current = false;

            setState(prev => ({
                ...prev,
                urgentCount,
                alerts: [
                    ...prev.alerts.filter(a => a.type !== "new_event" && a.type !== "urgent_unplanned" && a.type !== "overdue"),
                    ...newAlerts,
                ],
            }));
        } catch (err) {
            console.error("[EventMonitor] Event check error:", err);
        }
    }, []);

    // ── Dismiss an alert ────────────────────────────────────

    const dismissAlert = useCallback((alertId: string) => {
        setState(prev => ({
            ...prev,
            alerts: prev.alerts.map(a =>
                a.id === alertId ? { ...a, dismissed: true } : a
            ),
        }));
    }, []);

    const dismissAll = useCallback(() => {
        setState(prev => ({
            ...prev,
            alerts: prev.alerts.map(a => ({ ...a, dismissed: true })),
        }));
    }, []);

    // ── Active (non-dismissed) alerts ────────────────────────

    const activeAlerts = state.alerts.filter(a => !a.dismissed);
    const criticalAlerts = activeAlerts.filter(a => a.urgency === "critical");

    // ── Polling ─────────────────────────────────────────────

    useEffect(() => {
        if (!enabled) return;

        // Initial check
        const initialCheck = async () => {
            await checkEvents();
            await checkStaleness();
        };
        initialCheck();

        // Poll periodically
        const interval = setInterval(async () => {
            await checkEvents();
            await checkStaleness();
        }, pollIntervalMs);

        return () => clearInterval(interval);
    }, [enabled, pollIntervalMs, checkEvents, checkStaleness]);

    // ── Force refresh ────────────────────────────────────────

    const refresh = useCallback(async () => {
        await checkEvents();
        await checkStaleness();
    }, [checkEvents, checkStaleness]);

    return {
        ...state,
        activeAlerts,
        criticalAlerts,
        hasCritical: criticalAlerts.length > 0,
        hasAlerts: activeAlerts.length > 0,
        dismissAlert,
        dismissAll,
        refresh,
    };
}
