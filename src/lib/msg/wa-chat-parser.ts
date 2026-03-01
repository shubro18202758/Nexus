// ===================================================================
// wa-chat-parser.ts — WhatsApp Chat Export (.txt) Parser
//
// Parses WhatsApp exported .txt chat files into WAMessage[] arrays
// compatible with the NanoClaw filter engine & message store.
//
// Supported formats:
//   Android:  2/28/26, 10:30 AM - John Doe: message text
//   iOS:      [28/02/2026, 10:30:15] John Doe: message text
//   24h:      28/02/2026, 14:30 - John Doe: message text
//   System:   2/28/26, 10:30 AM - Messages to this group are now secured...
// ===================================================================

import type { WAMessage } from "@/hooks/use-message-store";

// ── Line patterns ──

// Android/generic:  "2/28/26, 10:30 AM - Sender: Message"
const RE_ANDROID =
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*-\s+(.+?):\s(.+)/;

// iOS:  "[28/02/2026, 10:30:15] Sender: Message"
const RE_IOS =
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+?):\s(.+)/;

// System messages (no sender)
const RE_SYSTEM_ANDROID = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*-\s+(.+)/;
const RE_SYSTEM_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+)/;

/** URL extractor */
const RE_URL = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

// ── Helpers ──

/** Parse flexible date strings to Unix timestamp (seconds) */
function parseTimestamp(dateStr: string, timeStr: string): number {
    try {
        // Normalise separators
        const parts = dateStr.trim().split(/[/.-]/);
        if (parts.length < 3) return Date.now() / 1000;

        let day: number;
        let month: number;
        let year: number;

        // Heuristic: if first part > 12. it's DD/MM/YYYY, else MM/DD/YY
        const p0 = Number.parseInt(parts[0], 10);
        const p1 = Number.parseInt(parts[1], 10);
        const p2 = Number.parseInt(parts[2], 10);

        if (p0 > 12) {
            // DD/MM/YYYY
            day = p0;
            month = p1 - 1;
            year = p2;
        } else if (p1 > 12) {
            // MM/DD/YYYY
            month = p0 - 1;
            day = p1;
            year = p2;
        } else {
            // Ambiguous — default MM/DD/YY (US Android default)
            month = p0 - 1;
            day = p1;
            year = p2;
        }

        if (year < 100) year += 2000;

        // Parse time
        let timeTrimmed = timeStr.trim();
        let hours: number;
        let minutes: number;
        let seconds = 0;

        const isPM = /pm/i.test(timeTrimmed);
        const isAM = /am/i.test(timeTrimmed);
        timeTrimmed = timeTrimmed.replace(/\s*(AM|PM|am|pm)/i, "");

        const timeParts = timeTrimmed.split(":");
        hours = Number.parseInt(timeParts[0], 10);
        minutes = Number.parseInt(timeParts[1], 10);
        if (timeParts[2]) seconds = Number.parseInt(timeParts[2], 10);

        if (isPM && hours < 12) hours += 12;
        if (isAM && hours === 12) hours = 0;

        const dt = new Date(year, month, day, hours, minutes, seconds);
        return Math.floor(dt.getTime() / 1000);
    } catch {
        return Math.floor(Date.now() / 1000);
    }
}

/** Generate a deterministic message ID from content + timestamp */
function msgId(sender: string, ts: number, idx: number): string {
    const hash = `${sender}:${ts}:${idx}`;
    let h = 0;
    for (let i = 0; i < hash.length; i++) {
        h = ((h << 5) - h + hash.charCodeAt(i)) | 0;
    }
    return `imp_${Math.abs(h).toString(36)}_${idx}`;
}

// ── Public API ──

export interface ParseOptions {
    /** Chat / group name — shown as chatName on messages. Defaults to "Imported Chat" */
    chatName?: string;
    /** Override chatId. Defaults to `import_<hash>` */
    chatId?: string;
    /** If true, marks all messages as group messages. Default: true */
    isGroup?: boolean;
    /** Skip system messages (encryption notices, added/removed, etc). Default: true */
    skipSystem?: boolean;
}

/**
 * Parse a WhatsApp .txt chat export into WAMessage[].
 * Handles multi-line messages (continuation lines without timestamps).
 * Returns messages sorted oldest → newest.
 */
export function parseWhatsAppExport(
    text: string,
    opts: ParseOptions = {},
): WAMessage[] {
    const {
        chatName = "Imported Chat",
        chatId = `import_${Date.now().toString(36)}`,
        isGroup = true,
        skipSystem = true,
    } = opts;

    const lines = text.split(/\r?\n/);
    const messages: WAMessage[] = [];

    let current: {
        dateStr: string;
        timeStr: string;
        sender: string;
        body: string;
    } | null = null;

    function flush(idx: number) {
        if (!current) return;
        const ts = parseTimestamp(current.dateStr, current.timeStr);
        const body = current.body.trim();
        if (!body || body === "<Media omitted>") return;

        const urls = body.match(RE_URL) || [];

        messages.push({
            id: msgId(current.sender, ts, idx),
            from: `${current.sender}@import`,
            chatName,
            chatId,
            body,
            timestamp: ts,
            isGroup,
            authorName: current.sender,
            hasMedia: body.includes("<Media omitted>") || body.includes("<attached:"),
            urls,
        });
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Try Android format first
        let match = RE_ANDROID.exec(line);
        if (match) {
            flush(messages.length);
            current = {
                dateStr: match[1],
                timeStr: match[2],
                sender: match[3],
                body: match[4],
            };
            continue;
        }

        // Try iOS format
        match = RE_IOS.exec(line);
        if (match) {
            flush(messages.length);
            current = {
                dateStr: match[1],
                timeStr: match[2],
                sender: match[3],
                body: match[4],
            };
            continue;
        }

        // System message (no sender) — like "Messages to this group are secured..."
        if (!skipSystem) {
            match = RE_SYSTEM_ANDROID.exec(line);
            if (match) {
                flush(messages.length);
                current = {
                    dateStr: match[1],
                    timeStr: match[2],
                    sender: "System",
                    body: match[3],
                };
                continue;
            }
            match = RE_SYSTEM_IOS.exec(line);
            if (match) {
                flush(messages.length);
                current = {
                    dateStr: match[1],
                    timeStr: match[2],
                    sender: "System",
                    body: match[3],
                };
                continue;
            }
        }

        // Continuation line — append to current message body
        if (current) {
            current.body += `\n${line}`;
        }
    }

    // Flush final message
    flush(messages.length);

    return messages;
}

/**
 * Quick heuristic: does this text look like a WhatsApp chat export?
 * Returns true if at least 3 lines match the timestamp-sender pattern.
 */
export function looksLikeWhatsAppExport(text: string): boolean {
    const lines = text.split(/\r?\n/).slice(0, 20);
    let hits = 0;
    for (const line of lines) {
        if (RE_ANDROID.test(line) || RE_IOS.test(line) || RE_SYSTEM_ANDROID.test(line)) {
            hits++;
        }
    }
    return hits >= 3;
}
