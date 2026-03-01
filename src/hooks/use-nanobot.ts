/**
 * useNanobot — React hook for the Python Neural Engine.
 *
 * Provides:
 *  - Persistent WebSocket connection with auto-reconnect
 *  - Real-time agent state (thinking → tool_calling → responding)
 *  - Chat message dispatch via WebSocket (streaming events)
 *  - Skill listing and direct invocation
 *  - Connection health monitoring
 *
 * Usage:
 *   const { connected, state, chat, skills } = useNanobot();
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    NanobotClient,
    type NanobotState,
    type NanobotSkill,
    type NanobotChatResponse,
    type WSMessage,
} from "@/lib/nanobot-client";

// ── Types ─────────────────────────────────────────────────

export interface NanobotMessage {
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    thinking?: string | null;
    toolsUsed?: string[];
    timestamp: number;
}

export interface UseNanobotResult {
    /** WebSocket connection status. */
    connected: boolean;
    /** Current agent state (idle, thinking, tool_calling, etc.). */
    state: NanobotState;
    /** Chat messages in current session. */
    messages: NanobotMessage[];
    /** Whether the engine is available (health check passed). */
    available: boolean;
    /** Loaded skills list. */
    skills: NanobotSkill[];
    /** Send a chat message. Returns when response received. */
    sendMessage: (content: string) => Promise<void>;
    /** Invoke a skill method directly. */
    invokeSkill: (
        skill: string,
        method: string,
        params?: Record<string, any>
    ) => Promise<any>;
    /** Clear conversation history. */
    clearHistory: () => void;
    /** Currently active thought/status text. */
    currentThought: string;
    /** Session ID. */
    sessionId: string;
}

// ── Hook ──────────────────────────────────────────────────

