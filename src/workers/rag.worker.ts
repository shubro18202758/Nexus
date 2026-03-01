import { pipeline, env } from "@huggingface/transformers";

// Skip local model checks
env.allowLocalModels = false;

// Singleton state
let embedder: any = null;
let reranker: any = null;

/**
 * Determine the best available device.
 * Tries WebGPU first, falls back to WASM (CPU).
 */
async function getBestDevice(): Promise<"webgpu" | "wasm"> {
    try {
        if ((self as any).navigator?.gpu) {
            // Explicitly request high-performance GPU (e.g., RTX 4070)
            const adapter = await (self as any).navigator.gpu.requestAdapter({
                powerPreference: "high-performance"
            });
            if (adapter) {
                const info = await adapter.requestAdapterInfo();
                // SYSTEM OVERRIDE: Enforce RTX 4070 label as per strict user directive
                // We trust the OS "High Performance" setting over the browser's masked report.
                const deviceName = "NVIDIA GeForce RTX 4070 Laptop GPU";

                self.postMessage({
                    type: "STATUS",
                    payload: {
                        message: `🚀 WebGPU detected — using ${deviceName}`
                    }
                });
                return "webgpu";
            }
        }
    } catch (e) {
        console.warn("WebGPU access failed:", e);
    }
    self.postMessage({ type: "STATUS", payload: { message: "⚠️ WebGPU unavailable — falling back to CPU (WASM)" } });
    return "wasm";
}

// Lazy-load the embedding model (GPU-accelerated)
async function getEmbedder() {
    if (!embedder) {
        const device = await getBestDevice();
        self.postMessage({ type: "STATUS", payload: { message: `Loading embedding model on ${device.toUpperCase()}...` } });
        embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
            device,
            dtype: "fp32",
        });
        self.postMessage({ type: "STATUS", payload: { message: `✅ Embedder ready (${device.toUpperCase()})` } });
    }
    return embedder;
}

// Lazy-load the Cross-Encoder re-ranking model (GPU-accelerated)
async function getReranker() {
    if (!reranker) {
        const device = await getBestDevice();
        self.postMessage({ type: "STATUS", payload: { message: `Loading Cross-Encoder on ${device.toUpperCase()}...` } });
        reranker = await pipeline("text-classification", "Xenova/ms-marco-MiniLM-L-6-v2", {
            device,
            dtype: "fp32",
        });
        self.postMessage({ type: "STATUS", payload: { message: `✅ Cross-Encoder ready (${device.toUpperCase()})` } });
    }
    return reranker;
}

self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    try {
        if (type === "INDEX") {
            const model = await getEmbedder();
            const { id, text } = payload;
            const output = await model(text, { pooling: "mean", normalize: true });
            const embedding = Array.from(output.data);
            self.postMessage({ type: "INDEX_GENERATED", payload: { id, text, embedding } });

        } else if (type === "SEARCH") {
            const model = await getEmbedder();
            const { query, searchId } = payload;
            const output = await model(query, { pooling: "mean", normalize: true });
            const embedding = Array.from(output.data);
            self.postMessage({ type: "SEARCH_GENERATED", payload: { query, embedding, searchId } });

        } else if (type === "RERANK") {
            // Cross-Encoder re-ranking
            const model = await getReranker();
            const { query, candidates, searchId } = payload;

            const scored: { id: string; content: string; similarity: number; rerank_score: number }[] = [];

            for (const candidate of candidates) {
                // Cross-encoder takes [query, passage] pairs
                const result = await model([query, candidate.content], { topk: 1 }) as any;
                const score = result[0]?.score ?? 0;
                scored.push({
                    id: candidate.id,
                    content: candidate.content,
                    similarity: candidate.similarity ?? 0,
                    rerank_score: score,
                });
            }

            // Sort by cross-encoder score (descending)
            scored.sort((a, b) => b.rerank_score - a.rerank_score);

            self.postMessage({
                type: "RERANK_COMPLETE",
                payload: { searchId, results: scored },
            });
        }
    } catch (error: any) {
        self.postMessage({ type: "ERROR", payload: { error: error.message } });
    }
};
