## 1️⃣ Create Research Copilot as an Orchestration Layer

**Prompt:**

Extend Slingshot by adding a "Research Copilot" feature that operates as a thin orchestration layer on top of the existing Agentic RAG system.

**Requirements:**

- Must reuse `searchWithRerank()` from RagProvider.
- Must reuse DeepSeek R1 local inference via LLMEngine.
- Must not introduce new embedding models.
- Must not introduce new vector storage.
- Must not introduce backend REST APIs.

**Flow:**

```
User Query
  ↓
searchWithRerank()
  ↓
Context Compression
  ↓
DeepSeek R1
  ↓
Strict JSON Research Brief
```

## 2️⃣ Reuse Existing Document Ingestion System

**Prompt:**

Do NOT create a new document upload system inside Research Copilot.

**Instead:**

- Reuse existing Knowledge ingestion system.
- Ensure Research Copilot only operates on already indexed `knowledge_items`.
- Maintain compatibility with existing `chunkText()` + worker embedding pipeline.
- Research Copilot must assume documents are already indexed.

## 3️⃣ Implement Structured JSON Output (Strict Format)

**Prompt:**

Enforce strict JSON-only output from DeepSeek.

**Required format:**

```json
{
  "title": "",
  "summary": "",
  "key_findings": [
    { "point": "", "source": "" }
  ],
  "evidence": [
    {
      "source_id": "",
      "quote": "",
      "similarity": 0.0
    }
  ],
  "annotated_bibliography": [],
  "tasks": [
    {
      "title": "",
      "priority": "low|medium|high"
    }
  ],
  "confidence_score": 0.0
}
```

**Constraints:**

- Return JSON only.
- No markdown.
- No explanation text.
- Unsupported claims must use "UNVERIFIED".

## 4️⃣ Integrate with Existing Tool System

**Prompt:**

When research output contains tasks:

- Do NOT manually insert tasks into DB.
- Instead, invoke the existing `create_task` tool from the agent tool system.
- Respect existing task schema (`priorityEnum`, `dueDate` optional).
- Prevent duplicate tasks by checking for identical titles in the same workspace.
- Research Copilot must integrate cleanly with Stagehand + agent ecosystem.

## 5️⃣ Add Workspace-Scoped Retrieval

**Prompt:**

Modify vector search logic to restrict retrieval to current workspace.

**Ensure SQL filters by:**

```
knowledge_items.workspace_id
```

This prevents cross-workspace knowledge leakage.

Do not modify embedding logic.

## 6️⃣ Implement Confidence Scoring Using Existing Signals

**Prompt:**

Calculate `confidence_score` using:

- Average vector similarity score
- Cross-encoder `rerank_score`
- Citation density (number of supported findings / total findings)

Do not introduce external evaluation models.  
Use existing RAG pipeline outputs.

## 7️⃣ Add Research Copilot UI Panel (Non-Invasive)

**Prompt:**

Add a floating right-side Research Copilot panel.

**UI Requirements:**

- Multi-line query input
- "Run Research" button
- Loading spinner
- Confidence indicator
- Two output tabs:
  - Human-readable summary
  - Raw JSON (expandable)

Must match Slingshot dark theme.  
Must not modify global command center layout.  
Must not interfere with existing AI chat.

## 8️⃣ Add Citation Viewer Modal

**Prompt:**

When user clicks a citation (SOURCE ID):

Open a side modal that:

- Displays highlighted chunk text
- Shows similarity score
- Shows source title (from `knowledge_items`)
- Displays document preview if available

Use existing knowledge graph + document viewer components.  
Maintain dark theme consistency.

## 9️⃣ Add Demo Mode (Local-First Safe Mode)

**Prompt:**

Add a Demo Mode toggle inside Research Copilot.

**In Demo Mode:**

- Use pre-indexed demo documents.
- Cache JSON responses.
- Skip live reranking if needed.
- Skip DeepSeek call if cached result exists.

**If engine fails:**

Show:  
`"Displaying cached research results."`

Demo mode must not alter core architecture.

## 🔟 Add Flashcard Generator (Optional Extension)

**Prompt:**

Add "Generate Flashcards" button below research output.

**Behavior:**

- Convert summary into Q/A pairs.
- Ensure each answer is supported by citation.
- Allow CSV export.

Must use existing DeepSeek engine.  
Must not use external APIs.  
Must not modify RAG pipeline.
