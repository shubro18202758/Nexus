// ===================================================================
// WhatsApp Session Manager — Direct Store Polling Architecture
//
// ROOT CAUSE: whatsapp-web.js v1.34.6 moduleraid injection is broken.
// `message`/`message_create` events NEVER fire, `getChats()` HANGS.
// But the internal WhatsApp Web Store (window.Store.Chat/Msg) works
// perfectly — 700+ chats and 500+ messages visible via page.evaluate().
//
// SOLUTION: Bypass wwebjs's dead abstraction layer entirely.
// Use the Client ONLY for auth/QR/session lifecycle.
// Read ALL messages by polling window.Store directly via Puppeteer.
// This is a PULL-based architecture immune to event hook bugs.
//
// Architecture:
//   - whatsapp-web.js Client handles ONLY: auth, QR, session
//   - Direct Puppeteer page.evaluate() reads Store.Msg + Store.Chat
//   - 10-second polling interval pulls new messages from the Store
//   - 24-hour rolling window; messages older than 24h auto-pruned
//   - De-duplication via Set of seen message IDs
//   - globalThis singleton survives HMR/Turbopack re-evaluation
// ===================================================================

import { EventEmitter } from "events";

// ─── Types ───────────────────────────────────────────────────────

export type WASessionStatus =
  | "disconnected"
  | "qr_pending"
  | "authenticating"
  | "ready"
  | "error";

export interface WAMessage {
  id: string;
  from: string;
  chatName: string;
  chatId: string;
  body: string;
  timestamp: number;
  isGroup: boolean;
  authorName?: string;
  hasMedia: boolean;
  mediaUrl?: string;
  urls: string[];
}

export interface WASessionState {
  status: WASessionStatus;
  qrCode: string | null;
  qrDataUrl: string | null;
  connectedPhone: string | null;
  messageCount: number;
  lastMessageAt: number | null;
  groupCount: number;
  error: string | null;
  uptime: number;
}

// ─── globalThis persistence for HMR/Turbopack ────────────────────

const GLOBAL_WA_KEY = "__nexus_wa_session__";
const globalStore = globalThis as unknown as Record<string, any>;

// ─── Singleton Session Manager ────────────────────────────────────

class WhatsAppSessionManager extends EventEmitter {
  private status: WASessionStatus = "disconnected";
  private qrCode: string | null = null;
  private connectedPhone: string | null = null;
  private error: string | null = null;
  private startTime: number = 0;

  // In-memory message buffer
  private messageBuffer: WAMessage[] = [];
  private readonly maxBufferSize = 5000;
  private readonly MESSAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private groups: Map<string, string> = new Map(); // chatId → name

