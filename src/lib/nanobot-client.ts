/**
 * NEXUS Nanobot Client — REST + WebSocket bridge to the Python Neural Engine.
 *
 * This is the SOLE communication layer between Next.js and the Python backend.
 * All consumers use: NanobotClient.getInstance()
 *
 * REST: Health checks, skill listing, one-shot chat
 * WebSocket: Real-time chat with state streaming, skill invocation, reminders
 */

// ── Types ─────────────────────────────────────────────────

export type NanobotState =
    | "idle"
    | "thinking"
    | "tool_calling"
    | "executing"
    | "responding"
    | "error";

export interface NanobotSkill {
    name: string;
    description: string;
    status: string;
    methods: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    }[];
}

export interface NanobotStatus {
    state: NanobotState;
    model: string;
    ollama_connected: boolean;
    groq_connected: boolean;
    alpha_connected: boolean;
    beta_connected: boolean;
    local_model: string;
    cloud_model: string;
    alpha_model: string;
    mode: "three-body" | "ceo-only" | "cloud-only" | "degraded";
    active_skills: string[];
    browser_alive: boolean;
    uptime_seconds: number;
    llm_stats: {
        // Three-Body stats from the orchestrator
        ceo_calls: number;
        alpha_calls: number;
        beta_calls: number;
        delegations: number;
        fallbacks: number;
        fan_outs: number;
        ceo_avg_ms: number;
        alpha_avg_ms: number;
        beta_avg_ms: number;
        ceo_online: boolean;
        alpha_online: boolean;
        beta_online: boolean;
        alpha_stats: {
            total_calls: number;
            avg_latency_ms: number;
            failures: number;
            rate_limits: number;
        };
        beta_stats: {
            total_calls: number;
            avg_latency_ms: number;
            failures: number;
            rate_limits: number;
        };
    };
    router_stats: {
        total_routes: number;
        local_routes: number;
        avg_route_ms: number;
    };
    skills?: NanobotSkill[];
    active_sessions?: number;
}

export interface NanobotChatResponse {
    message: string;
    reasoning: string;
    tools_used: string[];
    state: NanobotState;
    duration_ms: number;
    engine: string; // Three-Body engine: "ceo", "alpha", "beta", "ceo(beta_failed)", "beta(alpha_failed)", "ceo(fallback)", etc.
}

export interface WSMessage {
    type: string;
    [key: string]: any;
}

export type WSEventCallback = (event: WSMessage) => void;

// ── Client ────────────────────────────────────────────────

const ENGINE_URL =
    typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_NANOBOT_URL ?? "http://localhost:7777")
        : "http://localhost:7777";

const WS_URL = ENGINE_URL.replace(/^http/, "ws") + "/ws";

export class NanobotClient {
    private static instance: NanobotClient;

    private ws: WebSocket | null = null;
    private listeners: Map<string, Set<WSEventCallback>> = new Map();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private intentionalClose = false;
    private _connected = false;

    private constructor() {}

    static getInstance(): NanobotClient {
        if (!NanobotClient.instance) {
            NanobotClient.instance = new NanobotClient();
        }
        return NanobotClient.instance;
    }

    // ── Connection State ──────────────────────────────────

    get connected(): boolean {
        return this._connected && this.ws?.readyState === WebSocket.OPEN;
    }

    // ── REST Methods ──────────────────────────────────────

