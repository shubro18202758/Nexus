import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type RoadmapGraph } from "@/lib/ai/roadmap-architect";
import { type LearningProfile } from "@/db/schema";

export interface GapAnalysisResult {
    bottleneck_concepts: Array<{
        concept: string;
        reason: string;
    }>;
    bridge_topics: Array<{
        topic: string;
        relevance: string;
    }>;
    advanced_topics_blocked: string[];
    confidence: number;
}

export async function analyzeGaps(graph: RoadmapGraph, profile: any): Promise<GapAnalysisResult> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are a Cognitive Gap Analyzer.
Given a learner's current roadmap and their profile, identify why they might be stuck.

Analyze:
1. Why this learner is stuck at this stage.
2. What conceptual bridges are missing.
3. Which advanced topics require these missing foundations.
4. What micro-skills are blocking progress.

Return a specialized JSON:
{
 "bottleneck_concepts": [ { "concept": "Name", "reason": "Why it's blocking" } ],
 "bridge_topics": [ { "topic": "Name", "relevance": "How it helps" } ],
 "advanced_topics_blocked": [ "Topic 1", "Topic 2" ],
 "confidence": 0.9
}
`;

    const userMessage = `
Roadmap Summary: ${graph.summary}
Nodes: ${JSON.stringify(graph.nodes.map(n => ({ label: n.label, status: n.status })))}

Learner Profile:
${JSON.stringify(profile, null, 2)}
`;

    try {
        const response = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            { temperature: 0.15, max_tokens: 4096, json_mode: true }
        );

        return extractJson<GapAnalysisResult>(response);
    } catch (error) {
        console.error("[Knowledge] Gap Analysis Failed:", error);
        throw new Error("Failed to analyze gaps.");
    }
}
