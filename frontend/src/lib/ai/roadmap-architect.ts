import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import { type LearningProfile } from "@/db/schema";

export interface RoadmapNode {
    id: string;
    label: string;
    description: string;
    status: "completed" | "in-progress" | "next" | "locked";
    type: "concept" | "project" | "milestone";
}

export interface RoadmapEdge {
    id: string;
    source: string;
    target: string;
}

export interface RoadmapGraph {
    nodes: RoadmapNode[];
    edges: RoadmapEdge[];
    summary: string;
    estimated_duration: string;
}

export async function generateRoadmap(profile: any, domain: string): Promise<RoadmapGraph> {
    const engine = LLMEngine.getInstance();

    if (!engine.isReady()) {
        await engine.initialize();
    }

    const systemPrompt = `
You are a Curriculum Architect.
Given a learner profile and a target domain, map out a structured learning roadmap.

Return a JSON object representing a graph of learning nodes.
Structure:
{
  "nodes": [
    { "id": "1", "label": "Node Name", "description": "Short desc", "status": "completed|in-progress|next|locked", "type": "concept|project|milestone" }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2" }
  ],
  "summary": "Brief overview of the path",
  "estimated_duration": "e.g. 3 months"
}

Rules:
1. "completed" nodes should be things the user already knows (from profile).
2. "next" nodes are the critical next steps (max 3).
3. "locked" nodes are future advanced topics.
4. Ensure the graph is connected (DAG).
`;

    const userMessage = `
Target Domain: ${domain}

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

        return extractJson<RoadmapGraph>(response);
    } catch (error) {
        console.error("[Knowledge] Roadmap Generation Failed:", error);
        throw new Error("Failed to generate roadmap.");
    }
}
