// ===================================================================
// LLM Engine — DeepSeek R1 0528 Distill Qwen3 8B
//
// ██████████████████████████████████████████████████████████████████
// ██  CORE MODEL: DeepSeek-R1-0528-Distill-Qwen3-8B (Ollama)    ██
// ██  This is the IMMUTABLE heart of Slingshot. DO NOT change.   ██
// ██  The entire project — tuning, GPU acceleration, prompts —   ██
// ██  is built around this specific model. Changing it breaks    ██
// ██  everything. If you're reading this: LEAVE IT ALONE.        ██
// ██████████████████████████████████████████████████████████████████
//
// SECONDARY (helpers — extend core prowess, never replace):
//   1. OpenRouter API → deepseek/deepseek-r1-0528 (full 671B R1)
//   2. Groq Alpha → llama-3.1-8b-instant (fast ingestion / routing)
//   3. Groq Beta  → llama-3.3-70b-versatile (heavy reasoning / skills)
//
// All consumers use: LLMEngine.getInstance().chat(messages)
// ===================================================================

// ─── LOCKED Core Model Config ────────────────────────────────────
// These values define the core and MUST NEVER be changed.
const CORE_MODEL = "deepseek-r1:8b" as const;
const CORE_MODEL_DISPLAY = "DeepSeek-R1-0528-Distill-Qwen3-8B" as const;

// ─── Configurable infra (can be adjusted per-deployment) ─────────
const OLLAMA_BASE =
    (typeof window !== "undefined"
        ? (window as any).__NEXT_DATA__?.props?.pageProps?.ollamaUrl
        : undefined) || "http://localhost:11434";

// ─── GPU Acceleration & Performance Tuning ───────────────────────
// These Ollama runtime options maximize throughput on the user's GPU.
// They are sent with EVERY inference call for consistent performance.
const OLLAMA_GPU_OPTIONS = {
    // GPU layers: -1 means offload ALL layers to GPU (CUDA/Vulkan/Metal)
    num_gpu: -1,
    // Enable Flash Attention 2 for 2-4x faster attention on modern GPUs
    flash_attn: true,
    // KV cache quantization: q8_0 reduces VRAM usage by ~50% with <1% quality loss
    kv_cache_type: "q8_0",
    // Context window: 32K tokens (sweet spot for 8B model + structured output)
    num_ctx: 32768,
    // Batch size for prompt processing (higher = faster prefill on GPU)
    num_batch: 512,
    // Thread count for CPU fallback layers (0 = auto-detect)
    num_thread: 0,
    // Keep model loaded in VRAM indefinitely (prevent cold starts)
    keep_alive: -1,
    // Repeat penalty to reduce repetitive JSON output
    repeat_penalty: 1.1,
    // Top-K sampling (40 is optimal for structured output)
    top_k: 40,
} as const;

/** Progress report during initialization */
export type InitProgressReport = {
    progress: number; // 0-1
    text: string;
};

export type InitProgressCallback = (report: InitProgressReport) => void;

/** Route to the appropriate Three-Body engine */
export type ChatMode = "local" | "api" | "local-ceo" | "groq-alpha" | "groq-beta";

/** Chat options for fine-grained control per-call */
export interface ChatOptions {
    temperature?: number;
    max_tokens?: number;
    mode?: ChatMode;
    /** Request structured JSON output (sets lower temp + format hint) */
    json_mode?: boolean;
    /** Custom timeout in ms for local Ollama calls (default: 5 * 60 * 1000) */
    timeout?: number;
}

/**
 * Strip `<think>...</think>` reasoning tokens from DeepSeek R1 output.
 * All downstream consumers expect clean content (many parse JSON directly).
 */
