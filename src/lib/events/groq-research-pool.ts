// ===================================================================
// Groq Research Key Pool — 5-Agent Round-Robin with Rate-Limit Backoff
//
// Manages GROQ_RESEARCH_KEY_1…5 as a pool of parallel workers.
// Each key can handle ~30 RPM on the free tier; the pool gives ~150 RPM.
// Automatically backs off keys that hit rate limits.
// Falls back to main Groq keys when research keys are exhausted.
// ===================================================================

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const RESEARCH_MODEL = "llama-3.1-8b-instant"; // Fast, good at extraction

/** Single pool slot */
interface PoolSlot {
    key: string;
    label: string;
    cooldownUntil: number; // timestamp — 0 = ready
    requestCount: number;
    errorCount: number;
    lastError: string | null;
}

/** Chat message format */
export interface GroqMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/** Pool-level state */
let pool: PoolSlot[] | null = null;
let roundRobinIdx = 0;

/** Pool telemetry */
const telemetry = {
    totalRequests: 0,
    totalErrors: 0,
    totalRetries: 0,
    totalTimeouts: 0,
    avg_latency_ms: 0,
    _latencySum: 0,
    _latencyCount: 0,
};

/** Lazily initialize pool from env — includes fallback to main keys */
function getPool(): PoolSlot[] {
    if (pool) return pool;
    pool = [];

    // Primary: GROQ_RESEARCH_KEY_1..5
    for (let i = 1; i <= 5; i++) {
        const key = process.env[`GROQ_RESEARCH_KEY_${i}`];
        if (key) {
            pool.push({
                key,
                label: `LOGS${i}`,
                cooldownUntil: 0,
                requestCount: 0,
                errorCount: 0,
                lastError: null,
            });
        }
    }

    // Fallback: Main Groq keys (lower priority, but better than nothing)
    const fallbackKeys = [
        { env: "GROQ_API_KEY", label: "MAIN" },
        { env: "GROQ_NANOBOT_KEY", label: "NANO" },
        { env: "GROQ_INGESTION_KEY", label: "INGEST" },
    ];
    for (const { env, label } of fallbackKeys) {
        const key = process.env[env];
        if (key && !pool.some(s => s.key === key)) {
            pool.push({
                key,
                label: `FB-${label}`,
                cooldownUntil: 0,
                requestCount: 0,
                errorCount: 0,
                lastError: null,
            });
        }
    }

    if (pool.length === 0) {
        throw new Error("[GroqPool] No GROQ_RESEARCH_KEY_* or fallback keys found in env");
    }
    console.log(`[GroqPool] Initialized with ${pool.length} keys (${pool.map(s => s.label).join(", ")})`);
    return pool;
}

/** Pick next available slot (round-robin, skip cooled-down) */
function pickSlot(): PoolSlot {
    const slots = getPool();
    const now = Date.now();

    // Pass 1: round-robin among ready slots
    for (let i = 0; i < slots.length; i++) {
        const idx = (roundRobinIdx + i) % slots.length;
        if (slots[idx].cooldownUntil <= now) {
            roundRobinIdx = (idx + 1) % slots.length;
            return slots[idx];
        }
    }

    // Pass 2: all rate-limited → pick earliest cooldown
    const earliest = slots.reduce((a, b) =>
        a.cooldownUntil < b.cooldownUntil ? a : b,
    );
    return earliest;
}

/** Mark a slot as rate-limited for `ms` milliseconds */
function cooldownSlot(slot: PoolSlot, ms: number = 60_000) {
    slot.cooldownUntil = Date.now() + ms;
    slot.errorCount++;
    console.warn(`[GroqPool] ${slot.label} rate-limited, cooldown ${ms}ms (errors: ${slot.errorCount})`);
}

/**
 * Send a chat completion to Groq using a pooled key.
 * Retries on 429 with automatic key rotation.
 * Supports external AbortSignal for cancellation.
 */
