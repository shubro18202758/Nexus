"use server";

// ===================================================================
// Adaptive Replanner — Countdown-Aware Plan Compression
//
// ██  "Your exam is in 3 days but the plan was built for 10."  ██
//
// Flow:
//   1. Load existing plan + event date
//   2. Calculate remaining days vs plan days
//   3. If plan is stale (more plan days than real days), compress
//   4. Uses Groq 70B (Beta) to intelligently merge/prioritize tasks
//   5. Overwrites the event_plans entry with compressed plan
//
// This runs AUTOMATICALLY when the SmartCalendar opens a stale plan,
// or can be triggered manually from the calendar sidebar.
// ===================================================================

import { serverDb } from "@/lib/server-db";
import { events, eventPlans, students, learningProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractJson } from "@/lib/ai/llm-engine";

// ─── Groq Config ─────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const REPLAN_MODEL = "llama-3.3-70b-versatile";

function getBetaKey(): string {
    const key = process.env.GROQ_NANOBOT_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("No GROQ_NANOBOT_KEY for Adaptive Replanner");
    return key;
}

async function groqChat(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    opts: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
    const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getBetaKey()}`,
        },
        body: JSON.stringify({
            model: REPLAN_MODEL,
            messages,
            temperature: opts.temperature ?? 0.25,
            max_tokens: opts.max_tokens ?? 4096,
            response_format: { type: "json_object" },
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq Replan error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

// ─── Types ───────────────────────────────────────────────────────

interface PlanTask {
    title: string;
    done: boolean;
}

interface PlanDay {
    day: number;
    focus: string;
    tasks: PlanTask[];
    resources: string[];
}

export interface AdaptiveReplanResult {
    success: boolean;
    wasStale: boolean;
    originalDays: number;
    newDays: number;
    daysRemaining: number;
    urgency: string;
    plan?: PlanDay[];
    message: string;
    error?: string;
}

export interface StalenessReport {
    staleEvents: Array<{
        eventId: string;
        title: string | null;
        daysRemaining: number;
        planDays: number;
        urgency: string;
    }>;
    freshCount: number;
    staleCount: number;
}

// ─── Normalize helpers ───────────────────────────────────────────

function normalizeTasks(tasks: unknown[]): PlanTask[] {
    return tasks.map((t) => {
        if (typeof t === "string") return { title: t, done: false };
        const obj = t as { title?: string; done?: boolean; text?: string };
        return { title: obj.title ?? obj.text ?? String(t), done: !!obj.done };
    });
}

function normalizePlan(raw: unknown): PlanDay[] {
    if (!raw) return [];
    const planArr = Array.isArray(raw) ? raw : (raw as { plan?: unknown[] }).plan;
    if (!Array.isArray(planArr)) return [];
    return planArr.map((d: Record<string, unknown>) => ({
        day: (d.day as number) ?? 0,
        focus: (d.focus as string) ?? "",
        tasks: normalizeTasks((d.tasks as unknown[]) ?? []),
        resources: (d.resources as string[]) ?? [],
    }));
}

// ─── Urgency Calculator ─────────────────────────────────────────

function calcUrgency(daysRemaining: number): "critical" | "urgent" | "normal" | "future" {
    if (daysRemaining <= 3) return "critical";
    if (daysRemaining <= 7) return "urgent";
    if (daysRemaining <= 14) return "normal";
    return "future";
}

// ─── Main: Check staleness and replan ────────────────────────────

export async function adaptiveReplan(eventId: string): Promise<AdaptiveReplanResult> {
    try {
        console.log(`\n⏰ [Adaptive Replan] Checking staleness for event: ${eventId}`);

        // ── 1. Fetch event details ───────────────────────────
        const eventRows = await serverDb
            .select()
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (eventRows.length === 0) {
            return {
                success: false, wasStale: false, originalDays: 0,
                newDays: 0, daysRemaining: 0, urgency: "future",
                message: "Event not found", error: "Event not found",
            };
        }

        const event = eventRows[0];
        const targetDate = event.deadline ?? event.eventDate;

        if (!targetDate) {
            return {
                success: true, wasStale: false, originalDays: 0,
                newDays: 0, daysRemaining: 999, urgency: "future",
                message: "No date set — no replan needed",
            };
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const target = new Date(targetDate);
        target.setHours(0, 0, 0, 0);
        const daysRemaining = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const urgency = calcUrgency(daysRemaining);

        // ── 2. Fetch existing plan ───────────────────────────
        const planRows = await serverDb
            .select()
            .from(eventPlans)
            .where(eq(eventPlans.eventId, eventId))
            .limit(1);

        if (planRows.length === 0) {
            return {
                success: true, wasStale: false, originalDays: 0,
                newDays: 0, daysRemaining, urgency,
                message: "No plan exists yet — generate one first",
            };
        }

        const existingPlan = planRows[0];
        if (existingPlan.isLocked) {
            return {
                success: true, wasStale: false,
                originalDays: 0, newDays: 0, daysRemaining, urgency,
                message: "Plan is locked — cannot auto-adjust",
            };
        }

        const currentPlan = normalizePlan(existingPlan.generatedPlan);
        const originalDays = currentPlan.length;

        // ── 3. Check staleness ───────────────────────────────
        // Plan is stale if it has more days than remaining
        const effectiveDays = Math.max(daysRemaining, 1); // At least 1 day plan
        const isStale = originalDays > effectiveDays;

        if (!isStale) {
            console.log(`   ✅ Plan is fresh (${originalDays} days, ${daysRemaining} remaining)`);
            return {
                success: true, wasStale: false,
                originalDays, newDays: originalDays,
                daysRemaining, urgency,
                message: `Plan is current — ${daysRemaining} days remaining`,
                plan: currentPlan,
            };
        }

        console.log(`   ⚠️ STALE! Plan: ${originalDays} days → ${effectiveDays} days remaining`);

        // ── 4. Build compression prompt ──────────────────────
        // Preserve completed tasks, merge incompletes into fewer days
        const completedTasks: string[] = [];
        const incompleteTasks: PlanDay[] = [];

        for (const day of currentPlan) {
            const tasks = day.tasks;
            const incomplete = tasks.filter(t => !t.done);
            const complete = tasks.filter(t => t.done);
            completedTasks.push(...complete.map(t => t.title));

            if (incomplete.length > 0) {
                incompleteTasks.push({
                    ...day,
                    tasks: incomplete,
                });
            }
        }

        const system =
            `You are an intelligent study plan compressor for a student preparing for an event.\n\n` +
            `CONTEXT:\n` +
            `- The student originally had a ${originalDays}-day plan\n` +
            `- They now have ONLY ${effectiveDays} day(s) remaining\n` +
            `- Some tasks have been completed (preserved below)\n` +
            `- You must compress the remaining tasks into ${effectiveDays} day(s)\n\n` +
            `RULES:\n` +
            `1. Prioritize HIGH-IMPACT tasks — drop nice-to-haves if needed\n` +
            `2. Merge related tasks when compressing\n` +
            `3. Each day should have 3-6 realistic tasks\n` +
            `4. Day 1 = today, Day ${effectiveDays} = final prep day\n` +
            `5. If only 1 day remains, create a "blitz plan" with the most critical tasks\n` +
            `6. Mark all new/surviving tasks as "done": false\n` +
            `7. Keep resources relevant and practical\n\n` +
            `RESPOND WITH ONLY valid JSON:\n` +
            `{ "plan": [{ "day": 1, "focus": "...", "tasks": [{"title": "...", "done": false}], "resources": ["..."] }] }`;

        const planJson = JSON.stringify(incompleteTasks, null, 2);
        const user =
            `EVENT: "${event.title ?? "Untitled"}" (Category: ${event.category ?? "general"})\n` +
            `DAYS REMAINING: ${effectiveDays}\n` +
            `URGENCY: ${urgency.toUpperCase()}\n\n` +
            `COMPLETED TASKS (keep as reference, don't re-add):\n` +
            completedTasks.map(t => `  ✅ ${t}`).join("\n") + "\n\n" +
            `REMAINING INCOMPLETE PLAN:\n${planJson}\n\n` +
            `Compress this into a focused ${effectiveDays}-day plan.`;

        console.log(`   🤖 Calling compression model (${REPLAN_MODEL})...`);

        const raw = await groqChat(
            [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            { temperature: 0.2, max_tokens: 4096 }
        );

        // ── 5. Parse compressed plan ─────────────────────────
        let compressedPlan: PlanDay[];
        try {
            const parsed = extractJson<{ plan: PlanDay[] }>(raw);
            compressedPlan = parsed.plan;
        } catch {
            try {
                compressedPlan = extractJson<PlanDay[]>(raw);
            } catch {
                console.error("[Replan] Parse failed:", raw.substring(0, 300));
                return {
                    success: false, wasStale: true,
                    originalDays, newDays: originalDays,
                    daysRemaining, urgency,
                    message: "Failed to parse compressed plan",
                    error: "AI response parse failure",
                };
            }
        }

        const normalized = normalizePlan(compressedPlan);
        console.log(`   📋 Compressed: ${originalDays} → ${normalized.length} days`);

        // ── 6. Calculate new progress ────────────────────────
        const totalTasks = normalized.reduce((s, d) => s + d.tasks.length, 0) + completedTasks.length;
        const doneTasks = completedTasks.length;
        const progress = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

        // ── 7. Save compressed plan ──────────────────────────
        await serverDb
            .update(eventPlans)
            .set({
                generatedPlan: normalized,
                progress,
                updatedAt: new Date(),
            })
            .where(eq(eventPlans.eventId, eventId));

        console.log(`   ♻️ Plan compressed and saved (progress: ${progress}%)`);

        return {
            success: true,
            wasStale: true,
            originalDays,
            newDays: normalized.length,
            daysRemaining,
            urgency,
            plan: normalized,
            message: `Plan compressed: ${originalDays} → ${normalized.length} days (${daysRemaining}d remaining)`,
        };

    } catch (error) {
        console.error("❌ [Adaptive Replan] Error:", error);
        return {
            success: false, wasStale: false,
            originalDays: 0, newDays: 0,
            daysRemaining: 0, urgency: "future",
            message: "Replan failed",
            error: String(error),
        };
    }
}

