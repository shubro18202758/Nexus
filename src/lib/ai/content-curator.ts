import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type LearningResource } from "@/lib/agent/resource-finder";

export interface CuratedLearningPath {
    micro_learning: LearningResource[];
    deep_dive: LearningResource[];
    implementation: LearningResource[];
    project_suggestion: string;
    why_this_sequence: string;
}

export async function curateResources(
    profile: any,
    bottlenecks: string[],
    rawResources: LearningResource[]
): Promise<CuratedLearningPath> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are a High-Signal Content Curator.
Given a learner profile, their conceptual bottlenecks, and a list of gathered resources, curate a highly structured learning path.

Rules:
1. Signal-to-noise ratio: specific, actionable content > generic overviews.
2. Conceptual clarity: best for the specific bottleneck.
3. Relevance: matches the learner's profile/level.

Select from the provided resources:
- 2 quick micro-learning resources (<= 15 min video/article)
- 1 deep dive (thorough documentation or long lecture)
- 1 implementation-based resource (tutorial/code)

Also generate:
- 1 Project Idea to solidify the concept.
- "Why this sequence": Rationale for the path.

Return strictly JSON:
{
 "micro_learning": [ { "title": "...", "url": "...", "description": "..." } ],
 "deep_dive": [ { "title": "...", "url": "...", "description": "..." } ],
 "implementation": [ { "title": "...", "url": "...", "description": "..." } ],
 "project_suggestion": "Build X using Y...",
 "why_this_sequence": "..."
}
`;

    const userMessage = `
Learner Profile:
${JSON.stringify(profile)}

Bottlenecks/Topic:
${bottlenecks.join(", ")}

Available Resources (Select from these ONLY — do NOT invent URLs or resources not listed):
${JSON.stringify(rawResources)}
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<CuratedLearningPath>(response);
    } catch (error) {
        console.error("[Knowledge] Curation Failed:", error);
        throw new Error("Failed to curate resources.");
    }
}
