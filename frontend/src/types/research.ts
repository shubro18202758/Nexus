// ============================================================
// Research Copilot — Strict JSON Output Types
// Matches the spec in research-copilot-architecture-safe-prompts.md §3
// ============================================================

/** A single key finding produced by the Research Copilot. */
export interface ResearchFinding {
  /** The distilled insight. */
  point: string;
  /** Source label, e.g. "[1]", "[3]", or "UNVERIFIED". */
  source: string;
}

/** An evidence entry tied back to a knowledge chunk. */
export interface ResearchEvidence {
  /** UUID of the knowledge_item (NOT the chunk). */
  source_id: string;
  /** Extracted quote / compressed content. */
  quote: string;
  /** Vector similarity or rerank score (0-1). */
  similarity: number;
}

/** A suggested task derived from the research. */
export interface ResearchTask {
  title: string;
  priority: "low" | "medium" | "high";
}

/** A bibliography entry. */
export interface BibliographyEntry {
  /** Source index, e.g. "[1]". */
  label: string;
  /** knowledge_item title or filename. */
  title: string;
  /** knowledge_item UUID. */
  source_id: string;
  /** Similarity/rerank score. */
  score: number;
}

/**
 * The strict JSON object returned by the Research Copilot.
 * DeepSeek MUST produce this shape — no markdown, no explanation.
 */
export interface ResearchBrief {
  title: string;
  summary: string;
  key_findings: ResearchFinding[];
  evidence: ResearchEvidence[];
  annotated_bibliography: BibliographyEntry[];
  tasks: ResearchTask[];
  confidence_score: number;
}

// ============================================================
// Flashcard Types (Spec §10)
// ============================================================

export interface Flashcard {
  question: string;
  answer: string;
  /** Citation label, e.g. "[2]". */
  citation: string;
}

// ============================================================
// Citation Viewer Types (Spec §8)
// ============================================================

export interface CitationDetail {
  /** Citation index (1-based). */
  index: number;
  /** Full chunk content (un-compressed). */
  content: string;
  /** Similarity score from vector search. */
  similarity: number;
  /** Rerank score from cross-encoder. */
  rerank_score?: number;
  /** Title of the parent knowledge_item. */
  source_title: string;
  /** UUID of the parent knowledge_item. */
  source_id: string;
}

// ============================================================
// Research Copilot Pipeline State
// ============================================================

export type ResearchStepStatus = "pending" | "running" | "done" | "error";

export interface ResearchStep {
  id: number;
  label: string;
  status: ResearchStepStatus;
  detail?: string;
}

// ============================================================
// Demo Mode Cache
// ============================================================

export interface DemoCacheEntry {
  query: string;
  brief: ResearchBrief;
  citations: CitationDetail[];
  timestamp: number;
}