// ─── Batch Staleness Check ───────────────────────────────────────
// Checks all events with plans and returns which ones are stale.
// Used by the event monitor to proactively alert the student.

export async function checkAllPlanStaleness(): Promise<StalenessReport> {
    try {
        const allPlans = await serverDb
            .select({
                planId: eventPlans.id,
                eventId: eventPlans.eventId,
                generatedPlan: eventPlans.generatedPlan,
                eventTitle: events.title,
                eventDate: events.eventDate,
                deadline: events.deadline,
            })
            .from(eventPlans)
            .innerJoin(events, eq(eventPlans.eventId, events.id));

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const staleEvents: Array<{
            eventId: string;
            title: string | null;
            daysRemaining: number;
            planDays: number;
            urgency: string;
        }> = [];
        let freshCount = 0;

        for (const row of allPlans) {
            const targetDate = row.deadline ?? row.eventDate;
            if (!targetDate) { freshCount++; continue; }

            const target = new Date(targetDate);
            target.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysRemaining < 0) continue; // Event already passed

            const plan = normalizePlan(row.generatedPlan);
            const planDays = plan.length;

            if (planDays > Math.max(daysRemaining, 1)) {
                staleEvents.push({
                    eventId: row.eventId,
                    title: row.eventTitle,
                    daysRemaining,
                    planDays,
                    urgency: calcUrgency(daysRemaining),
                });
            } else {
                freshCount++;
            }
        }

        return {
            staleEvents,
            freshCount,
            staleCount: staleEvents.length,
        };

    } catch (error) {
        console.error("[Staleness Check] Error:", error);
        return { staleEvents: [], freshCount: 0, staleCount: 0 };
    }
}
