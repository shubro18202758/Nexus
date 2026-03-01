// ===================================================================
// Adaptive Planner — AI-powered day-by-day plan generation
//
// Takes detected events from the NanoClaw filter and generates
// customised preparation/action plans using NANOBOT-MSG-5 (plan role).
//
// Output matches the eventPlans.generatedPlan schema:
//   { days: [{ date, tasks: [{ title, description, done }] }] }
//
// Student-aware: understands IIT exam prep, hackathon prep, contest
// strategy, application timelines, interview preparation, etc.
// ===================================================================

import {
    groqMsgChat,
    isMsgPoolAvailable,
    type GroqMsgMessage,
} from "@/lib/msg/groq-msg-pool";
import { LLMEngine, extractJson, type ChatMode } from "@/lib/ai/llm-engine";

// ─── Types ───

export interface DetectedEvent {
    title: string;
    description: string;
    eventDate: string | null;
    deadline: string | null;
    location: string | null;
    url: string | null;
    category: string | null;
    priority: number | null;
    confidence: number;
    chatName: string | null;
    authorName: string | null;
    rawContext: string;
}

export interface PlanTask {
    title: string;
    description: string;
    done: boolean;
}

export interface PlanDay {
    date: string;
    tasks: PlanTask[];
}

export interface GeneratedPlan {
    days: PlanDay[];
}

// ─── Engine Routing ───

type PlanEngine = "groq-msg-pool" | "groq-alpha" | "groq-beta" | "local";

function pickPlanEngine(): PlanEngine {
    if (isMsgPoolAvailable()) return "groq-msg-pool";
    const engine = LLMEngine.getInstance();
    if (engine.isGroqAlphaReady()) return "groq-alpha";
    if (engine.isGroqBetaReady()) return "groq-beta";
    return "local";
}

async function planChat(
    messages: GroqMsgMessage[],
    opts: { engine: PlanEngine; temperature?: number; max_tokens?: number },
): Promise<string> {
    const { engine, temperature = 0.2, max_tokens = 4096 } = opts;

    if (engine === "groq-msg-pool") {
        return groqMsgChat(messages, {
            temperature,
            max_tokens,
            json_mode: true,
            preferredRole: "plan", // Uses NANOBOT-MSG-5
        });
    }

    const modeMap: Record<string, ChatMode> = {
        "groq-alpha": "groq-alpha",
        "groq-beta": "groq-beta",
        local: "local",
    };
    const llm = LLMEngine.getInstance();
    return llm.chat(messages, {
        mode: modeMap[engine] || "local",
        temperature,
        max_tokens,
        json_mode: true,
    });
}

// ─── Plan Generation ───

/**
 * Generate an adaptive day-by-day preparation plan for a detected event.
 * Returns a GeneratedPlan matching the eventPlans schema.
 */
