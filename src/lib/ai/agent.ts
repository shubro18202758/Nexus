export type AgentMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    engine?: string; // "local", "cloud", "cloud+local_refined", "consensus", etc.
    duration_ms?: number;
};

export const TOOLS = [
    {
        name: "search_knowledge_base",
        description: "Quick semantic search of the knowledge base. Use for simple factual lookups. Returns top 5 results without re-ranking.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "The semantic search query." },
            },
            required: ["query"],
        },
    },
    {
        name: "deep_search",
        description: "Advanced search with query expansion and Cross-Encoder re-ranking. Use this for complex questions where precision matters. Generates multiple sub-queries, searches each, deduplicates, and re-ranks for maximum relevance.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "The main search query." },
            },
            required: ["query"],
        },
    },
    {
        name: "research_topic",
        description: "Multi-hop iterative research on a complex topic. Breaks the topic into sub-questions, deep-searches each sub-question, and compiles a structured research brief. Use for open-ended questions like 'What do we know about X?' or 'Summarize everything related to Y'.",
        parameters: {
            type: "object",
            properties: {
                topic: { type: "string", description: "The research topic or question." },
                depth: { type: "number", description: "Number of sub-questions to explore (1-5, default 3)." },
            },
            required: ["topic"],
        },
    },
    {
        name: "create_task",
        description: "Create a new task in the workspace. Use this when the user asks to add or remind them of a task.",
        parameters: {
            type: "object",
            properties: {
                title: { type: "string", description: "The concise title of the task." },
                due_date: { type: "string", description: "The due date in ISO 8601 format (YYYY-MM-DD), if specified." },
                priority: { type: "string", enum: ["low", "medium", "high"], description: "The priority of the task. Default is medium." },
                description: { type: "string", description: "Additional details or context for the task." },
            },
            required: ["title"],
        },
    },
    {
        name: "summarize_document",
        description: "Summarize a specific document by its ID.",
        parameters: {
            type: "object",
            properties: {
                document_id: { type: "string", description: "The ID of the document to summarize." },
            },
            required: ["document_id"],
        },
    },
];

export const SYSTEM_PROMPT = `
You are Nexus, an advanced AI workspace assistant powered by DeepSeek-R1-Distill-Qwen3-8B running locally via WebGPU.
You have agentic research capabilities with GPU-accelerated RAG (Retrieval-Augmented Generation).

You have access to the following tools:

${JSON.stringify(TOOLS, null, 2)}

INSTRUCTIONS:
1. If the user's request requires external data or actions, you MUST call a tool.
2. To call a tool, output a VALID JSON object in this format:

\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "key": "value"
  }
}
\`\`\`

3. Do NOT output any other text when calling a tool. Just the JSON.
4. If no tool is needed, respond normally in plain text.
5. Always ground your answers in search results when available. Cite specific facts.
6. If search results are insufficient, say so honestly and suggest refinements.

TOOL SELECTION STRATEGY:
- For simple factual lookups, use "search_knowledge_base".
- For complex questions requiring precision, use "deep_search" (it uses query expansion + Cross-Encoder re-ranking on GPU).
- For open-ended research or multi-faceted topics, use "research_topic" (iterative multi-hop search).
- PREFER "deep_search" over "search_knowledge_base" for any non-trivial question.
- If the user asks for notes, docs, or knowledge, always search first.

QUERY EXPANSION HINTS (used internally by deep_search):
When you receive results from a tool, analyze them carefully. If they don't fully answer the question, you can call another tool with a refined query. You have up to 8 turns to reason.

RESPONSE STYLE:
- Be concise and direct.
- Use markdown formatting for readability.
- When presenting search results, organize them clearly with bullet points.
`;

/**
 * Generate query expansion prompt for the LLM.
 * Returns a prompt that asks the LLM to generate 3 related sub-queries.
 */
