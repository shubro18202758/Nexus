// ===================================================================
// Autonomous NanoClaw Scanner — Self-Operating Intelligence Daemon
//
// Once the student links WhatsApp (one-time QR), this daemon:
//   1. Listens to EVERY incoming message in real-time
//   2. Batches messages and runs NanoClaw 5-pass AI filter
//   3. Auto-detects academic events, deadlines, hackathons, etc.
//   4. Auto-creates events in DB → auto-pins to calendar
//   5. Auto-generates adaptive preparation plans
//   6. ZERO manual intervention after initial credential setup
//
// Architecture:
//   - Singleton pattern (one scanner per server process)
//   - Real-time mode: processes on every N messages or T seconds
//   - Periodic sweep: full re-scan every configurable interval
//   - Group classification: academic / non-academic / monitored
//   - Dedup: never processes the same message twice
//   - Auto-start when wa-session emits "ready"
// ===================================================================

import { EventEmitter } from "events";
import { getWASession, type WAMessage } from "@/lib/msg/wa-session";
import { classifyMessagesWithNL } from "@/lib/msg/msg-filter-engine";
import type { DetectedEvent, MsgFilterResult } from "@/lib/msg/msg-filter-engine";

// ─── Types ───────────────────────────────────────────────────────

export type ScannerStatus = "idle" | "running" | "scanning" | "paused" | "error";

export type GroupClassification = "academic" | "non-academic" | "monitored" | "unclassified";

export interface GroupConfig {
    id: string;
    name: string;
    classification: GroupClassification;
    /** Whether auto-scan should process this group */
    enabled: boolean;
}

export interface ScanResult {
    timestamp: number;
    messagesProcessed: number;
    relevantFound: number;
    eventsDetected: number;
    eventsPinned: number;
    plansGenerated: number;
    /** Detected events from this scan */
    events: DetectedEvent[];
    /** Duration in ms */
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
    realtimeBatchSize: number;
    realtimeBatchWindowMs: number;
    uptime: number;
    startedAt: number | null;
    error: string | null;
    /** Last N scan results for the feed */
    recentScans: ScanResult[];
    /** All auto-detected events (rolling buffer) */
    autoDetectedEvents: DetectedEvent[];
    /** Group configurations */
    groups: GroupConfig[];
}

export interface ScannerConfig {
    /** Interval between periodic full scans (ms). Default 5 min */
    scanIntervalMs?: number;
    /** Number of real-time messages to batch before triggering filter. Default 10 */
    realtimeBatchSize?: number;
    /** Max wait time (ms) before flushing a partial real-time batch. Default 30s */
    realtimeBatchWindowMs?: number;
    /** Whether to auto-create events in DB. Default true */
    autoCreateEvents?: boolean;
    /** Whether to auto-generate adaptive plans. Default true */
    autoGeneratePlans?: boolean;
    /** NL prompt for autonomous scanning — comprehensive IIT student context */
    scanPrompt?: string;
}

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_SCAN_INTERVAL = 2 * 60 * 1000;  // 2 minutes (more responsive)
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_WINDOW = 30 * 1000;  // 30 seconds
const MAX_RECENT_SCANS = 50;
const MAX_AUTO_EVENTS = 200;
const MAX_PROCESSED_IDS = 10000;

/** Comprehensive autonomous scan prompt — covers ALL student life categories */
const AUTONOMOUS_SCAN_PROMPT = `Detect ALL relevant messages for an IIT Bombay student. Look for:

1. EXAMS & ACADEMICS: midsem, endsem, quiz dates, assignment deadlines, course registration, grading announcements, syllabus changes, timetable updates, lecture cancellations, tutorial schedules
2. PLACEMENTS & INTERNSHIPS: company visits, PPO offers, shortlists, interview schedules, CPI cutoffs, placement cell notices, resume deadlines, Day 1/2 updates
3. HACKATHONS & COMPETITIONS: registration links, deadlines, team formation, venues, prizes, coding contests, CTFs, case competitions, ideathons
4. WORKSHOPS & TECH: technical talks, seminars, guest lectures, hands-on sessions, training programs, certification courses
5. CLUBS & EVENTS: Techfest, Mood Indigo, cultural events, sports events, club recruitments, E-Cell activities, elections, meetings
6. SCHOLARSHIPS & FINANCIAL: scholarship announcements, stipend updates, fee deadlines, financial aid
7. HOSTEL & CAMPUS: room allocation, mess menu changes, maintenance notices, warden announcements, facility bookings
8. ADMINISTRATIVE: ID cards, certificates, NOC, transcripts, official notices, policy changes, registration deadlines
9. RESEARCH: conference deadlines, paper submissions, lab schedules, thesis deadlines, RA/TA positions, project presentations
10. NETWORKING: alumni events, mentorship programs, industry connects, career fairs

Mark ALL announcements, deadlines, registrations, and scheduled events. Be thorough — missing an event is worse than a false positive. Extract dates, venues, and registration links.`;

