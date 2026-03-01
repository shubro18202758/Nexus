"use server";

import { type LearningProfile } from "@/db/schema";
import { type RoadmapGraph } from "@/lib/ai/roadmap-architect";
// We need to import the analyzer logic. 
// Note: cognitive-analyzer uses LLMEngine (Client-Side). 
// Accessing client-side singleton from server action might be tricky if it depends on browser APIs (WebGPU).
// However, `LLMEngine` in this project is designed for Client Execution.
// So `runGapAnalysis` should essentially just be a wrapper if we wanted server-side.
// BUT, since `LLMEngine` is client-side WebLLM, we likely should call `analyzeGaps` directly from the Client Component, 
// NOT via a Server Action. The Server Action pattern is for DB or Server-Side logic.
// 
// CORRECTION: `cognitive-analyzer.ts` uses `LLMEngine`. `LLMEngine` runs in the browser. 
// So `analyzeGaps` must be called from the Client.
//
// The Resource Finder uses Stagehand (Node.js). That MUST be a Server Action.

import { findResources } from "@/lib/agent/resource-finder";

export async function searchForLearningResources(topic: string, limit: number = 3) {
    try {
        const resources = await findResources(topic, limit);
        return { success: true, resources };
    } catch (error) {
        console.error("Search failed:", error);
        return { success: false, error: String(error) };
    }
}

// NOTE: Content Curation uses LLMEngine (Client-Side).
// We cannot run it here on the server if LLMEngine is WebGPU-based.
// We must fetch raw resources here (Server Action) and return them to the Client.
// The Client then calls `curateResources` (Client-Side Logic).
//
// So, we update this action to support fetching MORE resources (limit=10) for curation.