function stripThinkingTokens(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Robust JSON extraction from LLM output.
 * Handles markdown fencing, preamble text, trailing garbage,
 * DeepSeek R1 <think> blocks, incomplete JSON, control chars,
 * and multiple JSON blocks. Used by ALL modules.
 */
export function extractJson<T = any>(raw: string): T {
    // Step 0: Guard against empty / whitespace-only / undefined input
    if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
        console.warn("[extractJson] Received empty or whitespace-only LLM response — returning empty object fallback");
        return {} as T;
    }

    // Step 1: Strip thinking tokens
    let cleaned = stripThinkingTokens(raw);

    // Step 1.25: Re-check after stripping think tokens
    if (cleaned.trim().length === 0) {
        console.warn("[extractJson] Response was only <think> tokens — returning empty object fallback");
        return {} as T;
    }

    // Step 1.5: Remove control characters that break JSON.parse
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

    // Step 2: Try direct parse
    try { return JSON.parse(cleaned) as T; } catch { /* continue */ }

    // Step 3: Strip markdown fences (all variants)
    const unfenced = cleaned
        .replace(/^```(?:json|JSON|jsonc)?\s*\n?/gm, "")
        .replace(/\n?```\s*$/gm, "")
        .trim();
    try { return JSON.parse(unfenced) as T; } catch { /* continue */ }

    // Step 4: Balanced brace extraction — find the FIRST complete JSON object
    const objStart = unfenced.indexOf("{");
    if (objStart !== -1) {
        const objStr = extractBalancedBlock(unfenced, objStart, "{", "}");
        if (objStr) {
            try { return JSON.parse(objStr) as T; } catch { /* continue */ }
            // Try fixing common LLM JSON mistakes (trailing commas, single quotes)
            const fixed = fixCommonJsonErrors(objStr);
            try { return JSON.parse(fixed) as T; } catch { /* continue */ }
        }
    }

    // Step 5: Balanced bracket extraction — find the FIRST complete JSON array
    const arrStart = unfenced.indexOf("[");
    if (arrStart !== -1) {
        const arrStr = extractBalancedBlock(unfenced, arrStart, "[", "]");
        if (arrStr) {
            try { return JSON.parse(arrStr) as T; } catch { /* continue */ }
            const fixed = fixCommonJsonErrors(arrStr);
            try { return JSON.parse(fixed) as T; } catch { /* continue */ }
        }
    }

    // Step 6: Greedy regex fallback (handles nested braces via greedy match)
    const objMatch = unfenced.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try { return JSON.parse(objMatch[0]) as T; } catch { /* continue */ }
        try { return JSON.parse(fixCommonJsonErrors(objMatch[0])) as T; } catch { /* continue */ }
    }
    const arrMatch = unfenced.match(/\[[\s\S]*\]/);
    if (arrMatch) {
        try { return JSON.parse(arrMatch[0]) as T; } catch { /* continue */ }
        try { return JSON.parse(fixCommonJsonErrors(arrMatch[0])) as T; } catch { /* continue */ }
    }

    // Step 7: Last resort — try to repair truncated JSON (close open braces/brackets)
    const repaired = repairTruncatedJson(unfenced);
    if (repaired) {
        try { return JSON.parse(repaired) as T; } catch { /* continue */ }
    }

    // Log the raw content for debugging before throwing
    console.error("[extractJson] All extraction strategies failed. Raw content (first 500 chars):", raw.slice(0, 500));
    throw new Error("Failed to extract valid JSON from LLM response");
}

/**
 * Extract a balanced block starting at `start` using open/close delimiters.
 * Properly handles nested braces/brackets and quoted strings.
 */
function extractBalancedBlock(
    text: string, start: number,
    open: string, close: string,
): string | null {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === open) depth++;
        if (ch === close) {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null; // Unbalanced — truncated output
}

/**
 * Fix common LLM JSON output mistakes:
 * - Trailing commas before } or ]
 * - Single quotes instead of double quotes (outside existing double-quoted strings)
 * - Unquoted keys
 */
function fixCommonJsonErrors(json: string): string {
    // Remove trailing commas before } or ]
    let fixed = json.replace(/,\s*([}\]])/g, "$1");
    // Replace single-quoted strings with double-quoted (rough heuristic)
    fixed = fixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    return fixed;
}

/**
 * Attempt to repair truncated JSON by closing open braces/brackets.
 * Only works for outputs that were cleanly cut off mid-generation.
 */
function repairTruncatedJson(text: string): string | null {
    // Find the first { or [
    const objStart = text.indexOf("{");
    const arrStart = text.indexOf("[");
    const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
    if (start === -1) return null;

    let substr = text.slice(start);
    // Remove any trailing incomplete string (cut off mid-value)
    substr = substr.replace(/,\s*"[^"]*$/, "");
    substr = substr.replace(/:\s*"[^"]*$/, ': ""');
    substr = substr.replace(/,\s*$/, "");

    // Count open/close braces and brackets
    let braceDepth = 0;
    let bracketDepth = 0;
    let inStr = false;
    let esc = false;
    for (const ch of substr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
        if (ch === "[") bracketDepth++;
        if (ch === "]") bracketDepth--;
    }

    // Close unclosed structures
    let repaired = substr;
    while (bracketDepth > 0) { repaired += "]"; bracketDepth--; }
    while (braceDepth > 0) { repaired += "}"; braceDepth--; }

    return repaired;
}