    private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
        const res = await globalThis.fetch(`${ENGINE_URL}${path}`, {
            ...options,
            headers: { "Content-Type": "application/json", ...options?.headers },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Nanobot API ${res.status}: ${body}`);
        }
        return res.json();
    }

    /** Check if the Neural Engine is reachable. */
    async isHealthy(): Promise<boolean> {
        try {
            const res = await this.fetch<{ status: string }>("/api/health");
            return res.status === "ok";
        } catch {
            return false;
        }
    }

    /** Get full engine status (state, skills, model, sessions). */
    async getStatus(): Promise<NanobotStatus> {
        return this.fetch("/api/status");
    }

    /** List all registered skills. */
    async getSkills(): Promise<NanobotSkill[]> {
        const res = await this.fetch<{ skills: NanobotSkill[] }>("/api/skills");
        return res.skills;
    }

    /** One-shot chat (no streaming — good for server actions). */
    async chat(
        message: string,
        sessionId = "default",
        strategy?: string
    ): Promise<NanobotChatResponse> {
        return this.fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({ message, session_id: sessionId, strategy }),
        });
    }

    /** Invoke a skill method directly via REST. */
    async invokeSkill(
        skill: string,
        method: string,
        params: Record<string, any> = {}
    ): Promise<{ success: boolean; data: any; error: string | null }> {
        return this.fetch(`/api/skill/${skill}/${method}`, {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    /** Get conversation history for a session. */
    async getMemory(
        sessionId = "default"
    ): Promise<{ session_id: string; messages: any[] }> {
        return this.fetch(`/api/memory/${sessionId}`);
    }

    /** Clear conversation history for a session. */
    async clearMemory(sessionId = "default"): Promise<void> {
        await this.fetch(`/api/memory/${sessionId}`, { method: "DELETE" });
    }

    // ── WebSocket ─────────────────────────────────────────

    /** Open a persistent WebSocket connection to the engine. */
    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) return;
        this.intentionalClose = false;
        this._tryConnect();
    }

    /** Close the WebSocket connection. */
    disconnect(): void {
        this.intentionalClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._connected = false;
        this._emit({ type: "connection", connected: false });
    }

    /** Subscribe to a specific event type (or "*" for all). */
    on(eventType: string, callback: WSEventCallback): () => void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType)!.add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(eventType)?.delete(callback);
        };
    }

    /** Send a raw JSON message over the WebSocket. */
    send(data: Record<string, any>): void {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            console.warn("[NanobotClient] WebSocket not open, message dropped:", data);
            return;
        }
        this.ws.send(JSON.stringify(data));
    }

    /** Send a chat message via WebSocket (streaming). */
    sendChat(message: string, sessionId = "default"): void {
        this.send({ type: "chat", message, session_id: sessionId });
    }

    /** Request engine status via WebSocket. */
    requestStatus(): void {
        this.send({ type: "status" });
    }

    /** Invoke a skill via WebSocket. */
    sendSkillInvoke(
        skill: string,
        method: string,
        params: Record<string, any> = {}
    ): void {
        this.send({ type: "skill", skill, method, params });
    }

    /** Ping the engine (keep-alive). */
    ping(): void {
        this.send({ type: "ping" });
    }

    // ── Internal ──────────────────────────────────────────

    private _tryConnect(): void {
        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                this._connected = true;
                this.reconnectAttempts = 0;
                console.log("[NanobotClient] WebSocket connected");
                this._emit({ type: "connection", connected: true });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as WSMessage;
                    this._emit(data);
                } catch (e) {
                    console.warn("[NanobotClient] Bad frame:", event.data);
                }
            };

            this.ws.onclose = () => {
                this._connected = false;
                this._emit({ type: "connection", connected: false });

                if (!this.intentionalClose) {
                    this._scheduleReconnect();
                }
            };

            this.ws.onerror = (err) => {
                console.warn("[NanobotClient] WebSocket error:", err);
            };
        } catch (e) {
            console.error("[NanobotClient] Failed to create WebSocket:", e);
            this._scheduleReconnect();
        }
    }

    private _scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn("[NanobotClient] Max reconnect attempts reached");
            this._emit({ type: "reconnect_failed" });
            return;
        }

        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        this.reconnectAttempts++;

        console.log(
            `[NanobotClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
        );

        this.reconnectTimer = setTimeout(() => {
            this._tryConnect();
        }, delay);
    }

    private _emit(event: WSMessage): void {
        // Notify type-specific listeners
        const typeListeners = this.listeners.get(event.type);
        if (typeListeners) {
            for (const cb of typeListeners) {
                try {
                    cb(event);
                } catch (e) {
                    console.error("[NanobotClient] Listener error:", e);
                }
            }
        }

        // Notify wildcard listeners
        const wildcardListeners = this.listeners.get("*");
        if (wildcardListeners) {
            for (const cb of wildcardListeners) {
                try {
                    cb(event);
                } catch (e) {
                    console.error("[NanobotClient] Wildcard listener error:", e);
                }
            }
        }
    }
}