  // Client reference (lazy loaded)
  private client: any = null;
  private initPromise: Promise<void> | null = null;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  // Direct Store polling — the ONLY reliable message source
  private storePollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly STORE_POLL_INTERVAL = 10_000; // 10 seconds
  private seenMessageIds = new Set<string>();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /** Get current session state */
  getState(): WASessionState {
    return {
      status: this.status,
      qrCode: this.qrCode,
      qrDataUrl: this.qrCode
        ? `data:image/png;base64,${this.qrCode}`
        : null,
      connectedPhone: this.connectedPhone,
      messageCount: this.getMessages().length,
      lastMessageAt:
        this.messageBuffer.length > 0
          ? this.messageBuffer[this.messageBuffer.length - 1].timestamp
          : null,
      groupCount: this.groups.size,
      error: this.error,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /** Prune messages older than 24 hours from the buffer */
  private pruneStaleMessages(): void {
    const cutoff = Date.now() - this.MESSAGE_TTL_MS;
    const before = this.messageBuffer.length;
    this.messageBuffer = this.messageBuffer.filter((m) => m.timestamp >= cutoff);
    const pruned = before - this.messageBuffer.length;
    if (pruned > 0) {
      console.log(`[WA-SESSION] Pruned ${pruned} stale messages (>24h), remaining=${this.messageBuffer.length}`);
    }
  }

  /** Get buffered messages with optional filters — always enforces 24h ceiling */
  getMessages(opts?: {
    since?: number;
    groupOnly?: boolean;
    chatId?: string;
    limit?: number;
    search?: string;
  }): WAMessage[] {
    // Auto-prune stale messages on every read
    this.pruneStaleMessages();

    // Enforce 24h floor — even if caller asks for older, cap at 24h
    const twentyFourHoursAgo = Date.now() - this.MESSAGE_TTL_MS;
    const effectiveSince = Math.max(opts?.since || 0, twentyFourHoursAgo);

    let msgs = this.messageBuffer.filter((m) => m.timestamp >= effectiveSince);
    if (opts?.groupOnly) {
      msgs = msgs.filter((m) => m.isGroup || m.from.endsWith("@g.us"));
    }
    if (opts?.chatId) {
      msgs = msgs.filter((m) => m.chatId === opts.chatId);
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      msgs = msgs.filter(
        (m) =>
          m.body.toLowerCase().includes(q) ||
          m.chatName.toLowerCase().includes(q),
      );
    }

    // Most recent first
    msgs.sort((a, b) => b.timestamp - a.timestamp);

    if (opts?.limit) {
      msgs = msgs.slice(0, opts.limit);
    }

    return msgs;
  }

  /** Get all known groups */
  getGroups(): Array<{ id: string; name: string }> {
    return Array.from(this.groups.entries()).map(([id, name]) => ({
      id,
      name,
    }));
  }

  /** Initialize WhatsApp client — call once */
  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.status === "ready") return;

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      this.status = "authenticating";
      this.error = null;
      this.emit("status", this.status);

      // Dynamic import to avoid bundling issues in Next.js
      const { Client, LocalAuth } = await import("whatsapp-web.js");

      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
        puppeteer: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-features=site-per-process",
            "--disable-web-security",
            "--disable-features=IsolateOrigins",
            "--disable-site-isolation-trials",
          ],
          timeout: 60000,
        },
      });

      // QR Code
      this.client.on("qr", (qr: string) => {
        this.status = "qr_pending";
        this.qrCode = qr;
        this.error = null;
        this.emit("qr", qr);
        this.emit("status", this.status);
        console.log("[WA-Session] QR code generated — waiting for scan");
      });

      // Authenticated
      this.client.on("authenticated", () => {
        this.status = "authenticating";
        this.qrCode = null;
        this.emit("status", this.status);
        console.log("[WA-Session] Authenticated successfully");
      });

      // ── Ready ───────────────────────────────────────────────
      this.client.on("ready", () => {
        this.status = "ready";
        this.startTime = Date.now();
        this.qrCode = null;
        this.error = null;

        try {
          const info = this.client.info;
          this.connectedPhone = info?.wid?.user || null;
        } catch {
          // Non-critical
        }

        this.emit("ready");
        this.emit("status", this.status);
        console.log("[WA-Session] Client ready — starting Direct Store Polling");

        // Start direct Store polling — the ONLY reliable message source
        this.startStorePolling();
      });

      // ── Event listeners kept as backup (usually DON'T fire due to moduleraid bug) ──
      const seenEvt = new Set<string>();
      const handleEvt = (msg: any, src: string) => {
        try {
          const rawId = msg?.id?._serialized || "";
          if (!rawId || seenEvt.has(rawId)) return;
          seenEvt.add(rawId);
          if (seenEvt.size > 10000) {
            const a = Array.from(seenEvt);
            seenEvt.clear();
            for (const id of a.slice(-5000)) seenEvt.add(id);
          }
          if (msg.isStatus || !msg.body?.trim()) return;

          const fromId: string = msg.from || "";
          const isGroup = fromId.endsWith("@g.us");
          if (isGroup) this.groups.set(fromId, this.groups.get(fromId) || fromId);

          const urlRx = /(https?:\/\/[^\s<>"')\]]+)/gi;
          const urls = Array.from(new Set<string>(msg.body.match(urlRx) || []));

          const waMsg: WAMessage = {
            id: rawId,
            from: fromId,
            chatName: this.groups.get(fromId) || fromId,
            chatId: fromId,
            body: msg.body,
            timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
            isGroup,
            authorName: msg._data?.notifyName || msg.author || undefined,
            hasMedia: msg.hasMedia || false,
            urls,
          };

          if (!this.seenMessageIds.has(rawId)) {
            this.seenMessageIds.add(rawId);
            this.messageBuffer.push(waMsg);
            console.log(`[WA-EVT] ${src}: from=${fromId}, body="${(msg.body || "").substring(0, 40)}"`);
            this.emit("message", waMsg);
          }
        } catch (e) {
          console.error(`[WA-EVT] ${src} error:`, e);
        }
      };
      this.client.on("message_create", (m: any) => handleEvt(m, "msg_create"));
      this.client.on("message", (m: any) => handleEvt(m, "msg_in"));

      // ── Disconnect ──────────────────────────────────────────
      this.client.on("disconnected", (reason: string) => {
        this.status = "disconnected";
        this.connectedPhone = null;
        this.error = `Disconnected: ${reason}`;
        this.stopStorePolling();
        this.emit("status", this.status);
        console.warn("[WA-Session] Disconnected:", reason);

        this.initPromise = null;
        setTimeout(() => {
          console.log("[WA-Session] Attempting reconnect...");
          this.initialize().catch(console.error);
        }, 5000);
      });

      // ── Auth failure ────────────────────────────────────────
      this.client.on("auth_failure", (err: any) => {
        this.status = "error";
        this.error = `Auth failed: ${String(err)}`;
        this.emit("status", this.status);
        console.error("[WA-Session] Auth failure:", err);
      });

      await this.client.initialize();
      // Success — reset retry counter
      this.retryCount = 0;
    } catch (err: any) {
      this.status = "error";
      const msg = err.message || "Initialization failed";
      this.error = msg;
      this.initPromise = null;
      this.emit("status", this.status);
      console.error(`[WA-Session] Init error (attempt ${this.retryCount + 1}/${this.maxRetries}):`, msg);

      // Auto-retry on transient Puppeteer errors (frame detached, timeout, etc.)
      const msgLower = msg.toLowerCase();
      const isTransient =
        msgLower.includes("frame") ||
        msgLower.includes("detach") ||
        msgLower.includes("timeout") ||
        msgLower.includes("target closed") ||
        msgLower.includes("protocol error") ||
        msgLower.includes("navigation") ||
        msgLower.includes("context") ||
        msgLower.includes("destroyed") ||
        msgLower.includes("execution") ||
        msgLower.includes("session") ||
        msgLower.includes("page crash");

      if (isTransient && this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(5000 * this.retryCount, 15000);
        console.log(`[WA-Session] Transient error — retrying in ${delay / 1000}s...`);
        this.error = `${msg} — retrying (${this.retryCount}/${this.maxRetries})...`;
        this.emit("status", this.status);

        // Cleanup stale client before retry
        try {
          if (this.client) await this.client.destroy();
        } catch { /* ignore cleanup errors */ }
        this.client = null;

        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.initPromise = null;
          this.initialize().catch(console.error);
        }, delay);
      }
    }
  }

  /** Disconnect and cleanup */
  async disconnect(): Promise<void> {
    this.stopStorePolling();

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = 0;

    try {
      if (this.client) {
        await this.client.destroy();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.status = "disconnected";
    this.client = null;
    this.initPromise = null;
    this.connectedPhone = null;
    this.qrCode = null;
    this.emit("status", this.status);
  }

  /** Clear message buffer */
  clearMessages(): void {
    this.messageBuffer = [];
    this.seenMessageIds.clear();
  }

  // ════════════════════════════════════════════════════════════════
  // DIRECT STORE POLLING — bypasses broken wwebjs event layer
  // Reads messages from window.Store.Msg and chats from
  // window.Store.Chat via Puppeteer page.evaluate() every 10s.
  // ════════════════════════════════════════════════════════════════

  private startStorePolling(): void {
    if (this.storePollTimer) return;
    console.log(
      `[WA-STORE] Starting direct Store polling (${this.STORE_POLL_INTERVAL / 1000}s interval)`,
    );

    // First poll immediately
    this.pollStore();

    // Then every STORE_POLL_INTERVAL
    this.storePollTimer = setInterval(
      () => this.pollStore(),
      this.STORE_POLL_INTERVAL,
    );
  }

  private stopStorePolling(): void {
    if (this.storePollTimer) {
      clearInterval(this.storePollTimer);
      this.storePollTimer = null;
      console.log("[WA-STORE] Stopped Store polling");
    }
  }

  /** Core: read messages + chats directly from WhatsApp Web's internal Store */
  private async pollStore(): Promise<void> {
    if (!this.client || this.status !== "ready") return;

    const page = this.client.pupPage;
    if (!page) {
      console.warn("[WA-STORE] No Puppeteer page available");
      return;
    }

    try {
      // 24h cutoff as Unix timestamp (seconds — WhatsApp uses seconds not ms)
      const cutoffSec = Math.floor((Date.now() - this.MESSAGE_TTL_MS) / 1000);

      // One single page.evaluate() call to read ALL data atomically
      const result = await Promise.race([
        page.evaluate((cutoff: number) => {
          const out: {
            msgs: Array<{
              id: string;
              from: string;
              chatId: string;
              body: string;
              t: number;
              isGroup: boolean;
              author: string | undefined;
              notifyName: string | undefined;
              hasMedia: boolean;
              fromMe: boolean;
            }>;
            chats: Array<{ id: string; name: string; isGroup: boolean }>;
            storeOk: boolean;
          } = { msgs: [], chats: [], storeOk: false };

          if (!(window as any).Store) return out;
          out.storeOk = true;

          // ── Chats ──
          try {
            const chatModels =
              (window as any).Store.Chat?.getModelsArray?.() || [];
            for (const c of chatModels) {
              const cid = c.id?._serialized || "";
              const isGrp = !!(c.isGroup || cid.endsWith("@g.us"));
              out.chats.push({
                id: cid,
                name: c.name || c.formattedTitle || cid,
                isGroup: isGrp,
              });
            }
          } catch {
            // Chat store unavailable
          }

          // ── Messages ──
          try {
            const msgModels =
              (window as any).Store.Msg?.getModelsArray?.() || [];
            for (const m of msgModels) {
              if (m.t && m.t < cutoff) continue;
              if (m.isStatusV3) continue;

              const body = m.body || "";
              if (!body.trim()) continue;

              const fromSerialized =
                m.from?._serialized || m.from?.toString?.() || "";
              const chatIdSerialized =
                m.id?.remote?._serialized ||
                m.id?.remote?.toString?.() ||
                fromSerialized;
              const isGroup =
                chatIdSerialized.endsWith("@g.us") ||
                fromSerialized.endsWith("@g.us");

              out.msgs.push({
                id: m.id?._serialized || "",
                from: fromSerialized,
                chatId: chatIdSerialized,
                body,
                t: m.t || 0,
                isGroup,
                author:
                  m.author?._serialized ||
                  m.author?.toString?.() ||
                  undefined,
                notifyName: m.notifyName || undefined,
                hasMedia: !!(m.isMedia || m.isMMS),
                fromMe: !!m.id?.fromMe,
              });
            }
          } catch {
            // Msg store unavailable
          }

          return out;
        }, cutoffSec),
        new Promise<null>((_, rej) =>
          setTimeout(() => rej(new Error("store-poll-timeout")), 15000),
        ),
      ]);

      if (!result || !result.storeOk) {
        console.warn("[WA-STORE] Store not available yet");
        return;
      }

      // ── Register chats/groups ──
      for (const chat of result.chats) {
        if (chat.isGroup) {
          this.groups.set(chat.id, chat.name);
        }
      }

      // Build chatId → chatName lookup
      const chatNameMap = new Map<string, string>();
      for (const c of result.chats) {
        chatNameMap.set(c.id, c.name);
      }

      // ── Process messages ──
      let newCount = 0;
      const urlRx = /(https?:\/\/[^\s<>"')\]]+)/gi;

      for (const m of result.msgs) {
        if (!m.id || this.seenMessageIds.has(m.id)) continue;

        this.seenMessageIds.add(m.id);

        const chatName =
          chatNameMap.get(m.chatId) ||
          this.groups.get(m.chatId) ||
          m.chatId;
        const urls = Array.from(new Set<string>(m.body.match(urlRx) || []));

        const waMsg: WAMessage = {
          id: m.id,
          from: m.from,
          chatName,
          chatId: m.chatId,
          body: m.body,
          timestamp: m.t * 1000, // seconds → ms
          isGroup: m.isGroup,
          authorName: m.notifyName || m.author || undefined,
          hasMedia: m.hasMedia,
          urls,
        };

        if (m.isGroup && chatName !== m.chatId) {
          this.groups.set(m.chatId, chatName);
        }

        this.messageBuffer.push(waMsg);
        newCount++;
        this.emit("message", waMsg);
      }

      // Housekeeping
      this.pruneStaleMessages();
      if (this.messageBuffer.length > this.maxBufferSize) {
        this.messageBuffer = this.messageBuffer.slice(-this.maxBufferSize);
      }

      // Cap seenMessageIds
      if (this.seenMessageIds.size > 50000) {
        const arr = Array.from(this.seenMessageIds);
        this.seenMessageIds.clear();
        for (const id of arr.slice(-25000)) this.seenMessageIds.add(id);
      }

      if (newCount > 0) {
        console.log(
          `[WA-STORE] Polled: +${newCount} new messages, ${result.chats.length} chats, ${this.groups.size} groups, buffer=${this.messageBuffer.length}`,
        );
      } else {
        console.log(
          `[WA-STORE] Polled: no new (store=${result.msgs.length} msgs, seen=${this.seenMessageIds.size}, buffer=${this.messageBuffer.length})`,
        );
      }
    } catch (e) {
      const errMsg = (e as Error).message || "";
      console.error("[WA-STORE] Poll error:", errMsg);

      if (
        errMsg.includes("destroyed") ||
        errMsg.includes("detached") ||
        errMsg.includes("Target closed")
      ) {
        console.warn("[WA-STORE] Page destroyed — stopping polls");
        this.stopStorePolling();
      }
    }
  }

  /** Add messages from external source (e.g. history import) — rejects messages older than 24h */
  ingestMessages(messages: WAMessage[]): void {
    const cutoff = Date.now() - this.MESSAGE_TTL_MS;
    const fresh = messages.filter((m) => m.timestamp >= cutoff);
    if (fresh.length < messages.length) {
      console.log(`[WA-SESSION] Ingest: rejected ${messages.length - fresh.length} messages older than 24h`);
    }
    this.messageBuffer.push(...fresh);
    // Sort by timestamp
    this.messageBuffer.sort((a, b) => a.timestamp - b.timestamp);
    // Prune stale + trim to max
    this.pruneStaleMessages();
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer = this.messageBuffer.slice(-this.maxBufferSize);
    }
  }
}

// Export singleton getter — uses globalThis to survive HMR
export function getWASession(): WhatsAppSessionManager {
  if (!globalStore[GLOBAL_WA_KEY]) {
    globalStore[GLOBAL_WA_KEY] = new WhatsAppSessionManager();
    console.log("[WA-Session] Created NEW singleton (globalThis)");
  }
  return globalStore[GLOBAL_WA_KEY] as WhatsAppSessionManager;
}
