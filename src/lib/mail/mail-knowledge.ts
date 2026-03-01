// ===================================================================
// Mail Knowledge Base — In-memory RAG over filtered emails
//
// When mails are loaded/filtered, their text is chunked and embedded
// using the existing RAG worker (WebGPU all-MiniLM-L6-v2). This allows
// semantic search over mail content for the chat Q&A feature.
// ===================================================================

export interface MailChunk {
    id: string;               // `mail-{uid}-{chunkIndex}`
    uid: number;              // parent mail UID
    subject: string;          // for citation
    from: string;             // for citation
    date: string;             // for citation
    text: string;             // chunk content
    embedding?: number[];     // 384-dim vector
}

export interface MailSearchResult {
    chunk: MailChunk;
    similarity: number;
}

/**
 * Chunk a mail's text into overlapping segments for embedding.
 * Uses ~400 char chunks with 100 char overlap for good retrieval.
 */
export function chunkMailText(
    uid: number,
    subject: string,
    from: string,
    date: string,
    body: string,
): MailChunk[] {
    const CHUNK_SIZE = 400;
    const OVERLAP = 100;
    const chunks: MailChunk[] = [];

    // Prepend subject + from as context for each chunk
    const prefix = `Subject: ${subject}\nFrom: ${from}\n\n`;
    const text = prefix + body;

    if (text.length <= CHUNK_SIZE) {
        chunks.push({
            id: `mail-${uid}-0`,
            uid, subject, from, date,
            text,
        });
        return chunks;
    }

    let offset = 0;
    let idx = 0;
    while (offset < text.length) {
        const end = Math.min(offset + CHUNK_SIZE, text.length);
        chunks.push({
            id: `mail-${uid}-${idx}`,
            uid, subject, from, date,
            text: text.substring(offset, end),
        });
        offset += CHUNK_SIZE - OVERLAP;
        idx++;
    }

    return chunks;
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

/**
 * In-memory vector index for mail chunks.
 * Populated by embedding mails through the RAG worker.
 */
export class MailVectorIndex {
    private chunks: MailChunk[] = [];

    clear() {
        this.chunks = [];
    }

    addChunks(chunks: MailChunk[]) {
        this.chunks.push(...chunks);
    }

    get size() {
        return this.chunks.length;
    }

    get indexedMailUids(): Set<number> {
        return new Set(this.chunks.map(c => c.uid));
    }

    /**
     * Search the index for the most relevant chunks to a query embedding.
     */
    search(queryEmbedding: number[], topK: number = 8): MailSearchResult[] {
        const scored = this.chunks
            .filter(c => c.embedding)
            .map(chunk => ({
                chunk,
                similarity: cosineSimilarity(queryEmbedding, chunk.embedding!),
            }))
            .sort((a, b) => b.similarity - a.similarity);

        return scored.slice(0, topK);
    }

    /**
     * Get all chunks for a specific mail UID.
     */
    getChunksForMail(uid: number): MailChunk[] {
        return this.chunks.filter(c => c.uid === uid);
    }
}

// Singleton index instance
export const mailIndex = new MailVectorIndex();
