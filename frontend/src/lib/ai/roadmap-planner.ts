import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type LearningProfile } from "@/db/schema";
import { type CuratedLearningPath } from "@/lib/ai/content-curator";

export interface WeeklyPlan {
    focus: string;
    theory: string[];
    implementation: string[];
    milestones: string[];
    mini_project: string;
    reflection_prompt: string;
}

export interface AdaptiveRoadmap {
    week_1: WeeklyPlan;
    week_2: WeeklyPlan;
    week_3: WeeklyPlan;
    week_4: WeeklyPlan;
    success_metrics: string[];
    advanced_readiness_indicator: string;
}

export async function generateAdaptivePlan(
    profile: any,
    resources: CuratedLearningPath,
    topic: string
): Promise<AdaptiveRoadmap> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are an AI Learning Strategist.
Create a 4-week adaptive roadmap based on the learner's state and curated resources.

Rules:
1. Each week must build toward advanced capability in: ${topic}.
2. Include theory + implementation.
3. Include measurable milestones and reflection prompts.
4. Scale difficulty: Week 1 (Foundations) -> Week 4 (Advanced Mastery).

Return strictly JSON:
{
 "week_1": { "focus": "...", "theory": ["..."], "implementation": ["..."], "milestones": ["..."], "mini_project": "...", "reflection_prompt": "..." },
 "week_2": { ... },
 "week_3": { ... },
 "week_4": { ... },
 "success_metrics": ["Metric 1", "Metric 2"],
 "advanced_readiness_indicator": "Description of what success looks like"
}
`;

    const userMessage = `
Learner State:
${JSON.stringify(profile)}

Curated Resources (Integrate these into the plan):
${JSON.stringify(resources)}
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<AdaptiveRoadmap>(response);
    } catch (error) {
        console.error("[Knowledge] Roadmap Generation Failed:", error);
        throw new Error("Failed to generate roadmap.");
    }
}
