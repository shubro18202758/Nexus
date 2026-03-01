"use client";

// ===================================================================
// useMessageStore — Autonomous NanoClaw Intelligence Store
//
// AUTONOMOUS-FIRST architecture:
//   1. Student links WhatsApp ONCE (credential manager — QR scan)
//   2. Session persists via LocalAuth (no re-auth needed)
//   3. Autonomous scanner runs continuously in background
//   4. Events auto-detected → auto-pinned to calendar → plans generated
//   5. ZERO manual intervention after initial setup
//
// Store manages:
//   - WhatsApp session lifecycle (one-time QR → persistent)
//   - Autonomous scanner state (running/paused/stats)
//   - Live intelligence feed (auto-detected events stream)
//   - Group classification (academic / non-academic)
//   - Manual NanoClaw filter (secondary/advanced feature)
// ===================================================================

import { create } from "zustand";
import type {
    MsgFilterResult,
    MsgFilterIntent,
    DetectedEvent,
} from "@/lib/msg/msg-filter-engine";

// ── Types ──

export type WAStatus =
    | "disconnected"
    | "qr_pending"
    | "authenticating"
    | "ready"
    | "error";

export type ScannerStatus = "idle" | "running" | "scanning" | "paused" | "error";
export type GroupClassification = "academic" | "non-academic" | "monitored" | "unclassified";

export interface WAMessage {
    id: string;
    from: string;
    chatName: string;
    chatId: string;
    body: string;
    timestamp: number;
    isGroup: boolean;
    authorName: string | null;
    hasMedia: boolean;
    urls: string[];
}

export interface WAGroup {
    id: string;
    name: string;
}

export interface GroupConfig {
    id: string;
    name: string;
    classification: GroupClassification;
    enabled: boolean;
}

export interface WhatsAppSession {
    status: WAStatus;
    qrCode: string | null;
    qrDataUrl: string | null;
    connectedPhone: string | null;
    messageCount: number;
    lastMessageAt: number | null;
    groupCount: number;
    error: string | null;
    uptime: number;
}

export interface ScanResult {
    timestamp: number;
    messagesProcessed: number;
    relevantFound: number;
    eventsDetected: number;
    eventsPinned: number;
    plansGenerated: number;
    events: DetectedEvent[];
    duration: number;
}

export interface ScannerStats {
    status: ScannerStatus;
    totalScans: number;
    totalMessagesProcessed: number;
    totalEventsDetected: number;
    totalEventsPinned: number;
    totalPlansGenerated: number;
    lastScanAt: number | null;
    nextScanAt: number | null;
    scanIntervalMs: number;
    uptime: number;
    startedAt: number | null;
    error: string | null;
    recentScans: ScanResult[];
    autoDetectedEvents: DetectedEvent[];
    groups: GroupConfig[];
}

export interface CreatedEventPlan {
    event: any;
    plan: any | null;
}

// ── Store Shape ──

interface MessageStore {
    // ── Session (Credential Manager) ──
    session: WhatsAppSession;
    isConnecting: boolean;

    // ── Autonomous Scanner ──
    scanner: ScannerStats;
    isStartingScanner: boolean;

    // ── Messages (from live session) ──
    messages: WAMessage[];
    isLoadingMessages: boolean;

    // ── Manual NanoClaw Filter (secondary) ──
    isFiltering: boolean;
    nlPrompt: string;
    filterIntent: MsgFilterIntent | null;
    filterResults: MsgFilterResult[];
    filteredMessages: WAMessage[];
    manualDetectedEvents: DetectedEvent[];

    // ── Plan generation ──
    isPlanning: boolean;
    createdPlans: CreatedEventPlan[];

    // ── UI State (client-side only) ──
    activeTab: "command" | "stream" | "intel";
    messageSearch: string;
    messageSortBy: "time" | "chat" | "sender";
    selectedGroupFilter: string | null;
    bookmarkedIds: string[];
    filterPresets: { name: string; prompt: string }[];
    expandedMessageId: string | null;

    // ── Errors ──
    error: string | null;

    // ── Actions: UI State ──
    setActiveTab: (tab: "command" | "stream" | "intel") => void;
    setMessageSearch: (search: string) => void;
    setMessageSort: (by: "time" | "chat" | "sender") => void;
    setGroupFilter: (groupId: string | null) => void;
    toggleBookmark: (msgId: string) => void;
    saveFilterPreset: (name: string, prompt: string) => void;
    removeFilterPreset: (name: string) => void;
    setExpandedMessage: (id: string | null) => void;

