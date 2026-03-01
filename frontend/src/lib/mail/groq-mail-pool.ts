// ===================================================================
// Groq Mail Key Pool — 3-Nanobot Round-Robin with Rate-Limit Backoff
//
// Manages GROQ_MAIL_KEY_1…3 as a pool of parallel workers for
// advanced NL mail filtering. Each key operates as an independent
// "nanobot" in the Three-Body orchestration system.
//
// Architecture:
//   NANOBOT-MAIL-1  →  Intent extraction (Pass 1)
//   NANOBOT-MAIL-2  →  Classification engine (Pass 2)
//   NANOBOT-MAIL-3  →  Deep analysis / enrichment (Pass 3)
//
// Falls back to main Groq keys when mail keys are exhausted.
// ===================================================================

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Use llama-3.1-8b-instant for speed on mail classification tasks
const MAIL_MODEL = "llama-3.1-8b-instant" as const;

/** Single pool slot */
interface MailPoolSlot {
    key: string;
    label: string;
    role: "intent" | "classify" | "enrich" | "fallback";
    cooldownUntil: number;
    requestCount: number;
    errorCount: number;
    lastError: string | null;
    avgLatencyMs: number;
    _latencySum: number;
    _latencyCount: number;
}

/** Chat message format */
export interface GroqMailMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/** Pool-level state */
let pool: MailPoolSlot[] | null = null;
let roundRobinIdx = 0;

/** Pool telemetry */
const telemetry = {
    totalRequests: 0,
    totalErrors: 0,
    totalRetries: 0,
    totalTimeouts: 0,
    intentRequests: 0,
    classifyRequests: 0,
    enrichRequests: 0,
    avgLatencyMs: 0,
    _latencySum: 0,
    _latencyCount: 0,
};

/** Lazily initialize pool from env — includes fallback to main keys */
function getPool(): MailPoolSlot[] {
    if (pool) return pool;
    pool = [];

    const roles: Array<"intent" | "classify" | "enrich"> = ["intent", "classify", "enrich"];

    // Primary: GROQ_MAIL_KEY_1..3 — each mapped to a nanobot role
    for (let i = 1; i <= 3; i++) {
        const key = process.env[`GROQ_MAIL_KEY_${i}`];
        if (key) {
            pool.push({
                key,
                label: `MAIL${i}`,
                role: roles[i - 1] || "classify",
                cooldownUntil: 0,
                requestCount: 0,
                errorCount: 0,
                lastError: null,
                avgLatencyMs: 0,
                _latencySum: 0,
                _latencyCount: 0,
            });
        }
    }

    // Fallback: Main Groq keys (lower priority)
    const fallbackKeys = [
        { env: "GROQ_API_KEY", label: "FB-ALPHA" },
        { env: "GROQ_NANOBOT_KEY", label: "FB-BETA" },
        { env: "GROQ_INGESTION_KEY", label: "FB-INGEST" },
    ];
    for (const { env, label } of fallbackKeys) {
        const key = process.env[env];
        if (key && !pool.some(s => s.key === key)) {
            pool.push({
                key,
                label,
                role: "fallback",
                cooldownUntil: 0,
                requestCount: 0,
                errorCount: 0,
                lastError: null,
                avgLatencyMs: 0,
                _latencySum: 0,
                _latencyCount: 0,
            });
        }
    }

    if (pool.length === 0) {
        console.warn("[MailPool] No GROQ_MAIL_KEY_* or fallback keys found — mail filter will use local Ollama only");
        return pool;
    }

    console.log(`[MailPool] Initialized with ${pool.length} nanobots (${pool.map(s => `${s.label}:${s.role}`).join(", ")})`);
    return pool;
}

/** Pick slot by preferred role, falling back to round-robin */
function pickSlot(preferredRole?: "intent" | "classify" | "enrich"): MailPoolSlot | null {
    const slots = getPool();
    if (slots.length === 0) return null;
    const now = Date.now();

    // Pass 1: Prefer slot with matching role that's ready
    if (preferredRole) {
        const roleSlots = slots.filter(s => s.role === preferredRole && s.cooldownUntil <= now);
        if (roleSlots.length > 0) return roleSlots[0];
    }

    // Pass 2: Round-robin among any ready slots
    for (let i = 0; i < slots.length; i++) {
        const idx = (roundRobinIdx + i) % slots.length;
        if (slots[idx].cooldownUntil <= now) {
            roundRobinIdx = (idx + 1) % slots.length;
            return slots[idx];
        }
    }

    // Pass 3: All rate-limited — pick earliest cooldown
    const earliest = slots.reduce((a, b) =>
        a.cooldownUntil < b.cooldownUntil ? a : b,
    );
    return earliest;
}

/** Mark a slot as rate-limited */
function cooldownSlot(slot: MailPoolSlot, ms: number = 60_000) {
    slot.cooldownUntil = Date.now() + ms;
    slot.errorCount++;
    console.warn(`[MailPool] ${slot.label} rate-limited, cooldown ${ms}ms (errors: ${slot.errorCount})`);
}

/**
 * Send a chat completion to Groq using a pooled mail key.
 * Retries on 429 with automatic key rotation.
 * 
 * @param preferredRole - Hint for which nanobot to use (intent/classify/enrich)
 */
