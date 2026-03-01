import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";

export interface ThresholdResult {
    advanced_unlocked: boolean;
    new_learning_tier: string;
    recommended_advanced_resources: string[];
    challenge_level: "high" | "medium" | "low";
}

export async function detectThreshold(
    masteryDepth: number, // 0-100
    implementationScore: number, // 0-100
    velocityStatus: string, // "stable", "volatile", etc.
    dependenciesSatisfied: boolean
): Promise<ThresholdResult> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are an Advanced Threshold Detector.
Determine if the user is ready to unlock "Advanced Mode" (Research papers, OSS contributions, System Design).

Criteria:
- Mastery Depth > 80 (Threshold)
- Implementation Score > 75 (High)
- Velocity: Stable
- Dependencies: Satisfied

If conditions met (or very close), unlock Advanced Mode.
Return strictly JSON:
{
 "advanced_unlocked": true/false,
 "new_learning_tier": "Example: 'Architect' or 'Researcher'",
 "recommended_advanced_resources": ["Paper 1", "OSS Repo 1", "Challenge 1"],
 "challenge_level": "high"
}
`;

    const userMessage = `
Mastery Depth: ${masteryDepth}
Implementation Score: ${implementationScore}
Velocity Status: ${velocityStatus}
Dependencies Satisfied: ${dependenciesSatisfied}

Analyze threshold status.
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<ThresholdResult>(response);
    } catch (error) {
        console.error("[Knowledge] Threshold Detection Failed:", error);
        // Default safe fallback
        return {
            advanced_unlocked: false,
            new_learning_tier: "Intermediate",
            recommended_advanced_resources: [],
            challenge_level: "medium"
        };
    }
}