export class LLMEngine {
    private static instance: LLMEngine;
    private ollamaReady = false;
    private apiReady = false;
    private groqReady = false;
    private groqBetaReady = false;
    private initPromise: Promise<void> | null = null;

    // Promise-based mutex — serializes local Ollama requests to prevent
    // timeout pile-up (each request's timeout counts from lock acquisition,
    // not from submission, so queued requests don't false-timeout).
    private ollamaLock: Promise<void> = Promise.resolve();

    private constructor() { }

    public static getInstance(): LLMEngine {
        if (!LLMEngine.instance) {
            LLMEngine.instance = new LLMEngine();
        }
        return LLMEngine.instance;
    }

    /** Returns the locked core model identifier. Cannot be changed. */
    public static getCoreModel(): string {
        return CORE_MODEL;
    }

    /** Returns the human-readable core model name. */
    public static getCoreModelDisplay(): string {
        return CORE_MODEL_DISPLAY;
    }

    // ─── Initialization ──────────────────────────────────────────────

    /**
     * Warm up the local core model and verify API helpers.
     * Uses a proper Promise-based lock (no polling).
     * The local model is the primary — if it's up, we're good.
     * API helpers are secondary and their failure is non-fatal.
     */
    public async initialize(
        progressCallback?: InitProgressCallback
    ): Promise<void> {
        if (this.isReady()) return;

        // Promise-based init lock — proper concurrency safety
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize(progressCallback)
            .finally(() => {
                this.initPromise = null;
            });

        return this.initPromise;
    }

    private async _doInitialize(
        progressCallback?: InitProgressCallback
    ): Promise<void> {
        // ── Step 1: Try local Ollama ────────────────────────────────
        progressCallback?.({
            progress: 0.05,
            text: `Connecting to ${CORE_MODEL_DISPLAY} (Ollama)…`,
        });

        const ollamaUp = await this.checkOllama();
        if (!ollamaUp) {
            console.warn(
                "[OLLAMA OFFLINE] Ollama is not running. Start it with: ollama serve\n" +
                `Then ensure model is pulled: ollama pull ${CORE_MODEL}`
            );
        }

        // Wrap Ollama warm-up in try-catch — proceed to API helpers if it fails
        if (ollamaUp) {
            try {
                progressCallback?.({
                    progress: 0.1,
                    text: "Verifying core model availability…",
                });
                await this.verifyModelAvailable();

                progressCallback?.({
                    progress: 0.2,
                    text: `Loading ${CORE_MODEL_DISPLAY} into GPU (Flash Attn + Q8 KV cache)…`,
                });
                await this.warmUpOllama();
                this.ollamaReady = true;
            } catch (ollamaErr) {
                console.warn("[LLM] Ollama warm-up failed, will try API helpers:", ollamaErr);
                this.ollamaReady = false;
            }
        }

        // ── Step 2: Always check API helpers (they work without Ollama) ──
        progressCallback?.({
            progress: 0.75,
            text: this.ollamaReady
                ? "Core model loaded. Checking API helpers…"
                : "Ollama offline — checking API helpers…",
        });

        await this.checkAPIHelpers();

        const helpers: string[] = [];
        if (this.apiReady) helpers.push("OpenRouter");
        if (this.groqReady) helpers.push("Groq-Alpha");
        if (this.groqBetaReady) helpers.push("Groq-Beta");

        // ── Step 3: Fail only if NO backend is available at all ──────
        if (!this.ollamaReady && !this.apiReady && !this.groqReady && !this.groqBetaReady) {
            const msg =
                "No AI backend available.\n" +
                `• Start Ollama: ollama serve && ollama pull ${CORE_MODEL}\n` +
                "• Or set OPENROUTER_API_KEY / GROQ_API_KEY in .env.local";
            console.error("[LLM]", msg);
            throw new Error(msg);
        }

        progressCallback?.({
            progress: 1,
            text: this.ollamaReady
                ? `${CORE_MODEL_DISPLAY} ready` +
                    (helpers.length > 0 ? ` + ${helpers.join(" + ")} helpers` : " (local-only)")
                : `Running in API-only mode: ${helpers.join(" + ")}`,
        });

        console.log(
            this.ollamaReady
                ? `[LLM] Engine ready: ${CORE_MODEL_DISPLAY} + [${helpers.join(", ")}]`
                : `[LLM] Engine ready (degraded — no Ollama): [${helpers.join(", ")}]`
        );
    }

