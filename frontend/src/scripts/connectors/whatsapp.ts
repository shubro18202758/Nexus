import { Client, LocalAuth } from "whatsapp-web.js";
// @ts-ignore — standalone script, no type declarations needed
import qrcode from "qrcode-terminal";

// ============================================
// Configuration (Environment-driven, not hardcoded)
// ============================================
const API_PORT = process.env.NEXUS_API_PORT || "3000";
const API_HOST = process.env.NEXUS_API_HOST || "http://localhost";
const API_URL = `${API_HOST}:${API_PORT}/api/ingest`;

console.log(`Starting WhatsApp Connector...`);
console.log(`Target API: ${API_URL}`);

// ============================================
// Real-time URL deduplication (time-windowed)
// ============================================
const recentlySent = new Map<string, number>(); // url -> timestamp
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 min — same URL ignored within window

function isDuplicate(url: string): boolean {
    const now = Date.now();
    // Prune old entries
    for (const [key, ts] of recentlySent) {
        if (now - ts > DEDUP_WINDOW_MS) recentlySent.delete(key);
    }
    if (recentlySent.has(url)) return true;
    recentlySent.set(url, now);
    return false;
}

// ============================================
// URL extraction — captures ALL URLs, not just the first
// ============================================
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/gi;

function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX);
    if (!matches) return [];
    return [...new Set(matches)];
}

// ============================================
// API Sender
// ============================================
async function postToApi(payload: any) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        if (response.ok) {
            console.log(`Ingested: ${text}`);
            return true;
        } else {
            console.error(`Ingest failed (${response.status}): ${text}`);
            return false;
        }
    } catch (e) {
        console.error(`Cannot reach API at ${API_URL}: ${(e as Error).message}`);
        return false;
    }
}

// ============================================
// WhatsApp Client
// ============================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
});

client.on("qr", (qr) => {
    console.log("QR RECEIVED. Scan with your phone:");
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("Client is ready! Listening for ALL messages in real-time...");
});

client.on("authenticated", () => {
    console.log("Authenticated successfully.");
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.on("disconnected", (reason) => {
    console.log("Client disconnected:", reason);
    console.log("Attempting to reconnect...");
    client.initialize();
});

// ============================================
// Core: Dynamic, real-time message handler
//
// Strategy: Send EVERY message that contains a URL to the ingest API.
// The LOCAL LLM on the server side decides relevance — not this connector.
// This avoids missing events due to brittle keyword filters.
// ============================================
client.on("message_create", async (msg) => {
    // Skip status updates and media-only messages with no text
    if (msg.isStatus || !msg.body || msg.body.trim().length === 0) return;

    const urls = extractUrls(msg.body);

    if (urls.length > 0) {
        for (const url of urls) {
            if (isDuplicate(url)) {
                console.log(`Skipping duplicate URL (within ${DEDUP_WINDOW_MS / 60000}m window): ${url.substring(0, 60)}...`);
                continue;
            }

            console.log(`Captured URL: ${url.substring(0, 80)}`);

            // Get chat name for richer context
            let chatName = "";
            try {
                const chat = await msg.getChat();
                chatName = chat.name || "";
            } catch {
                // ignore — chat metadata not critical
            }

            await postToApi({
                text: msg.body,
                source: "WhatsApp",
                url: url,
                chatName: chatName,
                priority: 2,
            });
        }
    }
});

client.initialize();
