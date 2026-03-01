"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { chunkText } from "@/lib/file-processing";
import { useDb } from "@/components/providers/db-provider";
import { knowledgeItems, knowledgeChunks } from "@/db/schema";
import type {
    ResearchBrief,
    CitationDetail,
    ResearchEvidence,
    BibliographyEntry,
} from "@/types/research";
import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";
import {
    RESEARCH_COPILOT_SYSTEM_PROMPT,
    buildResearchCompilationPrompt,
    parseJsonArray,
    buildQueryExpansionPrompt,
    buildResearchDecompositionPrompt,
} from "@/lib/ai/agent";

type RagWorkerMessage = {
    type: "INDEX_GENERATED" | "SEARCH_GENERATED" | "RERANK_COMPLETE" | "STATUS" | "ERROR";
    payload: any;
};

interface SearchResult {
    id: string;
    content: string;
    similarity: number;
    rerank_score?: number;
    /** Title of the parent knowledge_item (populated during workspace-scoped search). */
    source_title?: string;
}

/** Return type for the full Research Copilot pipeline. */
export interface ResearchCopilotResult {
    brief: ResearchBrief;
    citations: CitationDetail[];
    rawJson: string;
}

interface RagContextType {
    isReady: boolean;
    worker: Worker | null;
    addDocument: (title: string, content: string, workspaceId: string, fileName?: string) => Promise<string>;
    resetIndex: () => Promise<void>;
    search: (query: string) => Promise<SearchResult[]>;
    searchWithRerank: (query: string) => Promise<SearchResult[]>;
    searchWithRerankScoped: (query: string, workspaceId: string) => Promise<SearchResult[]>;
    researchCopilot: (
        query: string,
        workspaceId: string,
        onStep?: (step: number, detail: string) => void
    ) => Promise<ResearchCopilotResult>;
}

const RagContext = createContext<RagContextType | undefined>(undefined);

export function useRag() {
    const context = useContext(RagContext);
    if (!context) {
        throw new Error("useRag must be used within a RagProvider");
    }
    return context;
}

/**
 * Contextual Compression — extract only the most relevant sentences 
 * from a chunk based on keyword overlap with the query.
 */