export function useNanobot(sessionId: string = "nexus-main"): UseNanobotResult {
    const [connected, setConnected] = useState(false);
    const [available, setAvailable] = useState(false);
    const [state, setState] = useState<NanobotState>("idle");
    const [messages, setMessages] = useState<NanobotMessage[]>([]);
    const [skills, setSkills] = useState<NanobotSkill[]>([]);
    const [currentThought, setCurrentThought] = useState("");

    const clientRef = useRef<NanobotClient | null>(null);
    const pendingResolveRef = useRef<(() => void) | null>(null);

    // ── Initialize & Connect ──────────────────────────────

    useEffect(() => {
        const client = NanobotClient.getInstance();
        clientRef.current = client;

        // Health check then connect
        client.isHealthy().then((ok) => {
            setAvailable(ok);
            if (ok) {
                client.connect();
                // Fetch skills list
                client.getSkills().then(setSkills).catch(console.warn);
            }
        });

        // ── Event Subscriptions ───────────────────────────

        const unsubs: (() => void)[] = [];

        unsubs.push(
            client.on("connection", (e) => {
                setConnected(e.connected);
                if (!e.connected) {
                    setState("idle");
                    setCurrentThought("");
                }
            })
        );

        unsubs.push(
            client.on("state_change", (e) => {
                const newState = e.state as NanobotState;
                setState(newState);

                // Map state to human-readable thought
                const thoughts: Record<string, string> = {
                    thinking: "Nanobot is reasoning...",
                    tool_calling: "Routing to skill...",
                    executing: "Executing skill...",
                    responding: "Composing response...",
                    idle: "",
                };
                setCurrentThought(thoughts[newState] ?? "");
            })
        );

        unsubs.push(
            client.on("tool_call", (e) => {
                setState("executing");
                setCurrentThought(`Using ${e.skill}.${e.method}...`);

                // Inject tool call message
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "system",
                        content: `🔧 Calling **${e.skill}**.**${e.method}**(${JSON.stringify(e.params ?? {}).slice(0, 100)})`,
                        timestamp: Date.now(),
                    },
                ]);
            })
        );

        unsubs.push(
            client.on("tool_result", (e) => {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "tool",
                        content: e.success
                            ? `✅ ${e.skill}.${e.method} succeeded`
                            : `❌ ${e.skill}.${e.method} failed: ${e.error}`,
                        timestamp: Date.now(),
                    },
                ]);
            })
        );

        unsubs.push(
            client.on("response", (e) => {
                setState("idle");
                setCurrentThought("");

                setMessages((prev) => [
                    ...prev,
                    {
                        role: "assistant",
                        content: e.content,
                        thinking: e.thinking,
                        toolsUsed: e.tools_used,
                        timestamp: Date.now(),
                    },
                ]);

                // Resolve pending chat promise
                if (pendingResolveRef.current) {
                    pendingResolveRef.current();
                    pendingResolveRef.current = null;
                }
            })
        );

        unsubs.push(
            client.on("error", (e) => {
                setState("error");
                setCurrentThought(`Error: ${e.message}`);

                setMessages((prev) => [
                    ...prev,
                    {
                        role: "system",
                        content: `⚠️ Engine error: ${e.message}`,
                        timestamp: Date.now(),
                    },
                ]);

                // Resolve pending chat promise (don't leave it hanging)
                if (pendingResolveRef.current) {
                    pendingResolveRef.current();
                    pendingResolveRef.current = null;
                }
            })
        );

        unsubs.push(
            client.on("skill_result", (e) => {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "tool",
                        content: e.success
                            ? `✅ Skill result: ${JSON.stringify(e.data).slice(0, 200)}`
                            : `❌ Skill error: ${e.error}`,
                        timestamp: Date.now(),
                    },
                ]);
            })
        );

        unsubs.push(
            client.on("reminder_fired", (e) => {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "system",
                        content: `⏰ **Reminder**: ${e.reminder?.title ?? "Untitled"} — ${e.reminder?.message ?? ""}`,
                        timestamp: Date.now(),
                    },
                ]);
            })
        );

        // Periodic health check (reconnect if engine comes online later)
        const healthInterval = setInterval(async () => {
            const ok = await client.isHealthy();
            setAvailable(ok);
            if (ok && !client.connected) {
                client.connect();
                client.getSkills().then(setSkills).catch(() => {});
            }
        }, 15000);

        return () => {
            unsubs.forEach((u) => u());
            clearInterval(healthInterval);
            // Don't disconnect — singleton may be used elsewhere
        };
    }, []);

    // ── Actions ───────────────────────────────────────────

    const sendMessage = useCallback(
        async (content: string) => {
            if (!clientRef.current?.connected) {
                // Fallback to REST
                try {
                    setMessages((prev) => [
                        ...prev,
                        { role: "user", content, timestamp: Date.now() },
                    ]);
                    setState("thinking");
                    setCurrentThought("Nanobot is reasoning (REST fallback)...");

                    const response = await NanobotClient.getInstance().chat(
                        content,
                        sessionId
                    );

                    setState("idle");
                    setCurrentThought("");

                    setMessages((prev) => [
                        ...prev,
                        {
                            role: "assistant",
                            content: response.message,
                            thinking: response.reasoning,
                            toolsUsed: response.tools_used,
                            timestamp: Date.now(),
                        },
                    ]);
                    return;
                } catch (e) {
                    setState("error");
                    setCurrentThought("Engine offline");
                    throw e;
                }
            }

            // WebSocket path (real-time events)
            setMessages((prev) => [
                ...prev,
                { role: "user", content, timestamp: Date.now() },
            ]);

            return new Promise<void>((resolve) => {
                pendingResolveRef.current = resolve;
                clientRef.current!.sendChat(content, sessionId);

                // Safety timeout (60s — some research queries take long)
                setTimeout(() => {
                    if (pendingResolveRef.current === resolve) {
                        pendingResolveRef.current = null;
                        setState("idle");
                        setCurrentThought("");
                        resolve();
                    }
                }, 60000);
            });
        },
        [sessionId]
    );

    const invokeSkill = useCallback(
        async (
            skill: string,
            method: string,
            params: Record<string, any> = {}
        ) => {
            if (clientRef.current?.connected) {
                clientRef.current.sendSkillInvoke(skill, method, params);
                return;
            }
            // REST fallback
            return NanobotClient.getInstance().invokeSkill(skill, method, params);
        },
        []
    );

    const clearHistory = useCallback(() => {
        setMessages([]);
        NanobotClient.getInstance()
            .clearMemory(sessionId)
            .catch(console.warn);
    }, [sessionId]);

    return {
        connected,
        available,
        state,
        messages,
        skills,
        sendMessage,
        invokeSkill,
        clearHistory,
        currentThought,
        sessionId,
    };
}
