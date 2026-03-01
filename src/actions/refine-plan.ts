"use server";

// ===================================================================
// The Versatility Loop — Iterative Plan Refinement (Phase 5)
//
// ██  "Jarvis, move Tuesday's stuff — I'm sick."  ██
//
// Flow:
//   1. Receive planId (eventId), current plan JSON, and user feedback
//   2. Send current plan + feedback to Groq (llama-3.3-70b-versatile)
//   3. Instruction: Modify the existing JSON strictly based on feedback
//   4. Overwrite event_plans entry with the refined plan
//   5. Return the updated plan to the frontend
//
// Examples of feedback the model handles:
//   • "I can't do Tuesday, move it to Wednesday"
//   • "I already know React, skip the basics"
//   • "I'm sick today, shift everything by one day"
//   • "Add more DSA practice on Day 3"
//   • "Shorten the plan to 5 days, I'm running out of time"
// ===================================================================

import { serverDb } from "@/lib/server-db";
import { eventPlans, events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractJson } from "@/lib/ai/llm-engine";

// ─── Groq Config — Beta key (NANOBOT2 for 70B tasks) ────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const REFINEMENT_MODEL = "llama-3.3-70b-versatile";

function getBetaKey(): string {
    const key = process.env.GROQ_NANOBOT_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("No GROQ_NANOBOT_KEY (Beta/NANOBOT2) for Refinement agent");
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
            model: REFINEMENT_MODEL,
            messages,
            temperature: opts.temperature ?? 0.25,
            max_tokens: opts.max_tokens ?? 4096,
            response_format: { type: "json_object" },
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq Refinement error ${res.status}: ${errText}`);
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
    tasks: PlanTask[] | string[];
    resources: string[];
}

export interface RefinementResult {
    success: boolean;
    plan?: PlanDay[];
    error?: string;
}

// ─── Normalize Tasks ─────────────────────────────────────────────
// Ensure tasks are in { title, done } format for consistent handling

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
        resources: ((d.resources as string[]) ?? []),
    }));
}

// ─── Build Refinement Prompt ─────────────────────────────────────

function buildRefinementPrompt(
    currentPlan: PlanDay[],
    feedback: string,
    eventTitle: string | null,
    eventCategory: string | null
): { system: string; user: string } {
    const system =
        `You are a plan refinement assistant for a student's event preparation plan. ` +
        `The student has an existing day-by-day plan and wants to make changes.\n\n` +
        `RULES:\n` +
        `1. Modify the plan STRICTLY based on the user's feedback.\n` +
        `2. MAINTAIN the exact JSON structure — each day must have: day (number), focus (string), tasks (array of objects with "title" and "done" fields), resources (array of strings).\n` +
        `3. Preserve task completion status ("done" field) unless the user explicitly asks to reset.\n` +
        `4. When shifting days, renumber them sequentially starting from 1.\n` +
        `5. When removing content, redistribute important tasks to other days if appropriate.\n` +
        `6. When adding content, place it in the most logical day.\n` +
        `7. Keep the plan realistic and actionable.\n` +
        `8. Do NOT add commentary — respond with ONLY the JSON.\n\n` +
        `RESPOND WITH ONLY valid JSON in this exact format:\n` +
        `{\n` +
        `  "plan": [\n` +
        `    {\n` +
        `      "day": 1,\n` +
        `      "focus": "short focus area title",\n` +
        `      "tasks": [{"title": "specific task", "done": false}],\n` +
        `      "resources": ["resource 1", "resource 2"]\n` +
        `    }\n` +
        `  ]\n` +
        `}`;

    const planJson = JSON.stringify(currentPlan, null, 2);

    const user =
        `Event: "${eventTitle ?? "Untitled"}" (Category: ${eventCategory ?? "general"})\n\n` +
        `CURRENT PLAN:\n${planJson}\n\n` +
        `STUDENT FEEDBACK:\n"${feedback}"\n\n` +
        `Apply the student's requested changes to the plan and return the updated JSON.`;

    return { system, user };
}

// ─── Main Entry Point ────────────────────────────────────────────