    // ── Actions: Credential Manager (one-time QR) ──
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    refreshStatus: () => Promise<void>;

    // ── Actions: Autonomous Scanner ──
    startAutoScan: (config?: Record<string, any>) => Promise<void>;
    stopAutoScan: () => Promise<void>;
    pauseAutoScan: () => Promise<void>;
    resumeAutoScan: () => Promise<void>;
    forceScan: () => Promise<void>;
    refreshScannerStats: () => Promise<void>;
    classifyGroup: (groupId: string, classification: GroupClassification, enabled?: boolean) => Promise<void>;
    syncGroups: () => Promise<void>;
    clearScanData: () => Promise<void>;

    // ── Actions: Messages ──
    fetchMessages: () => Promise<void>;

    // ── Actions: Manual NanoClaw Filter (secondary) ──
    runNanoClawFilter: (prompt: string) => Promise<void>;
    clearFilter: () => void;

    // ── Actions: Planner (manual trigger for individual events) ──
    createPlansFromEvents: (events?: DetectedEvent[]) => Promise<void>;
    clearPlans: () => void;

    // ── Actions: General ──
    clearError: () => void;
    reset: () => void;

    /** @internal QR polling */
    _pollStatus: () => void;
}

// ── Helpers ──

function parseSessionState(s: any): WhatsAppSession {
    return {
        status: s?.status || "disconnected",
        qrCode: s?.qrCode || null,
        qrDataUrl: s?.qrDataUrl || null,
        connectedPhone: s?.connectedPhone || null,
        messageCount: s?.messageCount || 0,
        lastMessageAt: s?.lastMessageAt || null,
        groupCount: s?.groupCount || 0,
        error: s?.error || null,
        uptime: s?.uptime || 0,
    };
}

function parseScannerStats(s: any): ScannerStats {
    return {
        status: s?.status || "idle",
        totalScans: s?.totalScans || 0,
        totalMessagesProcessed: s?.totalMessagesProcessed || 0,
        totalEventsDetected: s?.totalEventsDetected || 0,
        totalEventsPinned: s?.totalEventsPinned || 0,
        totalPlansGenerated: s?.totalPlansGenerated || 0,
        lastScanAt: s?.lastScanAt || null,
        nextScanAt: s?.nextScanAt || null,
        scanIntervalMs: s?.scanIntervalMs || 300000,
        uptime: s?.uptime || 0,
        startedAt: s?.startedAt || null,
        error: s?.error || null,
        recentScans: s?.recentScans || [],
        autoDetectedEvents: s?.autoDetectedEvents || [],
        groups: s?.groups || [],
    };
}

// ── Defaults ──

const defaultSession: WhatsAppSession = {
    status: "disconnected",
    qrCode: null,
    qrDataUrl: null,
    connectedPhone: null,
    messageCount: 0,
    lastMessageAt: null,
    groupCount: 0,
    error: null,
    uptime: 0,
};

const defaultScanner: ScannerStats = {
    status: "idle",
    totalScans: 0,
    totalMessagesProcessed: 0,
    totalEventsDetected: 0,
    totalEventsPinned: 0,
    totalPlansGenerated: 0,
    lastScanAt: null,
    nextScanAt: null,
    scanIntervalMs: 300000,
    uptime: 0,
    startedAt: null,
    error: null,
    recentScans: [],
    autoDetectedEvents: [],
    groups: [],
};

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _scannerPollTimer: ReturnType<typeof setInterval> | null = null;

// ── Store ────────────────────────────────────────────────────────