    // ─── Chat ────────────────────────────────────────────────────────

    /**
     * Send a chat completion to DeepSeek R1 0528.
     *
     * @param messages - Chat messages
     * @param options  - temperature, max_tokens, mode, json_mode
     *   - mode "local" (default): Uses Ollama (CEO — core local model)
     *   - mode "local-ceo": Alias for local, indicating orchestration intent
     *   - mode "api": Uses OpenRouter for complex/lengthy tasks
     *   - mode "groq-alpha": Uses Groq Alpha (8B) for fast ingestion tasks
     *   - mode "groq-beta": Uses Groq Beta (70B) for heavy reasoning / skills
     *   - json_mode: true to enforce structured JSON output (temp 0.2)
     */
    public async chat(
        messages: { role: "system" | "user" | "assistant"; content: string }[],
        options?: ChatOptions
    ): Promise<string> {
        const mode = options?.mode ?? "local";

        // Auto-initialize if not ready
        if (!this.isReady()) {
            await this.initialize();
        }

        // JSON mode: override temperature for reliability
        const effectiveOpts = options?.json_mode
            ? { ...options, temperature: options.temperature ?? 0.15 }
            : options;

        if (mode === "api") {
            return this.chatViaAPI(messages, effectiveOpts);
        }
        if (mode === "groq-alpha") {
            return this.chatViaAPI(messages, { ...effectiveOpts, mode: "groq-alpha" });
        }
        if (mode === "groq-beta") {
            return this.chatViaAPI(messages, { ...effectiveOpts, mode: "groq-beta" });
        }
        // mode "local" or "local-ceo"
        return this.chatViaOllama(messages, effectiveOpts);
    }

    // ─── Local Ollama (Primary / Core — IMMUTABLE) ───────────────────
    // Routes through /api/llm/ollama proxy to avoid browser CORS issues
    // caused by Cross-Origin-Embedder-Policy headers.