export async function groqPoolChat(
    messages: GroqMessage[],
    opts: {
        temperature?: number;
        max_tokens?: number;
        json_mode?: boolean;
        timeout?: number;
        signal?: AbortSignal;
    } = {},
): Promise<string> {
    const { temperature = 0.3, max_tokens = 4096, json_mode = false, timeout = 30_000, signal } = opts;
    const maxRetries = 4; // Bumped from 3 → 4 for more resilience

    // Check if already cancelled
    if (signal?.aborted) throw new Error("Request cancelled");

    const t0 = Date.now();
    telemetry.totalRequests++;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const slot = pickSlot();

        // Wait for cooldown if needed
        const waitMs = slot.cooldownUntil - Date.now();
        if (waitMs > 0) {
            const waitTime = Math.min(waitMs, 8000);
            console.log(`[GroqPool] Waiting ${waitTime}ms for ${slot.label} cooldown...`);
            await new Promise(r => setTimeout(r, waitTime));
        }

        // Combine timeout + external signal
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const onExternalAbort = () => controller.abort();
        signal?.addEventListener("abort", onExternalAbort, { once: true });

        try {
            const body: Record<string, unknown> = {
                model: RESEARCH_MODEL,
                messages,
                temperature,
                max_tokens,
            };
            if (json_mode) {
                body.response_format = { type: "json_object" };
            }

            const res = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${slot.key}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timer);
            signal?.removeEventListener("abort", onExternalAbort);
            slot.requestCount++;

            if (res.ok) {
                const data = await res.json();
                const content = (data.choices?.[0]?.message?.content || "").trim();
                // Track latency
                const latency = Date.now() - t0;
                telemetry._latencySum += latency;
                telemetry._latencyCount++;
                telemetry.avg_latency_ms = Math.round(telemetry._latencySum / telemetry._latencyCount);
                return content;
            }

            if (res.status === 429) {
                const retryAfter = Number.parseInt(res.headers.get("retry-after") || "60", 10);
                cooldownSlot(slot, retryAfter * 1000);
                telemetry.totalRetries++;
                continue; // Try next key
            }

            if (res.status === 503 || res.status === 502) {
                // Service unavailable — short cooldown and retry
                cooldownSlot(slot, 10_000);
                telemetry.totalRetries++;
                continue;
            }

            // Other error — log and retry
            const errText = await res.text().catch(() => "unknown");
            slot.lastError = `${res.status}: ${errText.slice(0, 200)}`;
            console.error(`[GroqPool] ${slot.label} error ${res.status}:`, errText.slice(0, 500));
            telemetry.totalErrors++;
            if (attempt < maxRetries - 1) continue;
            throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`);
        } catch (err: any) {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onExternalAbort);

            if (err.name === "AbortError") {
                if (signal?.aborted) {
                    throw new Error("Request cancelled by user");
                }
                console.warn(`[GroqPool] ${slot.label} timed out (attempt ${attempt + 1})`);
                telemetry.totalTimeouts++;
                if (attempt < maxRetries - 1) continue;
                throw new Error("Groq request timed out after all retries");
            }

            // Network errors — cooldown this slot and try another
            if (err.message?.includes("fetch") || err.code === "ECONNREFUSED") {
                cooldownSlot(slot, 15_000);
                telemetry.totalErrors++;
                if (attempt < maxRetries - 1) continue;
            }
            throw err;
        }
    }

    throw new Error("[GroqPool] All retries exhausted");
}

/**
 * Execute N chat completions in parallel across the pool.
 * Uses Promise.allSettled for resilience — failed tasks return empty string.
 */
export async function groqPoolParallel(
    tasks: {
        messages: GroqMessage[];
        opts?: Parameters<typeof groqPoolChat>[1];
    }[],
    opts?: { signal?: AbortSignal },
): Promise<string[]> {
    const results = await Promise.allSettled(
        tasks.map(t =>
            groqPoolChat(t.messages, { ...t.opts, signal: opts?.signal }),
        ),
    );

    return results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.warn(`[GroqPool] Parallel task ${i} failed:`, r.reason?.message);
        return "";
    });
}

/** Pool status for monitoring */
export function getPoolStatus() {
    const slots = getPool();
    const now = Date.now();
    return {
        slots: slots.map(s => ({
            label: s.label,
            ready: s.cooldownUntil <= now,
            requests: s.requestCount,
            errors: s.errorCount,
            lastError: s.lastError,
            cooldownRemaining: Math.max(0, s.cooldownUntil - now),
        })),
        telemetry: { ...telemetry, _latencySum: undefined, _latencyCount: undefined },
    };
}

/**
 * Health check — verify at least one key can reach Groq.
 * Call this at startup or before a big research session.
 */
export async function groqPoolHealthCheck(): Promise<{ healthy: boolean; availableKeys: number; details: string }> {
    const slots = getPool();
    const now = Date.now();
    const readySlots = slots.filter(s => s.cooldownUntil <= now);

    if (readySlots.length === 0) {
        return { healthy: false, availableKeys: 0, details: "All keys in cooldown" };
    }

    // Quick ping with a tiny request
    try {
        const testResult = await groqPoolChat(
            [{ role: "user", content: "Reply with just: ok" }],
            { max_tokens: 5, timeout: 10_000 },
        );
        return {
            healthy: testResult.length > 0,
            availableKeys: readySlots.length,
            details: `${readySlots.length}/${slots.length} keys ready`,
        };
    } catch (err: any) {
        return { healthy: false, availableKeys: readySlots.length, details: err.message };
    }
}