export function buildQueryExpansionPrompt(originalQuery: string): string {
    return `Given the search query: "${originalQuery}"

Generate exactly 3 alternative search queries that would help find relevant information. Each query should approach the topic from a different angle or use different keywords.

Respond ONLY with a JSON array of strings, nothing else:
["query1", "query2", "query3"]`;
}

/**
 * Generate research decomposition prompt.
 * Returns a prompt that asks the LLM to break a topic into sub-questions.
 */
export function buildResearchDecompositionPrompt(topic: string, depth: number): string {
    return `Break down this research topic into ${depth} specific sub-questions that would help build a comprehensive understanding:

Topic: "${topic}"

Respond ONLY with a JSON array of strings, nothing else:
["sub-question 1", "sub-question 2", ...]`;
}

export function parseToolCall(content: string): { tool: string; parameters: any } | null {
    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const potentialJson = JSON.parse(jsonMatch[0]);
        if (potentialJson.tool && potentialJson.parameters) {
            return potentialJson;
        }
    } catch (error) {
        console.error("Failed to parse potential tool call:", error);
    }
    return null;
}

/**
 * Parse a JSON array from LLM output (for query expansion, sub-questions).
 */
export function parseJsonArray(content: string): string[] {
    try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];
        return JSON.parse(jsonMatch[0]);
    } catch {
        return [];
    }
}

// ============================================================
// Research Copilot — Strict JSON Prompts (Spec §1, §3)
// ============================================================

/**
 * System prompt that forces DeepSeek R1 to return ONLY valid JSON
 * matching the ResearchBrief schema.
 */
export const RESEARCH_COPILOT_SYSTEM_PROMPT = `You are a research assistant engine. You MUST respond ONLY with a single valid JSON object.

STRICT RULES:
1. Output ONLY JSON — no markdown, no explanation, no extra text.
2. Every claim MUST cite a source from the provided evidence using its [index].
3. If a claim has no supporting evidence, set the source field to "UNVERIFIED".
4. Do not hallucinate facts. Stick strictly to the provided sources.

The JSON MUST follow this exact schema:
{
  "title": "string — a concise research title",
  "summary": "string — 2-4 sentence executive summary",
  "key_findings": [
    { "point": "string — one distilled insight", "source": "string — e.g. [1] or UNVERIFIED" }
  ],
  "evidence": [
    { "source_id": "string — knowledge_item UUID", "quote": "string — verbatim or paraphrased excerpt", "similarity": 0.0 }
  ],
  "annotated_bibliography": [
    { "label": "string — e.g. [1]", "title": "string — source title", "source_id": "string — UUID", "score": 0.0 }
  ],
  "tasks": [
    { "title": "string — actionable follow-up task", "priority": "low|medium|high" }
  ],
  "confidence_score": 0.0
}

Return ONLY this JSON object. Nothing else.`;

/**
 * Build the user prompt for the research compilation step.
 * Receives the topic and the formatted source block from the RAG pipeline.
 */
export function buildResearchCompilationPrompt(
    topic: string,
    sourcesBlock: string,
    confidenceScore: number
): string {
    return `Research topic: "${topic}"

SOURCES (ordered by relevance):
${sourcesBlock || "No sources found — mark all findings as UNVERIFIED."}

Pre-computed confidence_score: ${confidenceScore.toFixed(3)}

Using ONLY the above sources, produce the JSON research brief. Include 3-6 key findings, the evidence array mirroring the sources, an annotated bibliography, and 1-3 actionable follow-up tasks. Set confidence_score to ${confidenceScore.toFixed(3)}.`;
}

/**
 * Build the user prompt to generate flashcards from a research brief.
 */
export function buildFlashcardPrompt(briefJson: string): string {
    return `Given this research brief JSON, generate study flashcards.

RESEARCH BRIEF:
${briefJson}

Produce a JSON array of flashcard objects. Each flashcard MUST have:
- "question": a clear study question
- "answer": a concise answer grounded in the research findings
- "citation": the source label (e.g. "[1]") that supports the answer

Return ONLY a JSON array: [{ "question": "", "answer": "", "citation": "" }, ...]`;
}