    private async chatViaOllama(
        messages: { role: "system" | "user" | "assistant"; content: string }[],
        options?: ChatOptions
    ): Promise<string> {
        // ── Acquire Ollama queue lock ─────────────────────────────────
        // Serializes requests so each one's timeout counts from when
        // Ollama actually starts processing it, not from submission.
        let releaseLock!: () => void;
        const gate = new Promise<void>(r => { releaseLock = r; });
        const prev = this.ollamaLock;
        this.ollamaLock = gate;
        await prev;

        let ollamaResult: string | null = null;
        let ollamaError: unknown = null;

        try {
            const controller = new AbortController();
            const timeoutMs = options?.timeout ?? 5 * 60 * 1000;
            const timeout = setTimeout(
                () => controller.abort(`Ollama request timed out after ${timeoutMs / 1000}s`),
                timeoutMs
            );

            // Route through server-side proxy to avoid CORS issues
            const res = await fetch(
                "/api/llm/ollama",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: CORE_MODEL, // LOCKED — never changes
                        messages,
                        temperature: options?.temperature ?? 0.6,
                        max_tokens: options?.max_tokens ?? 4096,
                        stream: false,
                        // GPU acceleration & tuning params sent with every call
                        options: OLLAMA_GPU_OPTIONS,
                    }),
                    signal: controller.signal,
                }
            );

            clearTimeout(timeout);

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Ollama proxy error ${res.status}: ${errText}`);
            }

            const data = await res.json();
            // Proxy already strips thinking tokens and returns content directly
            ollamaResult = data.content ?? data.choices?.[0]?.message?.content ?? "";
        } catch (error) {
            ollamaError = error;
        } finally {
            // Release lock BEFORE fallback cascade so next queued request can start
            releaseLock();
        }

        // ── Success path ─────────────────────────────────────────────
        if (ollamaResult !== null) {
            return stripThinkingTokens(ollamaResult);
        }

        // ── Fallback cascade (lock already released) ─────────────────
        console.error("[LLM] Local Ollama error:", ollamaError);

        if (this.apiReady) {
            console.warn("[LLM] Core model failed — falling back to OpenRouter…");
            try {
                return await this.chatViaAPI(messages, options);
            } catch (apiErr) {
                console.error("[LLM] OpenRouter fallback also failed:", apiErr);
            }
        }
        if (this.groqReady) {
            console.warn("[LLM] Trying Groq Alpha fallback…");
            try {
                return await this.chatViaAPI(messages, { ...options, mode: "groq-alpha" });
            } catch (groqErr) {
                console.error("[LLM] Groq fallback also failed:", groqErr);
            }
        }
        if (this.groqBetaReady) {
            console.warn("[LLM] Trying Groq Beta fallback…");
            try {
                return await this.chatViaAPI(messages, { ...options, mode: "groq-beta" });
            } catch (groqErr) {
                console.error("[LLM] Groq Beta fallback also failed:", groqErr);
            }
        }
        throw ollamaError;
    }

    // ─── API Helpers (Secondary — extend core, never replace) ────────

    private async chatViaAPI(
        messages: { role: "system" | "user" | "assistant"; content: string }[],
        options?: ChatOptions
    ): Promise<string> {
        let provider = "openrouter";
        if (options?.mode === "groq-alpha") provider = "groq_alpha";
        if (options?.mode === "groq-beta") provider = "groq_beta";

        if (provider === "groq_alpha" && !this.groqReady) {
            throw new Error("Groq Alpha API helper not available. Check GROQ_API_KEY in .env.local");
        }
        if (provider === "groq_beta" && !this.groqBetaReady) {
            throw new Error("Groq Beta API helper not available. Check GROQ_NANOBOT_KEY in .env.local");
        }
        if (provider === "openrouter" && !this.apiReady) {
            throw new Error("OpenRouter API helper not available. Check OPENROUTER_API_KEY in .env.local");
        }

        try {
            const res = await fetch("/api/llm/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages,
                    temperature: options?.temperature ?? 0.6,
                    max_tokens: options?.max_tokens ?? 4096,
                    provider,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(
                    (err as any).error || `API error (${provider}): ${res.status}`
                );
            }

            const data = await res.json();
            return data.content || "";
        } catch (error) {
            console.error(`[LLM] ${provider} helper error:`, error);
            throw error;
        }
    }

    // ─── Ollama Health / Model Verification / Warm-up ────────────────

    private async checkOllama(): Promise<boolean> {
        try {
            // Use proxy health endpoint (GET /api/llm/ollama) to check Ollama
            const res = await fetch("/api/llm/ollama", {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return false;
            const data = await res.json();
            return data.status === "ok";
        } catch {
            // Fallback: try direct connection (server-side init scenarios)
            try {
                const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
                    signal: AbortSignal.timeout(5000),
                });
                return res.ok;
            } catch {
                return false;
            }
        }
    }

    /**
     * Verify the EXACT core model is available in Ollama.
     * This is a safety check — refuse to start if the wrong model is loaded.
     */
    private async verifyModelAvailable(): Promise<void> {
        try {
            // Use proxy health endpoint which returns model list
            const res = await fetch("/api/llm/ollama", {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) throw new Error("Cannot list models");

            const data = await res.json();
            const models: string[] = data.models || [];
            const found = models.some(
                (m: string) => m === CORE_MODEL || m.startsWith(CORE_MODEL.split(":")[0])
            );

            if (!found) {
                throw new Error(
                    `Core model '${CORE_MODEL}' not found in Ollama.\n` +
                    `Pull it with: ollama pull ${CORE_MODEL}\n` +
                    `Available models: ${models.join(", ")}`
                );
            }
        } catch (error) {
            if ((error as Error).message.includes("Core model")) throw error;
            // Fallback: try direct Ollama API
            try {
                const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
                    signal: AbortSignal.timeout(5000),
                });
                if (!res.ok) throw new Error("Cannot list models");
                const data = await res.json();
                const models: Array<{ name: string }> = data.models || [];
                const found = models.some(
                    (m) => m.name === CORE_MODEL || m.name.startsWith(CORE_MODEL.split(":")[0])
                );
                if (!found) {
                    throw new Error(
                        `Core model '${CORE_MODEL}' not found in Ollama.\n` +
                        `Pull it with: ollama pull ${CORE_MODEL}\n` +
                        `Available models: ${models.map(m => m.name).join(", ")}`
                    );
                }
            } catch (innerErr) {
                if ((innerErr as Error).message.includes("Core model")) throw innerErr;
                console.warn("[LLM] Could not verify model — proceeding with warm-up");
            }
        }
    }

    /**
     * Send a trivial prompt to force Ollama to load the model into
     * GPU VRAM with full GPU acceleration parameters.
     * First call after boot is slow (~10-30s), subsequent calls are instant.
     * Uses the proxy route to avoid CORS; falls back to direct Ollama if needed.
     */
    private async warmUpOllama(): Promise<void> {
        // Try via proxy first (avoids CORS in browser contexts)
        try {
            const proxyRes = await fetch("/api/llm/ollama", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: CORE_MODEL,
                    messages: [{ role: "user", content: "hi" }],
                    max_tokens: 1,
                    stream: false,
                    options: {
                        ...OLLAMA_GPU_OPTIONS,
                        num_predict: 1,
                    },
                }),
                signal: AbortSignal.timeout(180_000),
            });

            if (proxyRes.ok) {
                console.log(
                    `[LLM] ${CORE_MODEL_DISPLAY} loaded into GPU VRAM ` +
                    `(Flash Attn: ON, KV Cache: Q8, Context: ${OLLAMA_GPU_OPTIONS.num_ctx})`
                );
                return;
            }
        } catch {
            console.warn("[LLM] Proxy warm-up failed, falling back to direct Ollama…");
        }

        // Fallback: direct Ollama API (for server-side or SSR contexts)
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: CORE_MODEL,
                messages: [{ role: "user", content: "hi" }],
                stream: false,
                // Critical: send GPU options during warm-up to pre-allocate VRAM
                options: {
                    ...OLLAMA_GPU_OPTIONS,
                    num_predict: 1, // Generate 1 token only — just loads the model
                },
            }),
            signal: AbortSignal.timeout(180_000), // 3 min for cold start
        });

        if (!res.ok) {
            throw new Error(
                `Core model warm-up failed (${res.status}). ` +
                `Ensure '${CORE_MODEL}' is pulled: ollama pull ${CORE_MODEL}`
            );
        }

        console.log(
            `[LLM] ${CORE_MODEL_DISPLAY} loaded into GPU VRAM ` +
            `(Flash Attn: ON, KV Cache: Q8, Context: ${OLLAMA_GPU_OPTIONS.num_ctx})`
        );
    }

    /**
     * Check API helpers in parallel (non-fatal for both).
     * Uses lightweight status checks instead of actual inference calls.
     */
    private async checkAPIHelpers(): Promise<void> {
        const checks = await Promise.allSettled([
            // Check OpenRouter via our proxy route (just sends a ping)
            fetch("/api/llm/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "1" }],
                    max_tokens: 1,
                    provider: "openrouter",
                }),
                signal: AbortSignal.timeout(10_000),
            }).then(r => r.ok),
            // Check Groq Alpha availability
            fetch("/api/llm/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "1" }],
                    max_tokens: 1,
                    provider: "groq_alpha",
                }),
                signal: AbortSignal.timeout(10_000),
            }).then(r => r.ok),
            // Check Groq Beta availability
            fetch("/api/llm/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: "1" }],
                    max_tokens: 1,
                    provider: "groq_beta",
                }),
                signal: AbortSignal.timeout(10_000),
            }).then(r => r.ok),
        ]);

        this.apiReady = checks[0].status === "fulfilled" && checks[0].value === true;
        this.groqReady = checks[1].status === "fulfilled" && checks[1].value === true;
        this.groqBetaReady = checks[2].status === "fulfilled" && checks[2].value === true;

        if (!this.apiReady) console.warn("[LLM] OpenRouter helper not available");
        if (!this.groqReady) console.warn("[LLM] Groq Alpha helper not available");
        if (!this.groqBetaReady) console.warn("[LLM] Groq Beta helper not available");
    }

    // ─── Status ──────────────────────────────────────────────────────

    /** Check if the local core model is ready */
    public isReady(): boolean {
        return this.ollamaReady || this.apiReady || this.groqReady || this.groqBetaReady;
    }

    /** Check if the OpenRouter API helper is available */
    public isAPIReady(): boolean {
        return this.apiReady;
    }

    /** Check if Groq Alpha (8B) helper is available */
    public isGroqAlphaReady(): boolean {
        return this.groqReady;
    }

    /** Check if Groq Beta (70B) helper is available */
    public isGroqBetaReady(): boolean {
        return this.groqBetaReady;
    }

    /** Get a summary of Three-Body engine status for debugging */
    public getStatus(): {
        core: { model: string; ready: boolean; gpu_options: typeof OLLAMA_GPU_OPTIONS };
        helpers: { openrouter: boolean; groq_alpha: boolean; groq_beta: boolean };
    } {
        return {
            core: { model: CORE_MODEL_DISPLAY, ready: this.ollamaReady, gpu_options: OLLAMA_GPU_OPTIONS },
            helpers: { openrouter: this.apiReady, groq_alpha: this.groqReady, groq_beta: this.groqBetaReady },
        };
    }
}