// ─── globalThis key for HMR-safe singleton ──────────────────────
const GLOBAL_SCANNER_KEY = "__nexus_auto_scanner__";
const globalStore = globalThis as unknown as Record<string, any>;

// ─── Scanner Daemon ─────────────────────────────────────────────

class AutonomousScanner extends EventEmitter {
    private _status: ScannerStatus = "idle";
    private _error: string | null = null;
    private _startedAt: number | null = null;

    // Config
    private scanIntervalMs = DEFAULT_SCAN_INTERVAL;
    private realtimeBatchSize = DEFAULT_BATCH_SIZE;
    private realtimeBatchWindowMs = DEFAULT_BATCH_WINDOW;
    private autoCreateEvents = true;
    private autoGeneratePlans = true;
    private scanPrompt = AUTONOMOUS_SCAN_PROMPT;

    // Timers
    private periodicTimer: ReturnType<typeof setInterval> | null = null;
    private batchFlushTimer: ReturnType<typeof setTimeout> | null = null;

    // Real-time message queue
    private messageQueue: WAMessage[] = [];
    private processedIds = new Set<string>();

    // Stats
    private totalScans = 0;
    private totalMessagesProcessed = 0;
    private totalEventsDetected = 0;
    private totalEventsPinned = 0;
    private totalPlansGenerated = 0;
    private lastScanAt: number | null = null;

    // Results
    private recentScans: ScanResult[] = [];
    private autoDetectedEvents: DetectedEvent[] = [];

    // Group config
    private groupConfigs: Map<string, GroupConfig> = new Map();

    // Lock to prevent concurrent scans
    private _scanning = false;

    // Session listener references (for cleanup)
    private _onMessage: ((msg: WAMessage) => void) | null = null;
    private _onReady: (() => void) | null = null;
    private _onStatus: ((status: string) => void) | null = null;

    constructor() {
        super();
        this.setMaxListeners(30);
    }

    // ─── Public API ──────────────────────────────────────────────

    /** Get current scanner statistics */
    getStats(): ScannerStats {
        return {
            status: this._status,
            totalScans: this.totalScans,
            totalMessagesProcessed: this.totalMessagesProcessed,
            totalEventsDetected: this.totalEventsDetected,
            totalEventsPinned: this.totalEventsPinned,
            totalPlansGenerated: this.totalPlansGenerated,
            lastScanAt: this.lastScanAt,
            nextScanAt: this.periodicTimer && this.lastScanAt
                ? this.lastScanAt + this.scanIntervalMs
                : null,
            scanIntervalMs: this.scanIntervalMs,
            realtimeBatchSize: this.realtimeBatchSize,
            realtimeBatchWindowMs: this.realtimeBatchWindowMs,
            uptime: this._startedAt ? Date.now() - this._startedAt : 0,
            startedAt: this._startedAt,
            error: this._error,
            recentScans: [...this.recentScans],
            autoDetectedEvents: [...this.autoDetectedEvents],
            groups: Array.from(this.groupConfigs.values()),
        };
    }

    /** Start the autonomous scanner — attaches to wa-session */
    async start(config?: ScannerConfig): Promise<void> {
        if (this._status === "running" || this._status === "scanning") {
            console.log("[AUTO-SCAN] Already running");
            return;
        }

        // Apply config
        if (config) this.applyConfig(config);

        const session = getWASession();
        const state = session.getState();

        // If session is ready, start immediately
        if (state.status === "ready") {
            this._startScanning(session);
        } else {
            // Wait for session to become ready
            console.log("[AUTO-SCAN] Waiting for WhatsApp session to be ready...");
            this._status = "idle";

            this._onReady = () => {
                console.log("[AUTO-SCAN] Session ready — starting autonomous scan");
                this._startScanning(session);
            };
            session.on("ready", this._onReady);
        }

        // Also handle disconnects
        this._onStatus = (status: string) => {
            if (status === "disconnected" || status === "error") {
                console.log(`[AUTO-SCAN] Session ${status} — pausing scanner`);
                this._pause();
            } else if (status === "ready" && this._status === "paused") {
                console.log("[AUTO-SCAN] Session reconnected — resuming scanner");
                this._startScanning(session);
            }
        };
        session.on("status", this._onStatus);

        this.emit("started");
    }