function compressContext(content: string, query: string, maxSentences: number = 3): string {
    const queryWords = new Set(
        query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

    if (sentences.length <= maxSentences) return content;

    // Score each sentence by keyword overlap
    const scored = sentences.map(sentence => {
        const words = sentence.toLowerCase().split(/\s+/);
        const overlap = words.filter(w => queryWords.has(w)).length;
        return { sentence, score: overlap };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxSentences).map(s => s.sentence).join(". ") + ".";
}

export function RagProvider({ children }: { children: ReactNode }) {
    const workerRef = useRef<Worker | null>(null);
    const [isReady, setIsReady] = useState(false);
    const { db, pg } = useDb();

    // Map search requests to promises
    const searchResolversRef = useRef<Map<string, (results: SearchResult[]) => void>>(new Map());
    // Map re-rank requests to promises
    const rerankResolversRef = useRef<Map<string, (results: SearchResult[]) => void>>(new Map());

    useEffect(() => {
        workerRef.current = new Worker(new URL("../../workers/rag.worker.ts", import.meta.url));

        workerRef.current.onmessage = async (event: MessageEvent<RagWorkerMessage>) => {
            const { type, payload } = event.data;

            if (type === "INDEX_GENERATED") {
                const { id, text, embedding } = payload;
                const parts = id.split("-");
                const knowledgeItemId = parts.slice(0, 5).join("-"); // UUID has 5 parts

                if (db && embedding) {
                    try {
                        await db.insert(knowledgeChunks).values({
                            knowledgeItemId,
                            content: text,
                            embedding,
                        });
                    } catch (e) {
                        console.error("Failed to insert chunk embedding:", e);
                    }
                }

            } else if (type === "SEARCH_GENERATED") {
                const { embedding, searchId } = payload;

                // Guard: only run the unscoped DB query if a resolver is registered.
                // Workspace-scoped searches use their own listener and should be skipped here.
                if (pg && embedding && searchId && searchResolversRef.current.has(searchId)) {
                    try {
                        const embeddingString = `[${embedding.join(",")}]`;

                        // Broad retrieval — fetch top 20 for re-ranking
                        const result = await pg.query(`
                            SELECT 
                                content, 
                                1 - (embedding <=> $1) as similarity,
                                knowledge_item_id
                            FROM knowledge_chunks
                            WHERE embedding IS NOT NULL
                            ORDER BY embedding <=> $1 ASC
                            LIMIT 20;
                        `, [embeddingString]);

                        const results: SearchResult[] = result.rows.map((row: any) => ({
                            content: row.content,
                            similarity: parseFloat(row.similarity),
                            id: row.knowledge_item_id
                        }));

                        // Resolve the matching search promise by searchId
                        const resolve = searchResolversRef.current.get(searchId);
                        if (resolve) {
                            resolve(results);
                            searchResolversRef.current.delete(searchId);
                        }
                    } catch (e) {
                        console.error("Vector search failed:", e);
                        const resolve = searchResolversRef.current.get(searchId);
                        if (resolve) {
                            resolve([]);
                            searchResolversRef.current.delete(searchId);
                        }
                    }
                }
            } else if (type === "RERANK_COMPLETE") {
                const { searchId, results } = payload;

                const resolve = rerankResolversRef.current.get(searchId);
                if (resolve) {
                    resolve(results);
                    rerankResolversRef.current.delete(searchId);
                }
            } else if (type === "STATUS") {
                console.log("[RAG Worker]", payload.message);
            } else if (type === "ERROR") {
                console.error("RAG Worker Error:", payload.error);
            }
        };

        setIsReady(true);

        return () => {
            workerRef.current?.terminate();
        };
    }, [db, pg]);

    const addDocument = useCallback(async (title: string, content: string, workspaceId: string, fileName: string = "manual-entry") => {
        if (!workerRef.current || !db) return "";

        const [newItem] = await db.insert(knowledgeItems).values({
            workspaceId,
            title,
            fileName,
            type: "text",
        }).returning();

        const docId = newItem.id;
        const chunks = chunkText(content);

        chunks.forEach((chunk, index) => {
            const chunkId = `${docId}-${index}`;
            workerRef.current?.postMessage({
                type: "INDEX",
                payload: { id: chunkId, text: chunk }
            });
        });

        return docId;
    }, [db]);

    const resetIndex = useCallback(async () => {
        if (pg) {
            await pg.exec(`TRUNCATE TABLE knowledge_chunks; TRUNCATE TABLE knowledge_items CASCADE;`);
        }
    }, [pg]);

    /**
     * Basic vector search — returns top 20 raw results (no re-ranking).
     * Used internally and for quick searches.
     */
    const search = useCallback((query: string): Promise<SearchResult[]> => {
        return new Promise((resolve) => {
            if (!workerRef.current) {
                resolve([]);
                return;
            }
            const searchId = uuidv4();
            searchResolversRef.current.set(searchId, resolve);
            workerRef.current.postMessage({ type: "SEARCH", payload: { query, searchId } });
        });
    }, []);

    /**
     * Re-rank results using the Cross-Encoder.
     * Sends candidate results to the worker for scoring.
     */
    const rerank = useCallback((query: string, candidates: SearchResult[]): Promise<SearchResult[]> => {
        return new Promise((resolve) => {
            if (!workerRef.current || candidates.length === 0) {
                resolve(candidates);
                return;
            }
            const searchId = uuidv4();
            rerankResolversRef.current.set(searchId, resolve);
            workerRef.current.postMessage({
                type: "RERANK",
                payload: {
                    searchId,
                    query,
                    candidates: candidates.map(c => ({
                        id: c.id,
                        content: c.content,
                        similarity: c.similarity,
                    })),
                },
            });
        });
    }, []);

    /**
     * Full Agentic RAG pipeline:
     * 1. Broad vector retrieval (top 20)
     * 2. Cross-Encoder re-ranking
     * 3. Take top 5
     * 4. Contextual compression
     */
    const searchWithRerank = useCallback(async (query: string): Promise<SearchResult[]> => {
        // Stage 1: Broad retrieval
        const broadResults = await search(query);
        if (broadResults.length === 0) return [];

        // Stage 2: Cross-Encoder re-ranking
        const reranked = await rerank(query, broadResults);

        // Stage 3: Take top 5
        const top5 = reranked.slice(0, 5);

        // Stage 4: Contextual compression
        const compressed = top5.map(result => ({
            ...result,
            content: compressContext(result.content, query),
        }));

        return compressed;
    }, [search, rerank]);

    // ================================================================
    // Spec §5 — Workspace-Scoped Vector Retrieval
    // ================================================================

    /**
     * Workspace-scoped vector search + rerank.
     * Joins knowledge_chunks → knowledge_items to filter by workspace_id.
     * Prevents cross-workspace knowledge leakage.
     */
    const searchWorkspaceScoped = useCallback(async (
        query: string,
        workspaceId: string
    ): Promise<SearchResult[]> => {
        return new Promise((resolve) => {
            if (!workerRef.current || !pg) {
                resolve([]);
                return;
            }

            // We need the embedding for this query — reuse the worker
            const searchId = uuidv4();
            const handler = async (event: MessageEvent<RagWorkerMessage>) => {
                const { type, payload } = event.data;
                if (type !== "SEARCH_GENERATED") return;
                // Only handle the response matching OUR searchId
                if (payload.searchId !== searchId) return;

                // Remove this one-shot listener immediately to prevent stale handlers
                workerRef.current?.removeEventListener("message", handler);

                const { embedding } = payload;
                if (!embedding) {
                    resolve([]);
                    return;
                }

                try {
                    const embeddingString = `[${embedding.join(",")}]`;

                    // Workspace-scoped query — JOIN on knowledge_items
                    const result = await pg.query(`
                        SELECT 
                            kc.content,
                            1 - (kc.embedding <=> $1) as similarity,
                            kc.knowledge_item_id,
                            ki.title as source_title
                        FROM knowledge_chunks kc
                        INNER JOIN knowledge_items ki ON kc.knowledge_item_id = ki.id
                        WHERE kc.embedding IS NOT NULL
                          AND ki.workspace_id = $2
                        ORDER BY kc.embedding <=> $1 ASC
                        LIMIT 20;
                    `, [embeddingString, workspaceId]);

                    const results: SearchResult[] = result.rows.map((row: any) => ({
                        content: row.content,
                        similarity: parseFloat(row.similarity),
                        id: row.knowledge_item_id,
                        source_title: row.source_title,
                    }));

                    resolve(results);
                } catch (e) {
                    console.error("Workspace-scoped vector search failed:", e);
                    resolve([]);
                }
            };

            workerRef.current.addEventListener("message", handler);

            // Safety timeout — prevent dangling listener (60 seconds)
            setTimeout(() => {
                workerRef.current?.removeEventListener("message", handler);
                // If still pending, resolve empty
                resolve([]);
            }, 60_000);

            workerRef.current.postMessage({ type: "SEARCH", payload: { query, searchId } });
        });
    }, [pg]);

    /**
     * Workspace-scoped search + cross-encoder rerank + top-5 + compression.
     */
    const searchWithRerankScoped = useCallback(async (
        query: string,
        workspaceId: string
    ): Promise<SearchResult[]> => {
        const broadResults = await searchWorkspaceScoped(query, workspaceId);
        if (broadResults.length === 0) return [];

        const reranked = await rerank(query, broadResults);
        const top5 = reranked.slice(0, 5);

        return top5.map(result => ({
            ...result,
            content: compressContext(result.content, query),
        }));
    }, [searchWorkspaceScoped, rerank]);

    // ================================================================
    // Spec §1, §3, §6 — Research Copilot Orchestration
    // ================================================================

    /**
     * Calculate confidence_score from existing RAG signals (Spec §6):
     * - Average vector similarity
     * - Average cross-encoder rerank_score
     * - Citation density (supported / total findings)
     */
    function calculateConfidence(results: SearchResult[]): number {
        if (results.length === 0) return 0;

        const avgSimilarity =
            results.reduce((sum, r) => sum + r.similarity, 0) / results.length;

        const withRerank = results.filter(r => r.rerank_score != null);
        const avgRerank = withRerank.length > 0
            ? withRerank.reduce((sum, r) => sum + (r.rerank_score ?? 0), 0) / withRerank.length
            : avgSimilarity; // fallback

        // Citation density = how many results have decent similarity (>0.3)
        const supported = results.filter(r => r.similarity > 0.3).length;
        const citationDensity = supported / Math.max(results.length, 1);

        // Weighted blend: 30% similarity, 40% rerank, 30% citation density
        const confidence = 0.3 * avgSimilarity + 0.4 * avgRerank + 0.3 * citationDensity;
        return Math.min(Math.max(confidence, 0), 1); // clamp 0-1
    }

    /**
     * Full Research Copilot pipeline (Spec §1, §3):
     * 1. Decompose query → sub-questions
     * 2. Expand queries
     * 3. Workspace-scoped searchWithRerank for each
     * 4. Deduplicate & merge
     * 5. Build source block with citation indices
     * 6. Compute confidence_score
     * 7. Call DeepSeek R1 with strict JSON system prompt
     * 8. Parse & return
     */
    const researchCopilot = useCallback(async (
        query: string,
        workspaceId: string,
        onStep?: (step: number, detail: string) => void
    ): Promise<ResearchCopilotResult> => {
        const emit = (step: number, detail: string) => onStep?.(step, detail);

        // --- Step 1: Decompose ---
        emit(1, "Decomposing research topic...");
        const llm = LLMEngine.getInstance();

        if (!llm.isReady()) {
            emit(1, "Initializing AI model (first run)...");
            await llm.initialize((progress) => {
                if (progress.text?.includes("%")) {
                    emit(1, `Loading AI: ${progress.text}`);
                }
            });
        }

        let subQuestions: string[] = [];
        try {
            const decomp = buildResearchDecompositionPrompt(query, 3);
            const resp = await llm.chat(
                [
                    { role: "system", content: "You are a research assistant. Respond ONLY with a JSON array of sub-questions." },
                    { role: "user", content: decomp },
                ],
                { temperature: 0.15, max_tokens: 1024, json_mode: true }
            );
            subQuestions = parseJsonArray(resp);
        } catch { /* fallback */ }
        if (subQuestions.length === 0) subQuestions = [query];
        emit(1, `${subQuestions.length} sub-questions generated`);

        // --- Step 2: Expand queries ---
        emit(2, "Expanding queries for coverage...");
        const allQueries: string[] = [];
        for (const q of subQuestions) {
            allQueries.push(q);
            try {
                const expPrompt = buildQueryExpansionPrompt(q);
                const resp = await llm.chat(
                    [
                        { role: "system", content: "Respond ONLY with a JSON array of strings." },
                        { role: "user", content: expPrompt },
                    ],
                    { temperature: 0.2, max_tokens: 1024, json_mode: true }
                );
                const expanded = parseJsonArray(resp);
                allQueries.push(...expanded.slice(0, 2));
            } catch { /* silent */ }
        }
        emit(2, `${allQueries.length} search queries ready`);

        // --- Step 3: Workspace-scoped search & rerank ---
        emit(3, "Searching knowledge base (workspace-scoped)...");
        const allResults: SearchResult[] = [];
        const seen = new Set<string>();

        for (const q of allQueries) {
            try {
                const results = await searchWithRerankScoped(q, workspaceId);
                for (const r of results) {
                    const key = r.content.substring(0, 80);
                    if (!seen.has(key)) {
                        seen.add(key);
                        allResults.push(r);
                    }
                }
            } catch { /* continue */ }
        }

        // Sort by best score (rerank preferred, fallback to similarity)
        allResults.sort((a, b) =>
            (b.rerank_score ?? b.similarity) - (a.rerank_score ?? a.similarity)
        );
        const topResults = allResults.slice(0, 10);
        emit(3, `${topResults.length} high-relevance sources found`);

        // --- Step 4: Build citation block + confidence ---
        emit(4, "Compiling research brief with citations...");

        // Build citations
        const citations: CitationDetail[] = topResults.map((r, i) => ({
            index: i + 1,
            content: r.content,
            similarity: r.similarity,
            rerank_score: r.rerank_score,
            source_title: r.source_title || "Unknown Source",
            source_id: r.id,
        }));

        const sourcesBlock = citations
            .map(c => `[${c.index}] (source_id: ${c.source_id}, title: "${c.source_title}", similarity: ${c.similarity.toFixed(3)}) ${c.content}`)
            .join("\n\n");

        // Spec §6 — confidence from existing signals
        const confidenceScore = calculateConfidence(topResults);

        // --- Step 5: LLM compilation with strict JSON ---
        const compilationPrompt = buildResearchCompilationPrompt(query, sourcesBlock, confidenceScore);

        let rawJson = "";
        let brief: ResearchBrief;

        try {
            rawJson = await llm.chat(
                [
                    { role: "system", content: RESEARCH_COPILOT_SYSTEM_PROMPT },
                    { role: "user", content: compilationPrompt },
                ],
                { temperature: 0.3, max_tokens: 8192, json_mode: true }
            );

            brief = extractJson<ResearchBrief>(rawJson);
            // Enforce the pre-computed confidence
            brief.confidence_score = confidenceScore;
        } catch (parseErr) {
            console.error("Failed to parse research JSON:", parseErr);
            // Fallback: construct a minimal valid brief
            brief = {
                title: `Research: ${query}`,
                summary: topResults.length > 0
                    ? `Found ${topResults.length} relevant sources but failed to compile structured output. Raw sources are available in the citations panel.`
                    : "No relevant sources found in the knowledge base for this query.",
                key_findings: topResults.slice(0, 3).map((r, i) => ({
                    point: r.content.substring(0, 200),
                    source: `[${i + 1}]`,
                })),
                evidence: topResults.map((r, i) => ({
                    source_id: r.id,
                    quote: r.content.substring(0, 300),
                    similarity: r.similarity,
                })),
                annotated_bibliography: citations.map(c => ({
                    label: `[${c.index}]`,
                    title: c.source_title,
                    source_id: c.source_id,
                    score: c.rerank_score ?? c.similarity,
                })),
                tasks: [],
                confidence_score: confidenceScore,
            };
            rawJson = JSON.stringify(brief, null, 2);
        }

        emit(4, "Research brief compiled");

        return { brief, citations, rawJson };
    }, [searchWithRerankScoped]);

    return (
        <RagContext.Provider value={{
            isReady,
            worker: workerRef.current,
            addDocument,
            resetIndex,
            search,
            searchWithRerank,
            searchWithRerankScoped,
            researchCopilot,
        }}>
            {children}
        </RagContext.Provider>
    );
}