export async function refinePlan(
    eventId: string,
    currentPlan: PlanDay[],
    userFeedback: string
): Promise<RefinementResult> {
    try {
        console.log(`\n🔄 [Refinement] Refining plan for event: ${eventId}`);
        console.log(`   💬 Feedback: "${userFeedback.substring(0, 100)}${userFeedback.length > 100 ? "..." : ""}"`);

        // ── Validate inputs ──────────────────────────────────
        if (!eventId) {
            return { success: false, error: "Missing eventId" };
        }
        if (!userFeedback || userFeedback.trim().length === 0) {
            return { success: false, error: "Feedback cannot be empty" };
        }
        if (!currentPlan || currentPlan.length === 0) {
            return { success: false, error: "No existing plan to refine" };
        }

        // ── Fetch event context for prompt ───────────────────
        const eventRows = await serverDb
            .select()
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        const event = eventRows[0] ?? null;
        const eventTitle = event?.title ?? null;
        const eventCategory = event?.category ?? null;

        console.log(`   📌 Event: "${eventTitle}" (${eventCategory ?? "uncategorized"})`);

        // ── Normalize the incoming plan ──────────────────────
        const normalizedCurrent = normalizePlan(currentPlan);

        // ── Build prompt & call Groq ─────────────────────────
        const { system, user } = buildRefinementPrompt(
            normalizedCurrent,
            userFeedback,
            eventTitle,
            eventCategory
        );

        console.log(`   🤖 Calling Refinement model (${REFINEMENT_MODEL})...`);
        const raw = await groqChat(
            [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            { temperature: 0.25, max_tokens: 4096 }
        );

        // ── Parse response ───────────────────────────────────
        let refinedPlan: PlanDay[];
        try {
            const parsed = extractJson<{ plan: PlanDay[] }>(raw);
            refinedPlan = parsed.plan;
        } catch {
            console.warn("[Refinement] JSON parse failed, attempting array extraction...");
            try {
                refinedPlan = extractJson<PlanDay[]>(raw);
            } catch {
                console.error("[Refinement] Could not parse refined plan:", raw.substring(0, 300));
                return { success: false, error: "Failed to parse refined plan from AI" };
            }
        }

        if (!Array.isArray(refinedPlan) || refinedPlan.length === 0) {
            return { success: false, error: "AI returned empty refined plan" };
        }

        // ── Normalize the output tasks ───────────────────────
        const normalizedRefined = normalizePlan(refinedPlan);

        console.log(`   📋 Refined: ${normalizedRefined.length} days`);
        for (const d of normalizedRefined.slice(0, 3)) {
            const tasks = d.tasks as PlanTask[];
            console.log(`      Day ${d.day}: ${d.focus} (${tasks.length} tasks)`);
        }
        if (normalizedRefined.length > 3)
            console.log(`      ... and ${normalizedRefined.length - 3} more days`);

        // ── Save to event_plans table ────────────────────────
        const existing = await serverDb
            .select()
            .from(eventPlans)
            .where(eq(eventPlans.eventId, eventId))
            .limit(1);

        if (existing.length === 0) {
            // Shouldn't happen (can't refine without a plan), but handle gracefully
            await serverDb.insert(eventPlans).values({
                eventId,
                generatedPlan: normalizedRefined,
                studentFeedback: userFeedback,
                progress: 0,
                isLocked: false,
            });
            console.log("   ✅ New plan saved (unexpected — no prior plan)");
        } else {
            if (existing[0].isLocked) {
                console.log("   🔒 Plan is locked. Skipping overwrite.");
                return {
                    success: false,
                    error: "Plan is locked — unlock it before making changes",
                };
            }

            // Calculate progress based on done tasks in refined plan
            let total = 0;
            let done = 0;
            for (const d of normalizedRefined) {
                for (const t of d.tasks as PlanTask[]) {
                    total++;
                    if (t.done) done++;
                }
            }
            const progress = total === 0 ? 0 : Math.round((done / total) * 100);

            await serverDb
                .update(eventPlans)
                .set({
                    generatedPlan: normalizedRefined,
                    studentFeedback: userFeedback,
                    progress,
                    updatedAt: new Date(),
                })
                .where(eq(eventPlans.eventId, eventId));

            console.log(`   ♻️ Plan updated (progress: ${progress}%)`);
        }

        return { success: true, plan: normalizedRefined };
    } catch (error) {
        console.error("❌ [Refinement] Error:", error);
        return { success: false, error: String(error) };
    }
}
