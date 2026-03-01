import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";

export interface LearningProfileAnalysis {
    level: "Beginner" | "Intermediate" | "Advanced";
    primary_domains: string[];
    secondary_domains: string[];
    weak_concepts: string[];
    strong_concepts: string[];
    learning_style: string;
    goal_type: "research" | "job" | "competitive programming" | "startup" | "exploration";
    confidence_score: number;
}

export async function analyzeUserProfile(history: string): Promise<LearningProfileAnalysis> {
    const engine = LLMEngine.getInstance();

    // Ensure engine is ready (UI should handle init, but safety check)
    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are an AI Learning Diagnostician.
Your job:
1. Infer the user's current knowledge level.
2. Identify their interests.
3. Detect weak areas.
4. Classify them into: Beginner / Intermediate / Advanced.
5. Estimate conceptual depth vs implementation depth.

Analyze the user's conversation history and return a valid JSON object.
Do NOT output any markdown blocks (like \`\`\`json). Just the raw JSON string.
Structure:
{
 "level": "Beginner" | "Intermediate" | "Advanced",
 "primary_domains": ["string"],
 "secondary_domains": ["string"],
 "weak_concepts": ["string"],
 "strong_concepts": ["string"],
 "learning_style": "string",
 "goal_type": "research" | "job" | "competitive programming" | "startup" | "exploration",
 "confidence_score": number (0.0 to 1.0)
}
`;

    const userMessage = `User History:\n${history}`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<LearningProfileAnalysis>(response);
    } catch (error) {
        console.error("[Knowledge] AI Diagnosis Failed:", error);
        throw new Error("Failed to analyze profile: " + (error as any).message);
    }
}