export async function groqMailChat(
    messages: GroqMailMessage[],
    opts: {
        temperature?: number;
        max_tokens?: number;
        json_mode?: boolean;
        timeout?: number;
        signal?: AbortSignal;
        preferredRole?: "intent" | "classify" | "enrich";
    } = {},
): Promise<string> {
    const {
        temperature = 0.15,
        max_tokens = 4096,
        json_mode = true,
        timeout = 30_000,
        signal,
        preferredRole,
    } = opts;
    const maxRetries = 4;

    if (signal?.aborted) throw new Error("Request cancelled");

    // Check if pool is available
    const testSlot = pickSlot(preferredRole);
    if (!testSlot) {
        throw new Error("[MailPool] No keys available — use local Ollama fallback");
    }

    const t0 = Date.now();
    telemetry.totalRequests++;
    if (preferredRole === "intent") telemetry.intentRequests++;
    else if (preferredRole === "classify") telemetry.classifyRequests++;
    else if (preferredRole === "enrich") telemetry.enrichRequests++;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const slot = pickSlot(preferredRole);
        if (!slot) throw new Error("[MailPool] No keys available");

        // Wait for cooldown if needed
        const waitMs = slot.cooldownUntil - Date.now();
        if (waitMs > 0) {
            const waitTime = Math.min(waitMs, 8000);
            console.log(`[MailPool] Waiting ${waitTime}ms for ${slot.label} cooldown...`);
            await new Promise(r => setTimeout(r, waitTime));
        }

        // Combine timeout + external signal
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const onExternalAbort = () => controller.abort();
        signal?.addEventListener("abort", onExternalAbort, { once: true });

        try {
            const body: Record<string, unknown> = {
                model: MAIL_MODEL,
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
                slot._latencySum += latency;
                slot._latencyCount++;
                slot.avgLatencyMs = Math.round(slot._latencySum / slot._latencyCount);
                telemetry._latencySum += latency;
                telemetry._latencyCount++;
                telemetry.avgLatencyMs = Math.round(telemetry._latencySum / telemetry._latencyCount);

                return content;
            }

            if (res.status === 429) {
                const retryAfter = Number.parseInt(res.headers.get("retry-after") || "60", 10);
                cooldownSlot(slot, retryAfter * 1000);
                telemetry.totalRetries++;
                continue;
            }

            if (res.status === 503 || res.status === 502) {
                cooldownSlot(slot, 10_000);
                telemetry.totalRetries++;
                continue;
            }

            const errText = await res.text().catch(() => "unknown");
            slot.lastError = `${res.status}: ${errText.slice(0, 200)}`;
            console.error(`[MailPool] ${slot.label} error ${res.status}:`, errText.slice(0, 500));
            telemetry.totalErrors++;
            if (attempt < maxRetries - 1) continue;
            throw new Error(`Groq Mail API error ${res.status}: ${errText.slice(0, 200)}`);
        } catch (err: any) {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onExternalAbort);

            if (err.name === "AbortError") {
                if (signal?.aborted) throw new Error("Request cancelled by user");
                console.warn(`[MailPool] ${slot.label} timed out (attempt ${attempt + 1})`);
                telemetry.totalTimeouts++;
                if (attempt < maxRetries - 1) continue;
                throw new Error("Groq Mail request timed out after all retries");
            }

            if (err.message?.includes("fetch") || err.code === "ECONNREFUSED") {
                cooldownSlot(slot, 15_000);
                telemetry.totalErrors++;
                if (attempt < maxRetries - 1) continue;
            }
            throw err;
        }
    }

    throw new Error("[MailPool] All retries exhausted");
}

/**
 * Execute N chat completions in parallel across the mail pool.
 * Uses Promise.allSettled — failed tasks return empty string.
 */
export async function groqMailParallel(
    tasks: {
        messages: GroqMailMessage[];
        opts?: Parameters<typeof groqMailChat>[1];
    }[],
    opts?: { signal?: AbortSignal },
): Promise<string[]> {
    const results = await Promise.allSettled(
        tasks.map(t =>
            groqMailChat(t.messages, { ...t.opts, signal: opts?.signal }),
        ),
    );

    return results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.warn(`[MailPool] Parallel task ${i} failed:`, r.reason?.message);
        return "";
    });
}

/** Check if the mail pool has any available keys */
export function isMailPoolAvailable(): boolean {
    try {
        const slots = getPool();
        return slots.length > 0;
    } catch {
        return false;
    }
}

/** Pool status for monitoring */
export function getMailPoolStatus() {
    const slots = getPool();
    const now = Date.now();
    return {
        available: slots.length > 0,
        slots: slots.map(s => ({
            label: s.label,
            role: s.role,
            ready: s.cooldownUntil <= now,
            requests: s.requestCount,
            errors: s.errorCount,
            avgLatencyMs: s.avgLatencyMs,
            lastError: s.lastError,
            cooldownRemaining: Math.max(0, s.cooldownUntil - now),
        })),
        telemetry: {
            ...telemetry,
            _latencySum: undefined,
            _latencyCount: undefined,
        },
    };
}