export const useMessageStore = create<MessageStore>((set, get) => ({
    session: defaultSession,
    isConnecting: false,
    scanner: defaultScanner,
    isStartingScanner: false,
    messages: [],
    isLoadingMessages: false,
    isFiltering: false,
    nlPrompt: "",
    filterIntent: null,
    filterResults: [],
    filteredMessages: [],
    manualDetectedEvents: [],
    isPlanning: false,
    createdPlans: [],
    activeTab: "command",
    messageSearch: "",
    messageSortBy: "time",
    selectedGroupFilter: null,
    bookmarkedIds: [],
    filterPresets: [
        { name: "Exams & Deadlines", prompt: "upcoming exams, assignment deadlines, submission dates" },
        { name: "Events & Hackathons", prompt: "hackathons, workshops, tech events, competitions, fests" },
        { name: "Placements & Internships", prompt: "placement drives, internship openings, job opportunities, company visits" },
        { name: "Hostel & Campus", prompt: "hostel maintenance, campus facilities, mess, wifi, electricity" },
    ],
    expandedMessageId: null,
    error: null,

    // ═════════════════════════════════════════════════════════════
    // UI STATE ACTIONS (client-side only)
    // ═════════════════════════════════════════════════════════════

    setActiveTab: (tab) => set({ activeTab: tab }),
    setMessageSearch: (search) => set({ messageSearch: search }),
    setMessageSort: (by) => set({ messageSortBy: by }),
    setGroupFilter: (groupId) => set({ selectedGroupFilter: groupId }),
    toggleBookmark: (msgId) => {
        const current = get().bookmarkedIds;
        if (current.includes(msgId)) {
            set({ bookmarkedIds: current.filter((id) => id !== msgId) });
        } else {
            set({ bookmarkedIds: [...current, msgId] });
        }
    },
    saveFilterPreset: (name, prompt) => {
        const current = get().filterPresets;
        if (current.some((p) => p.name === name)) return;
        set({ filterPresets: [...current, { name, prompt }] });
    },
    removeFilterPreset: (name) => {
        set({ filterPresets: get().filterPresets.filter((p) => p.name !== name) });
    },
    setExpandedMessage: (id) => set({ expandedMessageId: id }),

    // ═════════════════════════════════════════════════════════════
    // CREDENTIAL MANAGER — One-time WhatsApp Link
    // ═════════════════════════════════════════════════════════════

    connect: async () => {
        set({ isConnecting: true, error: null });
        try {
            const res = await fetch("/api/whatsapp/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const data = await res.json();

            if (!res.ok) {
                set({
                    error: data.error || "Connection failed",
                    isConnecting: false,
                    session: {
                        ...get().session,
                        status: "error",
                        error: data.error || "Connection failed",
                    },
                });
                return;
            }

            const sesh = parseSessionState(data.state);
            set({ isConnecting: false, session: sesh });

            // Start polling for QR → auth → ready transitions
            get()._pollStatus();
        } catch (err: any) {
            set({
                error: err.message || "Connection failed",
                isConnecting: false,
                session: {
                    ...get().session,
                    status: "error",
                    error: err.message,
                },
            });
        }
    },

    disconnect: async () => {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (_scannerPollTimer) { clearInterval(_scannerPollTimer); _scannerPollTimer = null; }
        try {
            // Stop scanner first
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "stop" }),
            }).catch(() => {});
            // Then disconnect session
            await fetch("/api/whatsapp/connect", { method: "DELETE" });
        } catch {}
        set({
            session: defaultSession,
            scanner: defaultScanner,
            messages: [],
            filteredMessages: [],
            filterResults: [],
            manualDetectedEvents: [],
            createdPlans: [],
            error: null,
        });
    },

    refreshStatus: async () => {
        try {
            const res = await fetch("/api/whatsapp/connect");
            const data = await res.json();
            if (data.state) {
                const sesh = parseSessionState(data.state);
                set({ session: sesh });

                // Auto-start scanner when session becomes ready
                if (sesh.status === "ready") {
                    const { scanner, isStartingScanner } = get();
                    if (scanner.status === "idle" && !isStartingScanner) {
                        console.log("[NEXUS] refreshStatus → session ready, scanner idle → auto-starting");
                        await get().startAutoScan();

                        // Verify after 3s — retry if still idle
                        setTimeout(async () => {
                            await useMessageStore.getState().refreshScannerStats();
                            const ss = useMessageStore.getState();
                            if (ss.session.status === "ready" && ss.scanner.status === "idle" && !ss.isStartingScanner) {
                                console.log("[NEXUS] Scanner STILL idle after auto-start — retry #1");
                                await ss.startAutoScan();
                            }
                        }, 3000);
                    }
                }
            }
        } catch {}
    },

    // ═════════════════════════════════════════════════════════════
    // AUTONOMOUS SCANNER
    // ═════════════════════════════════════════════════════════════

    startAutoScan: async (config?) => {
        set({ isStartingScanner: true, error: null });
        try {
            console.log("[NEXUS] startAutoScan → POST /api/whatsapp/auto-scan { action: start }");
            const res = await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start", config }),
            });
            const data = await res.json();

            if (!res.ok) {
                console.warn("[NEXUS] startAutoScan failed:", data.error);
                set({ error: data.error || "Failed to start scanner", isStartingScanner: false });
                return;
            }

            if (data.stats) {
                console.log("[NEXUS] startAutoScan success → scanner status:", data.stats.status);
                set({ scanner: parseScannerStats(data.stats), isStartingScanner: false });
            } else {
                set({ isStartingScanner: false });
            }
        } catch (err: any) {
            console.error("[NEXUS] startAutoScan exception:", err);
            set({ error: err.message || "Scanner start failed", isStartingScanner: false });
        } finally {
            // Always ensure scanner stats polling runs
            if (!_scannerPollTimer) {
                _scannerPollTimer = setInterval(() => {
                    get().refreshScannerStats();
                }, 10000);
            }
        }
    },

    stopAutoScan: async () => {
        try {
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "stop" }),
            });
            if (_scannerPollTimer) { clearInterval(_scannerPollTimer); _scannerPollTimer = null; }
            set({ scanner: { ...get().scanner, status: "idle" } });
        } catch (err: any) {
            set({ error: err.message || "Failed to stop scanner" });
        }
    },

    pauseAutoScan: async () => {
        try {
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "pause" }),
            });
            set({ scanner: { ...get().scanner, status: "paused" } });
        } catch (err: any) {
            set({ error: err.message || "Failed to pause scanner" });
        }
    },

    resumeAutoScan: async () => {
        try {
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resume" }),
            });
            set({ scanner: { ...get().scanner, status: "running" } });
        } catch (err: any) {
            set({ error: err.message || "Failed to resume scanner" });
        }
    },

    forceScan: async () => {
        try {
            set({ scanner: { ...get().scanner, status: "scanning" } });
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "force-scan" }),
                signal: AbortSignal.timeout(120000),
            });
            await get().refreshScannerStats();
        } catch (err: any) {
            set({ error: err.message || "Force scan failed" });
            await get().refreshScannerStats();
        }
    },

    refreshScannerStats: async () => {
        try {
            const res = await fetch("/api/whatsapp/auto-scan");
            const data = await res.json();
            set({ scanner: parseScannerStats(data) });
        } catch {}
    },

    classifyGroup: async (groupId, classification, enabled = true) => {
        try {
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "classify-group",
                    groupId,
                    classification,
                    enabled,
                }),
            });
            await get().refreshScannerStats();
        } catch (err: any) {
            set({ error: err.message || "Failed to classify group" });
        }
    },

    syncGroups: async () => {
        try {
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "sync-groups" }),
            });
            await get().refreshScannerStats();
        } catch (err: any) {
            set({ error: err.message || "Failed to sync groups" });
        }
    },

    clearScanData: async () => {
        try {
            await fetch("/api/whatsapp/auto-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "clear-data" }),
            });
            await get().refreshScannerStats();
        } catch {}
    },

    // ═════════════════════════════════════════════════════════════
    // MESSAGES
    // ═════════════════════════════════════════════════════════════

    fetchMessages: async () => {
        set({ isLoadingMessages: true, error: null });
        try {
            // Server enforces 24h threshold automatically; pass since for explicit clarity
            const since24h = Date.now() - 24 * 60 * 60 * 1000;
            const res = await fetch(`/api/whatsapp/messages?limit=200&groupOnly=false&since=${since24h}`);
            const data = await res.json();
            if (!res.ok) {
                set({ error: data.error || "Failed to fetch messages", isLoadingMessages: false });
                return;
            }
            set({ messages: data.messages || [], isLoadingMessages: false });
        } catch (err: any) {
            set({ error: err.message || "Fetch failed", isLoadingMessages: false });
        }
    },

    // ═════════════════════════════════════════════════════════════
    // MANUAL NANOCLAW FILTER (secondary / advanced)
    // ═════════════════════════════════════════════════════════════

    runNanoClawFilter: async (prompt: string) => {
        set({ isFiltering: true, nlPrompt: prompt, error: null, filterResults: [], manualDetectedEvents: [] });
        try {
            // Send only the prompt — server fetches messages from session buffer directly
            // This ensures filtering works even when client-side messages are empty
            const res = await fetch("/api/whatsapp/filter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
                signal: AbortSignal.timeout(120000),
            });
            const data = await res.json();
            if (!res.ok) {
                set({ error: data.error || "Filter failed", isFiltering: false });
                return;
            }
            const results: MsgFilterResult[] = data.results || [];
            const detected: DetectedEvent[] = data.detectedEvents || [];
            const intent: MsgFilterIntent | null = data.intent || null;
            // Use server-provided sourceMessages as primary, fallback to client store
            const sourceMessages = data.sourceMessages || get().messages;
            const relevantIds = new Set(results.filter((r) => r.relevant).map((r) => r.msgId));
            const filtered = sourceMessages.filter((m: any) => relevantIds.has(m.id));
            // Also update client-side messages if server provided them and client is empty
            const currentMessages = get().messages;
            const newState: any = {
                filterResults: results,
                filteredMessages: filtered,
                manualDetectedEvents: detected,
                filterIntent: intent,
                isFiltering: false,
            };
            if (currentMessages.length === 0 && sourceMessages.length > 0) {
                newState.messages = sourceMessages;
            }
            set(newState);
        } catch (err: any) {
            set({ error: err.message || "NanoClaw filter failed", isFiltering: false });
        }
    },

    clearFilter: () => set({
        nlPrompt: "",
        filterResults: [],
        filteredMessages: [],
        manualDetectedEvents: [],
        filterIntent: null,
    }),

    // ═════════════════════════════════════════════════════════════
    // PLANNER
    // ═════════════════════════════════════════════════════════════

    createPlansFromEvents: async (eventsOverride?) => {
        const events = eventsOverride || get().manualDetectedEvents;
        if (events.length === 0) return;
        set({ isPlanning: true, error: null });
        try {
            const res = await fetch("/api/whatsapp/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ detectedEvents: events }),
                signal: AbortSignal.timeout(180000),
            });
            const data = await res.json();
            if (!res.ok) {
                set({ error: data.error || "Plan creation failed", isPlanning: false });
                return;
            }
            set({ createdPlans: data.created || [], isPlanning: false });
        } catch (err: any) {
            set({ error: err.message || "Plan creation failed", isPlanning: false });
        }
    },

    clearPlans: () => set({ createdPlans: [] }),

    // ═════════════════════════════════════════════════════════════
    // GENERAL
    // ═════════════════════════════════════════════════════════════

    clearError: () => set({ error: null }),

    reset: () => {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (_scannerPollTimer) { clearInterval(_scannerPollTimer); _scannerPollTimer = null; }
        set({
            session: defaultSession,
            isConnecting: false,
            scanner: defaultScanner,
            isStartingScanner: false,
            messages: [],
            filteredMessages: [],
            isLoadingMessages: false,
            isFiltering: false,
            nlPrompt: "",
            filterIntent: null,
            filterResults: [],
            manualDetectedEvents: [],
            isPlanning: false,
            createdPlans: [],
            activeTab: "command",
            messageSearch: "",
            messageSortBy: "time",
            selectedGroupFilter: null,
            bookmarkedIds: [],
            expandedMessageId: null,
            error: null,
        });
    },

    _pollStatus: () => {
        if (_pollTimer) clearInterval(_pollTimer);
        let attempts = 0;
        const maxAttempts = 60;

        _pollTimer = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch("/api/whatsapp/connect");
                const data = await res.json();
                if (data.state) {
                    const sesh = parseSessionState(data.state);
                    useMessageStore.setState({ session: sesh });

                    if (sesh.status === "ready") {
                        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
                        // AUTO-START AUTONOMOUS SCANNER when session becomes ready
                        const store = useMessageStore.getState();
                        if (store.scanner.status === "idle" && !store.isStartingScanner) {
                            console.log("[NEXUS] _pollStatus → session ready → auto-starting scanner");
                            await store.startAutoScan();

                            // Verify after 3s — retry once if still idle
                            setTimeout(async () => {
                                await useMessageStore.getState().refreshScannerStats();
                                const ss = useMessageStore.getState();
                                if (ss.session.status === "ready" && ss.scanner.status === "idle" && !ss.isStartingScanner) {
                                    console.log("[NEXUS] _pollStatus retry — scanner still idle");
                                    await ss.startAutoScan();
                                }
                            }, 3000);
                        }
                    }
                    // Don't stop polling on "error" — server-side auto-retry
                    // will recover and transition to authenticating/ready.
                    // Only stop if error is permanent (not retrying).
                    if (sesh.status === "error" && sesh.error && !sesh.error.includes("retrying")) {
                        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
                    }
                }
            } catch {}

            if (attempts >= maxAttempts) {
                if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
                useMessageStore.setState({
                    session: {
                        ...useMessageStore.getState().session,
                        status: "error",
                        error: "Connection timed out",
                    },
                });
            }
        }, 3000);
    },
}));