    /** Stop the autonomous scanner */
    stop(): void {
        this._cleanup();
        this._status = "idle";
        this._startedAt = null;
        this._error = null;
        this.messageQueue = [];
        this.emit("stopped");
        console.log("[AUTO-SCAN] Scanner stopped");
    }

    /** Pause scanning (keeps state, stops timers) */
    pause(): void {
        this._pause();
        this.emit("paused");
    }

    /** Resume scanning after pause */
    resume(): void {
        if (this._status !== "paused") return;
        const session = getWASession();
        const state = session.getState();
        if (state.status === "ready") {
            this._startScanning(session);
        }
        this.emit("resumed");
    }

    /** Update scanner configuration */
    configure(config: ScannerConfig): void {
        this.applyConfig(config);
        // If running, restart periodic timer with new interval
        if (this._status === "running" && this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = setInterval(
                () => this._periodicScan(),
                this.scanIntervalMs,
            );
        }
        this.emit("configured", config);
    }

    /** Classify a WhatsApp group */
    classifyGroup(groupId: string, classification: GroupClassification, enabled = true): void {
        const existing = this.groupConfigs.get(groupId);
        if (existing) {
            existing.classification = classification;
            existing.enabled = enabled;
        } else {
            // Try to get name from session
            const session = getWASession();
            const groups = session.getGroups();
            const found = groups.find((g) => g.id === groupId);
            this.groupConfigs.set(groupId, {
                id: groupId,
                name: found?.name || groupId,
                classification,
                enabled,
            });
        }
        this.emit("group-classified", groupId, classification);
    }

    /** Sync groups from session */
    syncGroups(): void {
        const session = getWASession();
        const groups = session.getGroups();
        for (const g of groups) {
            if (!this.groupConfigs.has(g.id)) {
                this.groupConfigs.set(g.id, {
                    id: g.id,
                    name: g.name,
                    classification: "unclassified",
                    enabled: true, // Default: monitor all groups
                });
            } else {
                // Update name if changed
                const cfg = this.groupConfigs.get(g.id)!;
                cfg.name = g.name;
            }
        }
    }

    /** Force an immediate scan NOW (manual trigger, still autonomous processing) */
    async forceScan(): Promise<ScanResult | null> {
        if (this._scanning) {
            console.log("[AUTO-SCAN] Scan already in progress");
            return null;
        }
        return this._runScan("force");
    }

    /** Clear all accumulated data */
    clearData(): void {
        this.recentScans = [];
        this.autoDetectedEvents = [];
        this.processedIds.clear();
        this.totalScans = 0;
        this.totalMessagesProcessed = 0;
        this.totalEventsDetected = 0;
        this.totalEventsPinned = 0;
        this.totalPlansGenerated = 0;
        this.lastScanAt = null;
    }

    // ─── Private Methods ─────────────────────────────────────────

    private applyConfig(config: ScannerConfig): void {
        if (config.scanIntervalMs !== undefined) this.scanIntervalMs = config.scanIntervalMs;
        if (config.realtimeBatchSize !== undefined) this.realtimeBatchSize = config.realtimeBatchSize;
        if (config.realtimeBatchWindowMs !== undefined) this.realtimeBatchWindowMs = config.realtimeBatchWindowMs;
        if (config.autoCreateEvents !== undefined) this.autoCreateEvents = config.autoCreateEvents;
        if (config.autoGeneratePlans !== undefined) this.autoGeneratePlans = config.autoGeneratePlans;
        if (config.scanPrompt !== undefined) this.scanPrompt = config.scanPrompt;
    }

