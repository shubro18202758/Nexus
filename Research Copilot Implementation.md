# Research Copilot Implementation

We implemented **Research Copilot**, a thin, non-invasive orchestration layer built on top of Slingshot's existing Agentic RAG pipeline. Rather than adding new backends, models, or storage, the Copilot reuses the in-browser stack (PGlite + pgvector), the Xenova embedding pipeline, the Cross-Encoder reranker, and the DeepSeek-R1 WebGPU LLM. On a user query, Research Copilot retrieves and reranks relevant chunks, compresses context, calls the local LLM with a strict JSON prompt, and returns a citation-aware structured research brief (summary, key findings, evidence, tasks, confidence score). The implementation emphasizes privacy (fully local), architectural continuity, concurrency safety, and demo stability.

---

## What we changed (concrete code-level summary)

These are the targeted, minimal changes made to integrate Research Copilot while preserving current architecture:

### Schema fix

- `src/db/schema.ts`
  - Changed `knowledgeChunks.embedding` from `vector("embedding")` (1536) → `vector384("embedding")` to match Xenova all-MiniLM-L6-v2 (384 dims).

### Provider / orchestration

- `src/components/providers/rag-provider.tsx`
  - Added `researchCopilot(query, workspaceId)` method that:
    1. Calls `searchWithRerank(query)`.
    2. Builds a compressed, citation-aware context block from top 5 results.
    3. Calls `LLMEngine.getInstance().chat()` with a strict system prompt requesting JSON only.
    4. Parses and returns JSON, or returns `raw_output` with low confidence if parsing fails.
  - Stabilized worker initialization (worker created exactly once on mount).
  - Refactored `search()` and `SEARCH_GENERATED` handling to use `searchId` so concurrent searches resolve to their matching promises.

### Worker

- `src/workers/rag.worker.ts` (or existing worker file)
  - Ensured `SEARCH` messages accept a `searchId` and `SEARCH_GENERATED` responses include that `searchId`.
  - Kept embedding & reranker logic unchanged; worker posts embeddings and reranker results as before.

### UI

- `src/components/ai/ResearchCopilot.tsx`
  - New floating panel (right side) with:
    - Multi-line input
    - Run Research button
    - Loading state & confidence indicator
    - Two output views: human-friendly summary and expandable raw JSON

### Dev ergonomics

- Temporary debug helper in RagProvider (dev-only): expose `window.pg` and `window.ragWorker` for quick inspection during QA (removed prior to final merge).

---

## End-to-end flow (detailed)

1. **User** types a research query in the Copilot panel and clicks "Run Research".

2. **RagProvider.researchCopilot(query, workspaceId)** executes:
   - Calls `searchWithRerank(query)` (existing pipeline).
     - `search()` — worker creates query embedding and returns top-20 nearest candidates from `knowledge_chunks` (filtered to the workspace).
     - `rerank()` — worker cross-encodes [query, passage] pairs to rerank candidates.
     - `searchWithRerank()` — takes top-5 reranked chunks and applies `compressContext()` to each chunk.
   - Builds a compact **contextBlock** by formatting each top chunk as:
     ```
     SOURCE N (ID: <knowledge_chunk_id>, SIM: <similarity_score>): <compressed_text>
     ```
   - Initializes DeepSeek (`LLMEngine.initialize()`) if not ready (handles WebGPU availability; fallback to WASM).
   - Calls `LLMEngine.chat()` with a **strict system prompt** instructing the model to return JSON only. Example system prompt:
     ```
     You are Nexus Research Copilot. RETURN STRICT JSON ONLY (no markdown, no explanation).
     FORMAT:
     {
       "title": "",
       "summary": "",
       "key_findings": [{"point":"","source":""}],
       "evidence": [{"source_id":"","quote":"","similarity":0.0}],
       "annotated_bibliography": [],
       "tasks": [{"title":"","priority":"low|medium|high"}],
       "confidence_score": 0.0
     }
     Use ONLY the provided sources. If unsupported, use "UNVERIFIED".
     ```
   - Parses the first JSON object in the model output and returns it to the UI (or returns raw model output + low confidence if parsing fails).

3. **UI** renders:
   - Human-readable summary (short, actionable)
   - Expandable JSON view (for transparency and downstream automation)
   - Confidence visual (derived from retrieval + rerank signals)

4. **Task creation (optional)**: When tasks are present in the JSON, the Agent tool `create_task` is invoked to persist tasks via the existing workflows (prevents duplication by title within the same workspace).

---

## Key Benefits

- **Schema correctness:** fixed embedding vector dimension mismatch (critical for pgvector operator compatibility).
- **Strict JSON contract:** this enables deterministic downstream automation (task creation, exports) and makes the feature judge/demo ready.
