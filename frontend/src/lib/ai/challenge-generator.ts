import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type LearningProfile } from "@/db/schema";

export interface ChallengeSet {
    micro_challenge: string;
    system_challenge: string;
    real_world_challenge: string;
    exploration_challenge: string;
    skills_tested: string[];
}

export async function generateChallenges(
    profile: any,
    topic: string,
    currentLevel: string
): Promise<ChallengeSet> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are an Advanced Systems Mentor.
Generate a set of technical challenges to force conceptual application and expose weaknesses.

Constraints:
1. Micro-Challenge: A small coding task (1-2 hrs) that isolates a specific mechanic.
2. System Challenge: A high-level architecture design task (half-day).
3. Real-World Sim: A "production outage" or "scaling" scenario to debug/solve.
4. Exploration: An open-ended question requiring deep research.
5. Difficulty: Must be slightly beyond their current comfort zone.

Return strictly JSON:
{
 "micro_challenge": "...",
 "system_challenge": "...",
 "real_world_challenge": "...",
 "exploration_challenge": "...",
 "skills_tested": ["Skill 1", "Skill 2"]
}
`;

    const userMessage = `
Topic: ${topic}
Current Level: ${currentLevel}
Profile: ${JSON.stringify(profile)}

Generate challenges for ${topic}.
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<ChallengeSet>(response);
    } catch (error) {
        console.error("[Knowledge] Challenge Generation Failed:", error);
        throw new Error("Failed to generate challenges.");
    }
}