    private _startScanning(session: ReturnType<typeof getWASession>): void {
        this._status = "running";
        this._startedAt = this._startedAt || Date.now();
        this._error = null;

        // Sync group list
        this.syncGroups();

        // ── Real-time message listener ──
        this._onMessage = (msg: WAMessage) => {
            // Skip if already processed
            if (this.processedIds.has(msg.id)) return;

            // Detect group via isGroup flag OR @g.us protocol suffix
            const isGroupMsg = msg.isGroup || (msg.from && msg.from.endsWith("@g.us"));

            // For group messages, check if group is disabled
            if (isGroupMsg) {
                const groupKey = msg.chatId || msg.from;
                const groupCfg = this.groupConfigs.get(groupKey);
                if (groupCfg && !groupCfg.enabled) return;

                // Auto-classify unknown groups
                if (!groupCfg && groupKey) {
                    this.groupConfigs.set(groupKey, {
                        id: groupKey,
                        name: msg.chatName || groupKey,
                        classification: "unclassified",
                        enabled: true,
                    });
                }
            }

            // Add to real-time queue
            this.messageQueue.push(msg);

            // Check if batch is full
            if (this.messageQueue.length >= this.realtimeBatchSize) {
                this._flushRealtimeBatch();
            } else if (!this.batchFlushTimer) {
                // Set a timer to flush partial batches
                this.batchFlushTimer = setTimeout(
                    () => this._flushRealtimeBatch(),
                    this.realtimeBatchWindowMs,
                );
            }
        };
        session.on("message", this._onMessage);

        // ── Periodic full scan ──
        this.periodicTimer = setInterval(
            () => this._periodicScan(),
            this.scanIntervalMs,
        );

        // Run an initial scan immediately on start
        setTimeout(() => this._periodicScan(), 2000);

        console.log(
            `[AUTO-SCAN] AUTONOMOUS MODE ACTIVE — interval: ${this.scanIntervalMs / 1000}s, batch: ${this.realtimeBatchSize} msgs, window: ${this.realtimeBatchWindowMs / 1000}s`,
        );
    }

    private _pause(): void {
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
        if (this.batchFlushTimer) {
            clearTimeout(this.batchFlushTimer);
            this.batchFlushTimer = null;
        }
        // Remove message listener but keep session listeners for reconnect
        if (this._onMessage) {
            const session = getWASession();
            session.removeListener("message", this._onMessage);
            this._onMessage = null;
        }
        this._status = "paused";
        console.log("[AUTO-SCAN] Scanner paused");
    }

    private _cleanup(): void {
        if (this.periodicTimer) {
            clearInterval(this.periodicTimer);
            this.periodicTimer = null;
        }
        if (this.batchFlushTimer) {
            clearTimeout(this.batchFlushTimer);
            this.batchFlushTimer = null;
        }
        const session = getWASession();
        if (this._onMessage) {
            session.removeListener("message", this._onMessage);
            this._onMessage = null;
        }
        if (this._onReady) {
            session.removeListener("ready", this._onReady);
            this._onReady = null;
        }
        if (this._onStatus) {
            session.removeListener("status", this._onStatus);
            this._onStatus = null;
        }
    }

    private async _flushRealtimeBatch(): Promise<void> {
        if (this.batchFlushTimer) {
            clearTimeout(this.batchFlushTimer);
            this.batchFlushTimer = null;
        }

        if (this.messageQueue.length === 0) return;

        // Drain queue
        const batch = this.messageQueue.splice(0, this.messageQueue.length);
        console.log(`[AUTO-SCAN] Real-time batch flush: ${batch.length} messages`);

        // Run scan on batch
        await this._runScan("realtime", batch);
    }

    private async _periodicScan(): Promise<void> {
        if (this._scanning) {
            console.log("[AUTO-SCAN] Periodic scan skipped — already scanning");
            return;
        }

        const session = getWASession();
        const state = session.getState();
        if (state.status !== "ready") return;

        // Get all unprocessed messages from session buffer
        // Process ALL messages — NanoClaw filter decides relevance by content
        // getMessages() auto-enforces 24h threshold
        const allMessages = session.getMessages({ limit: 500 });
        const unprocessed = allMessages.filter((m) => !this.processedIds.has(m.id));

        if (unprocessed.length === 0) {
            console.log(`[AUTO-SCAN] Periodic scan — no new unprocessed messages`);
            return;
        }

        // Filter by enabled groups (if group message, check config; non-group always passes)
        const filtered = unprocessed.filter((m) => {
            const isGroup = m.isGroup || (m.from && m.from.endsWith("@g.us"));
            if (!isGroup) return true; // non-group messages always pass
            const groupKey = m.chatId || m.from;
            const cfg = this.groupConfigs.get(groupKey);
            return !cfg || cfg.enabled;
        });

        if (filtered.length > 0) {
            console.log(`[AUTO-SCAN] Periodic scan: ${filtered.length} unprocessed messages`);
            await this._runScan("periodic", filtered);
        }
    }