export async function generateAdaptivePlan(
    event: DetectedEvent,
): Promise<GeneratedPlan> {
    const engine = pickPlanEngine();
    const today = new Date().toISOString().split("T")[0];

    const eventDateStr = event.eventDate || event.deadline || null;
    const daysUntil = eventDateStr
        ? Math.max(
              1,
              Math.ceil(
                  (new Date(eventDateStr).getTime() - Date.now()) / 86400000,
              ),
          )
        : 7; // Default 7-day plan if no date

    // Cap plan duration
    const planDays = Math.min(daysUntil, 30);

    const categoryGuide: Record<string, string> = {
        hackathon: `HACKATHON PREP PLAN:
- Day 1-2: Team formation, brainstorm ideas, research tech stack
- Mid: Set up repo, assign roles, start prototyping
- Last 2 days: Integrate, test, prepare pitch/demo
- Final day: Submit, rehearse presentation`,
        exam: `EXAM PREP PLAN:
- Start: Review syllabus, collect materials, identify weak areas
- Middle: Deep study sessions (3-4 topics/day), practice problems
- Last 3 days: Past papers, revision of formulas/theorems
- Last day: Light review, rest, organize admit card/materials`,
        contest: `CODING CONTEST PREP:
- Start: Review problem categories, practice on Codeforces/LeetCode
- Middle: Solve 3-5 problems/day focusing on weak areas
- Day before: Light practice, rest, check platform setup`,
        internship: `INTERNSHIP APPLICATION PLAN:
- Day 1: Review job description, study company
- Day 2-3: Update resume, prepare portfolio
- Day 4-5: Practice technical + behavioral questions
- Last day: Mock interview, review company values`,
        workshop: `WORKSHOP PREP:
- 2 days before: Review prerequisites, install required software
- 1 day before: Read agenda, prepare questions
- Day of: Arrive early, bring laptop with setup ready`,
        assignment: `ASSIGNMENT PLAN:
- Start: Read requirements, break into subtasks
- Middle: Work on core tasks (2-3 per day)
- Last 2 days: Testing, documentation, final polish
- Submit day: Final check, submit before deadline`,
    };

    const guide =
        categoryGuide[event.category || ""] ||
        `GENERAL EVENT PREP:
- Start: Research and gather information
- Middle: Prepare materials, practice key activities
- End: Final review, ensure readiness`;

    const systemPrompt = `You are an adaptive planning engine for an IIT Bombay student using NEXUS. Generate a structured day-by-day preparation plan.

EVENT DETAILS:
- Title: ${event.title}
- Description: ${event.description || "N/A"}
- Date: ${event.eventDate || "Unknown"}
- Deadline: ${event.deadline || "None"}
- Location: ${event.location || "TBD"}
- Category: ${event.category || "general"}
- Priority: ${event.priority || "medium"}/5
- Context: ${event.rawContext?.substring(0, 300) || "N/A"}

TODAY: ${today}
DAYS UNTIL EVENT: ${daysUntil}
PLAN DURATION: ${planDays} days

CATEGORY-SPECIFIC GUIDANCE:
${guide}

PLANNING RULES:
1. Generate EXACTLY ${planDays} days from today to the event date.
2. Each day should have 2-5 ACTIONABLE tasks.
3. Tasks should be SPECIFIC (not "study" but "Review Chapter 3: Graph Algorithms").
4. Front-load research/preparation, back-load practice/review.
5. Include at least 1 rest/buffer day for plans > 5 days.
6. Consider the student's IIT context (busy schedule, other commitments).
7. Set all "done" fields to false.

OUTPUT — JSON object:
{
  "days": [
    {
      "date": "2025-07-15",
      "tasks": [
        { "title": "Research event format", "description": "Review past editions, understand scoring criteria", "done": false },
        { "title": "Set up dev environment", "description": "Install required tools and libraries", "done": false }
      ]
    }
  ]
}

CRITICAL: Output ONLY the JSON object. Dates in YYYY-MM-DD format.`;

    try {
        console.log(
            `[PLANNER] Generating ${planDays}-day plan for "${event.title}" → ${engine}`,
        );
        const raw = await planChat(
            [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: `Generate a ${planDays}-day preparation plan for: "${event.title}". JSON only:`,
                },
            ],
            { engine, temperature: 0.25, max_tokens: 4096 },
        );

        const parsed = extractJson<GeneratedPlan>(raw);

        // Validate and normalise
        if (!parsed.days || !Array.isArray(parsed.days)) {
            return generateFallbackPlan(event, planDays, today);
        }

        // Ensure correct date range
        const plan: GeneratedPlan = {
            days: parsed.days.slice(0, planDays).map((day, i) => {
                const date =
                    day.date ||
                    new Date(Date.now() + i * 86400000)
                        .toISOString()
                        .split("T")[0];
                return {
                    date,
                    tasks: Array.isArray(day.tasks)
                        ? day.tasks.map((t) => ({
                              title: t.title || `Task ${i + 1}`,
                              description: t.description || "",
                              done: false,
                          }))
                        : [
                              {
                                  title: "Prepare",
                                  description: `Day ${i + 1} preparation`,
                                  done: false,
                              },
                          ],
                };
            }),
        };

        console.log(
            `[PLANNER] Generated plan: ${plan.days.length} days, ${plan.days.reduce((s, d) => s + d.tasks.length, 0)} tasks`,
        );
        return plan;
    } catch (err) {
        console.error("[PLANNER] Plan generation failed, using fallback:", err);
        return generateFallbackPlan(event, planDays, today);
    }
}

/** Generate a simple fallback plan without AI */
function generateFallbackPlan(
    event: DetectedEvent,
    planDays: number,
    today: string,
): GeneratedPlan {
    const days: PlanDay[] = [];
    const startDate = new Date(today);

    for (let i = 0; i < planDays; i++) {
        const date = new Date(startDate.getTime() + i * 86400000);
        const dateStr = date.toISOString().split("T")[0];
        const isFirst = i === 0;
        const isLast = i === planDays - 1;
        const isMid = i === Math.floor(planDays / 2);

        const tasks: PlanTask[] = [];
        if (isFirst) {
            tasks.push({
                title: "Research & Gather Info",
                description: `Research "${event.title}" — check event details, requirements, and prerequisites`,
                done: false,
            });
            tasks.push({
                title: "Plan Your Approach",
                description: "Break down the event into key areas to prepare for",
                done: false,
            });
        } else if (isLast) {
            tasks.push({
                title: "Final Review",
                description: "Go through all preparations, ensure nothing is missed",
                done: false,
            });
            tasks.push({
                title: "Ready Check",
                description: `Confirm all requirements for "${event.title}" are met`,
                done: false,
            });
        } else if (isMid) {
            tasks.push({
                title: "Mid-Point Check",
                description: "Review progress so far and adjust plan if needed",
                done: false,
            });
            tasks.push({
                title: "Core Preparation",
                description: "Focus on the most important preparation tasks",
                done: false,
            });
        } else {
            tasks.push({
                title: `Day ${i + 1} Preparation`,
                description: `Continue preparing for "${event.title}"`,
                done: false,
            });
        }

        days.push({ date: dateStr, tasks });
    }

    return { days };
}
