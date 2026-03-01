import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type CareerReadiness } from "./career-evaluator";

export interface MasteryWeek {
    focus: string;
    schedule: {
        day: string; // "Monday", "Tuesday", etc.
        morning_theory: string;
        afternoon_implementation: string;
        evening_review: string;
    }[];
    deliverables: string[];
}

export interface MasteryPlan {
    week_1: MasteryWeek;
    week_2: MasteryWeek;
    week_3: MasteryWeek;
    expected_readiness_gain: string;
    risk_of_burnout: "low" | "medium" | "high";
    burnout_reasoning?: string;
}

export async function generateMasteryPlan(
    profile: any,
    careerEvaluation: CareerReadiness | null,
    velocityMetrics: any,
    bottlenecks: string[]
): Promise<MasteryPlan> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are an Adaptive Mastery Planner.
Create a high-intensity 3-week adaptive roadmap to fast-track the user's career readiness.

Rules:
1. Adjust difficulty based on velocity (if slow, reduce scope; if fast, add breadth).
2. Schedule must include:
   - Concept reinforcement (Morning)
   - Implementation challenges (Afternoon)
   - Interview/Reflection (Evening)
3. Must explicitly target the "Weakest Areas" identified.
4. Assess burnout risk based on volume of work vs. user level.

Return strictly JSON:
{
 "week_1": { "focus": "...", "schedule": [ { "day": "Mon", "morning_theory": "...", "afternoon_implementation": "...", "evening_review": "..." } ], "deliverables": [] },
 "week_2": { ... },
 "week_3": { ... },
 "expected_readiness_gain": "Estimated score increase",
 "risk_of_burnout": "low | medium | high",
 "burnout_reasoning": "Why?"
}
`;

    const userMessage = `
Profile: ${JSON.stringify(profile)}
Career Gaps: ${careerEvaluation ? JSON.stringify(careerEvaluation.weakest_interview_areas) : "Unknown"}
Velocity: ${JSON.stringify(velocityMetrics)}
Bottlenecks: ${JSON.stringify(bottlenecks)}

Generate a 3-week mastery schedule based on the above data.
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<MasteryPlan>(response);
    } catch (error) {
        console.error("[Knowledge] Mastery Plan Generation Failed:", error);
        throw new Error("Failed to generate mastery plan.");
    }
}
