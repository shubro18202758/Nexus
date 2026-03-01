"use server";

// ===================================================================
// The Strategist — Adaptive Event Planner Agent (Phase 3)
//
// ██  "Jarvis-grade" personal preparation planner  ██
//
// Flow:
//   1. Fetch event details + full student context
//   2. Calculate time constraints (days remaining)
//   3. Build an adaptive prompt based on event category + student profile
//   4. Call Groq (llama-3.3-70b-versatile) for day-by-day plan
//   5. Save to event_plans table
//
// Adaptive Logic:
//   • Hackathon + knows React  → focus on building, not tutorials
//   • Exam + weak in Calculus   → prioritize practice problems
//   • Contest + strong in DSA   → advanced strategy & speed drills
//   • Internship               → resume polish + mock interview plan
// ===================================================================

import { serverDb } from "@/lib/server-db";
import {
    events,
    students,
    learningProfiles,
    projects,
    eventPlans,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractJson } from "@/lib/ai/llm-engine";

// ─── Groq Config — Beta key (NANOBOT2 for 70B tasks) ────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const STRATEGIST_MODEL = "llama-3.3-70b-versatile"; // Needs 70B reasoning power

function getBetaKey(): string {
    const key = process.env.GROQ_NANOBOT_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("No GROQ_NANOBOT_KEY (Beta/NANOBOT2) for Strategist agent");
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
            model: STRATEGIST_MODEL,
            messages,
            temperature: opts.temperature ?? 0.3,
            max_tokens: opts.max_tokens ?? 4096,
            response_format: { type: "json_object" },
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq Strategist error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

// ─── Types ───────────────────────────────────────────────────────

export interface PlanDay {
    day: number;
    focus: string;
    tasks: string[];
    resources: string[];
}

export interface StrategistResult {
    success: boolean;
    plan?: PlanDay[];
    daysRemaining?: number;
    error?: string;
}

// ─── Student Context Builder ─────────────────────────────────────

interface StudentContext {
    name: string;
    major: string;
    university: string;
    gpa: string;
    level: string;
    strongConcepts: string[];
    weakConcepts: string[];
    primaryDomains: string[];
    skills: string[]; // aggregated from projects
    learningStyle: string;
    goalType: string;
}

async function buildStudentContext(): Promise<StudentContext | null> {
    // Fetch student profile
    const allStudents = await serverDb.select().from(students).limit(1);
    if (allStudents.length === 0) return null;
    const student = allStudents[0];

    // Fetch learning profile
    const profiles = await serverDb
        .select()
        .from(learningProfiles)
        .where(eq(learningProfiles.studentId, student.id))
        .limit(1);
    const profile = profiles[0] ?? null;

    // Fetch projects to extract skills
    const studentProjects = await serverDb
        .select()
        .from(projects)
        .where(eq(projects.studentId, student.id));

    // Aggregate all skills from projects
    const skillSet = new Set<string>();
    for (const proj of studentProjects) {
        const s = proj.skills as string[] | null;
        if (Array.isArray(s)) {
            for (const skill of s) skillSet.add(skill);
        }
    }

    return {
        name: student.name,
        major: student.major || "Undecided",
        university: student.university || "Unknown",
        gpa: student.gpa || "N/A",
        level: profile?.level || "Unknown",
        strongConcepts: (profile?.strongConcepts as string[]) || [],
        weakConcepts: (profile?.weakConcepts as string[]) || [],
        primaryDomains: (profile?.primaryDomains as string[]) || [],
        skills: [...skillSet],
        learningStyle: profile?.learningStyle || "balanced",
        goalType: profile?.goalType || "general",
    };
}

// ─── Adaptive Prompt Engine ──────────────────────────────────────
//
// Generates a highly personalized system prompt based on:
//   • Event type (exam, hackathon, internship, etc.)
//   • Student's known strengths and weaknesses
//   • Days remaining (compressed plans ≠ expanded plans)
// ─────────────────────────────────────────────────────────────────

function buildAdaptivePrompt(
    event: {
        title: string | null;
        description: string | null;
        category: string | null;
        location: string | null;
        eventDate: Date | null;
        deadline: Date | null;
        url: string | null;
    },
    ctx: StudentContext,
    daysRemaining: number
): { system: string; user: string } {
    const category = event.category || "general";
    const title = event.title || "Upcoming Event";

    // ── Category-specific strategy rules ──
    let strategyRules: string;

    switch (category) {
        case "exam":
            strategyRules = buildExamStrategy(ctx, daysRemaining);
            break;
        case "hackathon":
            strategyRules = buildHackathonStrategy(ctx, daysRemaining);
            break;
        case "contest":
            strategyRules = buildContestStrategy(ctx, daysRemaining);
            break;
        case "internship":
            strategyRules = buildInternshipStrategy(ctx, daysRemaining);
            break;
        case "workshop":
            strategyRules = buildWorkshopStrategy(ctx, daysRemaining);
            break;
        case "assignment":
            strategyRules = buildAssignmentStrategy(ctx, daysRemaining);
            break;
        default:
            strategyRules =
                "Create a balanced preparation plan. " +
                "Prioritize understanding the event requirements first, then skill building.";
    }

    // ── Time pressure adjustments ──
    let timePressure: string;
    if (daysRemaining <= 1) {
        timePressure =
            "CRITICAL: Only 1 day or less remains. Create an EMERGENCY cram plan. " +
            "Focus on highest-impact items only. No deep learning — just review and execute.";
    } else if (daysRemaining <= 3) {
        timePressure =
            "URGENT: Only a few days remain. Create an intensive focused plan. " +
            "Cut all non-essential preparation. Focus on the 20% that gives 80% results.";
    } else if (daysRemaining <= 7) {
        timePressure =
            "SHORT TIMELINE: About a week. Balance depth with coverage. " +
            "Block focused practice sessions. Include one rest/review day.";
    } else if (daysRemaining <= 14) {
        timePressure =
            "COMFORTABLE: Two weeks available. Include skill-building, practice, and review phases. " +
            "Ramp up intensity toward the end.";
    } else {
        timePressure =
            "AMPLE TIME: More than two weeks. Start with foundational learning, build up to advanced " +
            "practice, include mock runs and refinement. Add buffer days for unexpected setbacks.";
    }

    const system =
        `You are The Strategist — a personalized academic and career advisor ` +
        `for ${ctx.name}, a ${ctx.major} student at ${ctx.university} ` +
        `(GPA: ${ctx.gpa}, Level: ${ctx.level}).\n\n` +
        `Student Profile:\n` +
        `  • Strong in: ${ctx.strongConcepts.length > 0 ? ctx.strongConcepts.join(", ") : "Not yet assessed"}\n` +
        `  • Weak in: ${ctx.weakConcepts.length > 0 ? ctx.weakConcepts.join(", ") : "Not yet assessed"}\n` +
        `  • Technical skills: ${ctx.skills.length > 0 ? ctx.skills.join(", ") : "Not yet listed"}\n` +
        `  • Domains: ${ctx.primaryDomains.length > 0 ? ctx.primaryDomains.join(", ") : "General"}\n` +
        `  • Learning style: ${ctx.learningStyle}\n` +
        `  • Career goal: ${ctx.goalType}\n\n` +
        `${timePressure}\n\n` +
        `Strategy Rules for this ${category} event:\n${strategyRules}\n\n` +
        `RESPOND WITH ONLY valid JSON in this exact format:\n` +
        `{\n` +
        `  "plan": [\n` +
        `    {\n` +
        `      "day": 1,\n` +
        `      "focus": "short focus area title",\n` +
        `      "tasks": ["specific actionable task 1", "task 2", ...],\n` +
        `      "resources": ["resource link or name 1", "resource 2", ...]\n` +
        `    }\n` +
        `  ]\n` +
        `}\n\n` +
        `IMPORTANT:\n` +
        `- Generate EXACTLY ${daysRemaining} days (or fewer if the event is same-day).\n` +
        `- Each day must have 2-5 concrete, actionable tasks.\n` +
        `- Resources should be specific (actual website names, book chapters, tools) not generic.\n` +
        `- Adapt everything to the student's known strengths and weaknesses.\n` +
        `- If the student already knows a skill required for this event, skip basics for that skill.`;

    const user =
        `Create a ${daysRemaining}-day preparation plan for:\n\n` +
        `Event: "${title}"\n` +
        `Category: ${category}\n` +
        `Description: ${event.description || "No description available"}\n` +
        `Date: ${event.eventDate ? event.eventDate.toISOString().split("T")[0] : "TBD"}\n` +
        `${event.deadline ? `Registration Deadline: ${event.deadline.toISOString().split("T")[0]}\n` : ""}` +
        `Location: ${event.location || "Not specified"}\n` +
        `${event.url ? `Link: ${event.url}\n` : ""}`;

    return { system, user };
}

// ─── Category-Specific Strategy Builders ─────────────────────────

function buildExamStrategy(ctx: StudentContext, days: number): string {
    const weakTopics = ctx.weakConcepts.length > 0
        ? `The student is WEAK in: ${ctx.weakConcepts.join(", ")}. PRIORITIZE practice problems and concept review for these topics first.`
        : "No specific weak areas identified — distribute study time evenly.";

    const strongTopics = ctx.strongConcepts.length > 0
        ? `The student is STRONG in: ${ctx.strongConcepts.join(", ")}. Skip basics for these — only review at advanced/edge-case level.`
        : "";

    return (
        `EXAM PREPARATION STRATEGY:\n` +
        `${weakTopics}\n${strongTopics}\n` +
        `- Day 1: Identify all exam topics and create a topic map.\n` +
        `- Allocate ${Math.max(1, Math.floor(days * 0.6))} days for weak-area deep dives with practice problems.\n` +
        `- Include spaced repetition sessions.\n` +
        `- Last ${Math.max(1, Math.floor(days * 0.2))} day(s): Full practice exam under timed conditions.\n` +
        `- Final day: Light review only — no new material. Focus on confidence.`
    );
}

function buildHackathonStrategy(ctx: StudentContext, days: number): string {
    const knownTechs = ctx.skills.filter((s) =>
        /react|next|vue|angular|node|python|flask|django|express|typescript|javascript|rust|go|swift/i.test(s)
    );
    const hasWebSkills = knownTechs.length > 0;

    return (
        `HACKATHON PREPARATION STRATEGY:\n` +
        (hasWebSkills
            ? `The student already knows: ${knownTechs.join(", ")}. DO NOT waste time on tutorials for these. ` +
              `Focus on BUILDING — project ideation, rapid prototyping, and demo preparation.\n`
            : `No established tech stack detected. Allocate first ${Math.min(3, Math.floor(days * 0.3))} days ` +
              `to setting up a reliable tech stack (recommend their major's common tools).\n`) +
        `- Early days: Brainstorm project ideas, research the hackathon theme/tracks.\n` +
        `- Middle days: Build a working prototype. Focus on core feature, not polish.\n` +
        `- Day before: Prepare demo/pitch, write README, record video if required.\n` +
        `- Include team coordination tasks if applicable.\n` +
        `- Recommend specific boilerplate templates and starter kits they can use.`
    );
}

function buildContestStrategy(ctx: StudentContext, days: number): string {
    const hasDSA = ctx.skills.some((s) => /dsa|algorithm|competitive|leetcode|codeforces/i.test(s)) ||
        ctx.strongConcepts.some((c) => /algorithm|data.struct|dynamic.prog|graph/i.test(c));

    return (
        `CODING CONTEST STRATEGY:\n` +
        (hasDSA
            ? `Student has DSA/competitive programming experience. Focus on SPEED DRILLS and advanced topics ` +
              `(segment trees, advanced DP, graph algorithms, number theory).\n`
            : `Student may not have strong competitive programming background. Start with fundamentals: ` +
              `arrays, sorting, binary search, basic DP, BFS/DFS.\n`) +
        `- Daily: ${days <= 7 ? "3-5" : "2-3"} practice problems of increasing difficulty.\n` +
        `- Include timed practice sessions to build speed.\n` +
        `- Study common contest patterns and tricks.\n` +
        `- Last day: Virtual contest simulation.`
    );
}

function buildInternshipStrategy(ctx: StudentContext, _days: number): string {
    return (
        `INTERNSHIP APPLICATION STRATEGY:\n` +
        `Student major: ${ctx.major}. Known skills: ${ctx.skills.join(", ") || "none listed"}.\n` +
        `- Phase 1 (30% of time): Resume and portfolio polish. Align with job description keywords.\n` +
        `- Phase 2 (40% of time): Technical prep — review core concepts for the role, ` +
        `practice coding challenges or case studies depending on role type.\n` +
        `- Phase 3 (20% of time): Mock interviews (behavioral + technical).\n` +
        `- Phase 4 (10% of time): Company research, prepare questions to ask.\n` +
        `- Include specific resources: resume templates, interview prep platforms, company Glassdoor.`
    );
}

function buildWorkshopStrategy(ctx: StudentContext, days: number): string {
    return (
        `WORKSHOP PREPARATION STRATEGY:\n` +
        `- Research the workshop topic and prerequisites.\n` +
        `- If the student knows the prereqs (${ctx.skills.join(", ")}), focus on advanced usage.\n` +
        `- If the student is new to the topic, allocate ${Math.min(2, Math.floor(days * 0.4))} days for foundational learning.\n` +
        `- Set up required tools/environments before the workshop day.\n` +
        `- Prepare questions to ask during the workshop.\n` +
        `- Plan follow-up practice for after the workshop.`
    );
}

function buildAssignmentStrategy(ctx: StudentContext, days: number): string {
    const weakAreas = ctx.weakConcepts.length > 0
        ? `Watch for overlap with known weak areas (${ctx.weakConcepts.join(", ")}). Allocate extra time if the assignment covers these.`
        : "";

    return (
        `ASSIGNMENT COMPLETION STRATEGY:\n` +
        `${weakAreas}\n` +
        `- Day 1: Read requirements thoroughly. Break down into subtasks.\n` +
        `- Allocate ${Math.max(1, Math.floor(days * 0.6))} days for core implementation/writing.\n` +
        `- Include research/reference gathering phase early.\n` +
        `- Last ${Math.max(1, Math.floor(days * 0.2))} day(s): Review, test, proofread, format.\n` +
        `- Submit 1 day early if possible for buffer.`
    );
}

// ─── Main Entry Point ────────────────────────────────────────────

export async function generateEventPlan(eventId: string): Promise<StrategistResult> {
    try {
        console.log(`\n🧠 [Strategist] Generating plan for event: ${eventId}`);

        // ── Step 1: Fetch event ──────────────────────────────────
        const eventRows = await serverDb
            .select()
            .from(events)
            .where(eq(events.id, eventId))
            .limit(1);

        if (eventRows.length === 0) {
            return { success: false, error: `Event not found: ${eventId}` };
        }
        const event = eventRows[0];
        console.log(`   📌 Event: "${event.title}" (${event.category || "uncategorized"})`);

        // ── Step 2: Fetch student context ────────────────────────
        const ctx = await buildStudentContext();
        if (!ctx) {
            console.warn("   ⚠️ No student profile found — using generic plan");
        }

        const studentCtx: StudentContext = ctx ?? {
            name: "Student",
            major: "Undecided",
            university: "Unknown",
            gpa: "N/A",
            level: "Unknown",
            strongConcepts: [],
            weakConcepts: [],
            primaryDomains: [],
            skills: [],
            learningStyle: "balanced",
            goalType: "general",
        };

        console.log(
            `   👤 Student: ${studentCtx.name} | ${studentCtx.major} | ` +
            `Skills: ${studentCtx.skills.length > 0 ? studentCtx.skills.slice(0, 5).join(", ") : "none"} | ` +
            `Weak: ${studentCtx.weakConcepts.length > 0 ? studentCtx.weakConcepts.slice(0, 3).join(", ") : "none"}`
        );

        // ── Step 3: Calculate time constraint ────────────────────
        let daysRemaining: number;

        if (event.eventDate) {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const eventDay = new Date(event.eventDate);
            eventDay.setHours(0, 0, 0, 0);
            daysRemaining = Math.max(
                1,
                Math.ceil((eventDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            );
        } else if (event.deadline) {
            // No event date but has deadline — plan toward the deadline
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const deadlineDay = new Date(event.deadline);
            deadlineDay.setHours(0, 0, 0, 0);
            daysRemaining = Math.max(
                1,
                Math.ceil((deadlineDay.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            );
        } else {
            // No dates at all — default to 7-day plan
            daysRemaining = 7;
            console.log("   ⏳ No date set — defaulting to 7-day plan");
        }

        // Cap at 30 days max to avoid absurdly long plans
        daysRemaining = Math.min(daysRemaining, 30);
        console.log(`   ⏳ Days remaining: ${daysRemaining}`);

        // ── Step 4: Build adaptive prompt & call Groq ────────────
        const { system, user } = buildAdaptivePrompt(event, studentCtx, daysRemaining);

        console.log(`   🤖 Calling Strategist (${STRATEGIST_MODEL})...`);
        const raw = await groqChat(
            [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            { temperature: 0.3, max_tokens: 4096 }
        );

        let plan: PlanDay[];
        try {
            const parsed = extractJson<{ plan: PlanDay[] }>(raw);
            plan = parsed.plan;
        } catch {
            console.warn("[Strategist] JSON parse failed, attempting array extraction...");
            try {
                // Fallback: maybe the model returned the array directly
                plan = extractJson<PlanDay[]>(raw);
            } catch {
                console.error("[Strategist] Could not parse plan:", raw.substring(0, 300));
                return { success: false, error: "Failed to parse Strategist output" };
            }
        }

        if (!Array.isArray(plan) || plan.length === 0) {
            return { success: false, error: "Strategist returned empty plan" };
        }

        console.log(`   📋 Generated ${plan.length}-day plan`);
        for (const d of plan.slice(0, 3)) {
            console.log(`      Day ${d.day}: ${d.focus} (${d.tasks.length} tasks)`);
        }
        if (plan.length > 3) console.log(`      ... and ${plan.length - 3} more days`);

        // ── Step 5: Save to event_plans table ────────────────────
        const existing = await serverDb
            .select()
            .from(eventPlans)
            .where(eq(eventPlans.eventId, eventId))
            .limit(1);

        if (existing.length > 0) {
            // Plan exists — check if locked
            if (existing[0].isLocked) {
                console.log("   🔒 Plan is locked (student approved). Skipping overwrite.");
                return {
                    success: true,
                    plan: existing[0].generatedPlan as PlanDay[],
                    daysRemaining,
                    error: "Plan is locked — regeneration skipped",
                };
            }

            // Update existing plan
            await serverDb
                .update(eventPlans)
                .set({
                    generatedPlan: plan,
                    progress: 0, // Reset progress on regeneration
                    updatedAt: new Date(),
                })
                .where(eq(eventPlans.eventId, eventId));

            console.log("   ♻️ Updated existing plan");
        } else {
            // Insert new plan
            await serverDb.insert(eventPlans).values({
                eventId,
                generatedPlan: plan,
                progress: 0,
                isLocked: false,
            });
            console.log("   ✅ New plan saved");
        }

        return { success: true, plan, daysRemaining };
    } catch (error) {
        console.error("❌ [Strategist] Error:", error);
        return { success: false, error: String(error) };
    }
}
