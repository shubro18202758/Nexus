import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type AdaptiveRoadmap } from "@/lib/ai/roadmap-planner";

export interface ProgressEvaluation {
    updated_level: string;
    concept_mastery_updates: Record<string, string>;
    next_focus_area: string;
    difficulty_adjustment: "increase" | "maintain" | "reduce" | "pivot";
    feedback_message: string;
}

export async function evaluateProgress(
    currentRoadmap: AdaptiveRoadmap,
    userReflection: string,
    currentWeek: number
): Promise<ProgressEvaluation> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are an AI Knowledge Evaluator.
Analyze the user's reflection on their current roadmap progress.

Evaluate:
1. What improved?
2. What still lacks depth?
3. Should difficulty increase, maintain, or reduce?
4. Identify if a pivot is needed (e.g. if stuck).

Return strictly JSON:
{
 "updated_level": "Beginner | Intermediate | Advanced | Expert",
 "concept_mastery_updates": { "Concept A": "Mastered", "Concept B": "Needs Review" },
 "next_focus_area": "Specific topic to focus on next",
 "difficulty_adjustment": "increase | maintain | reduce | pivot",
 "feedback_message": "Short, encouraging feedback to the user."
}
`;

    const userMessage = `
Current Roadmap (Week ${currentWeek}):
${JSON.stringify(currentRoadmap)}

User Reflection:
"${userReflection}"
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<ProgressEvaluation>(response);
    } catch (error) {
        console.error("[Knowledge] Progress Evaluation Failed:", error);
        throw new Error("Failed to evaluate progress.");
    }
}