    private async _runScan(
        trigger: "realtime" | "periodic" | "force",
        messages?: WAMessage[],
    ): Promise<ScanResult | null> {
        if (this._scanning) return null;
        this._scanning = true;

        const prevStatus = this._status;
        this._status = "scanning";
        this.emit("scan-start", trigger);

        const startTime = Date.now();
        let result: ScanResult | null = null;

        try {
            // Get messages to scan
            let toScan: WAMessage[];
            if (messages && messages.length > 0) {
                toScan = messages;
            } else {
                // Force scan: get recent unprocessed messages
                const session = getWASession();
                // getMessages() auto-enforces 24h threshold
                const allMsgs = session.getMessages({ limit: 500 });
                toScan = allMsgs.filter(
                    (m) => !this.processedIds.has(m.id),
                );
            }

            if (toScan.length === 0) {
                this._scanning = false;
                this._status = prevStatus === "scanning" ? "running" : prevStatus;
                return null;
            }

            console.log(
                `[AUTO-SCAN] ${trigger.toUpperCase()} scan — ${toScan.length} messages → NanoClaw 5-pass`,
            );

            // ── Run NanoClaw 5-pass filter ──
            const { results, detectedEvents } = await classifyMessagesWithNL(
                toScan,
                this.scanPrompt,
            );

            // Mark all as processed
            for (const msg of toScan) {
                this.processedIds.add(msg.id);
            }
            // Trim processed IDs set
            if (this.processedIds.size > MAX_PROCESSED_IDS) {
                const arr = Array.from(this.processedIds);
                this.processedIds = new Set(arr.slice(-MAX_PROCESSED_IDS / 2));
            }

            const relevantCount = results.filter((r) => r.relevant).length;

            // ── Auto-create events + plans ──
            let eventsPinned = 0;
            let plansGenerated = 0;

            if (detectedEvents.length > 0 && this.autoCreateEvents) {
                try {
                    const planRes = await fetch(
                        `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/whatsapp/plan`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                detectedEvents: this.autoGeneratePlans
                                    ? detectedEvents
                                    : detectedEvents.map((e) => ({ ...e, eventDate: null })), // No plans if disabled
                            }),
                        },
                    );
                    const planData = await planRes.json();
                    if (planData.success) {
                        eventsPinned = planData.eventsCreated || 0;
                        plansGenerated = planData.plansGenerated || 0;
                    }
                } catch (err) {
                    console.error("[AUTO-SCAN] Auto-create events failed:", err);
                }
            }

            // ── Record results ──
            const duration = Date.now() - startTime;

            result = {
                timestamp: Date.now(),
                messagesProcessed: toScan.length,
                relevantFound: relevantCount,
                eventsDetected: detectedEvents.length,
                eventsPinned,
                plansGenerated,
                events: detectedEvents,
                duration,
            };

            // Update stats
            this.totalScans++;
            this.totalMessagesProcessed += toScan.length;
            this.totalEventsDetected += detectedEvents.length;
            this.totalEventsPinned += eventsPinned;
            this.totalPlansGenerated += plansGenerated;
            this.lastScanAt = Date.now();

            // Store in rolling buffer
            this.recentScans.unshift(result);
            if (this.recentScans.length > MAX_RECENT_SCANS) {
                this.recentScans = this.recentScans.slice(0, MAX_RECENT_SCANS);
            }

            // Store detected events
            this.autoDetectedEvents.unshift(...detectedEvents);
            if (this.autoDetectedEvents.length > MAX_AUTO_EVENTS) {
                this.autoDetectedEvents = this.autoDetectedEvents.slice(0, MAX_AUTO_EVENTS);
            }

            console.log(
                `[AUTO-SCAN] ${trigger.toUpperCase()} complete — ${toScan.length} msgs → ${relevantCount} relevant, ${detectedEvents.length} events, ${eventsPinned} pinned, ${plansGenerated} plans (${duration}ms)`,
            );

            this.emit("scan-complete", result);

            if (detectedEvents.length > 0) {
                this.emit("events-detected", detectedEvents);
            }
        } catch (err: any) {
            console.error(`[AUTO-SCAN] Scan error (${trigger}):`, err);
            this._error = err.message || "Scan failed";
            this.emit("scan-error", err);
        } finally {
            this._scanning = false;
            this._status = prevStatus === "scanning" ? "running" : prevStatus;
        }

        return result;
    }
}

// ─── Export singleton getter ──────────────────────────────────────

// ─── Export singleton getter — globalThis for HMR safety ─────────

export function getAutonomousScanner(): AutonomousScanner {
    if (!globalStore[GLOBAL_SCANNER_KEY]) {
        globalStore[GLOBAL_SCANNER_KEY] = new AutonomousScanner();
        console.log("[AUTO-SCAN] Created NEW singleton (globalThis)");
    }
    return globalStore[GLOBAL_SCANNER_KEY] as AutonomousScanner;
}
