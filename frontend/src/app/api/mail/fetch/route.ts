// ===================================================================
// Mail Fetch API — Fetches emails from an IMAP folder
// POST /api/mail/fetch
// Body: { host, port, email, password, folder, since, limit }
// Returns: { mails: MailItem[] }
//
// Strategy: ImapFlow with robust fetching (sequence-number based
// if UID SEARCH returns empty)
// ===================================================================

import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export const maxDuration = 60;

export interface MailItem {
    uid: number;
    messageId: string;
    from: { name: string; address: string };
    to: { name: string; address: string }[];
    subject: string;
    date: string;
    snippet: string;
    body: string;
    htmlBody: string;
    images: string[];
    folder: string;
    flags: string[];
    hasAttachments: boolean;
}

function createClient(host: string, port: number, email: string, password: string) {
    return new ImapFlow({
        host,
        port,
        secure: port === 993,
        auth: { user: email, pass: password },
        logger: false,
        tls: { rejectUnauthorized: false, minVersion: "TLSv1.2" as any },
        connectionTimeout: 15000,
    } as any);
}

export async function POST(request: NextRequest) {
    let client: ImapFlow | null = null;

    try {
        const {
            host, port, email, password,
            folder = "INBOX",
            since,
            limit = 50,
        } = await request.json();

        if (!host || !port || !email || !password) {
            return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
        }

        client = createClient(host, Number(port), email, password);
        client.on("error", () => { });
        await client.connect();

        console.log(`[MAIL FETCH] Connected to ${host}, selecting ${folder}...`);
        const lock = await client.getMailboxLock(folder);
        const mails: MailItem[] = [];

        try {
            // Get mailbox status
            const status = client.mailbox;
            const totalExists = (status && typeof status === "object") ? (status.exists || 0) : 0;
            console.log(`[MAIL FETCH] Mailbox ${folder}: ${totalExists} messages total`);

            if (totalExists === 0) {
                lock.release();
                await client.logout();
                return NextResponse.json({ mails: [] });
            }

            // Strategy: Fetch the most recent `limit` messages by sequence number
            // This is more reliable than UID SEARCH which can return empty on some servers
            const start = Math.max(1, totalExists - limit + 1);
            const range = `${start}:${totalExists}`;
            console.log(`[MAIL FETCH] Fetching sequence range ${range} (${Math.min(limit, totalExists)} msgs)`);

            let sinceDate: Date | null = null;
            if (since) {
                sinceDate = new Date(since);
            }

            for await (const msg of client.fetch(range, {
                uid: true,
                envelope: true,
                source: true,
                flags: true,
                bodyStructure: true,
            })) {
                const envelope = msg.envelope;
                if (!envelope) continue;

                // Date filter client-side (more reliable than IMAP SINCE)
                const msgDate = envelope.date ? new Date(envelope.date) : new Date();
                if (sinceDate && msgDate < sinceDate) {
                    continue; // Skip messages older than the requested date
                }

                let bodyText = "";
                let htmlBody = "";
                let images: string[] = [];
                if (msg.source) {
                    try {
                        const parsedMail = await simpleParser(msg.source);
                        const rawStr = msg.source.toString("utf-8");

                        // Capture HTML body for rich rendering
                        if (typeof parsedMail.html === "string") {
                            htmlBody = sanitiseHtml(parsedMail.html);
                            images = extractImages(parsedMail.html);
                        }

                        // Also capture inline images from attachments
                        if (parsedMail.attachments) {
                            for (const att of parsedMail.attachments) {
                                if (att.contentType?.startsWith("image/") && att.content) {
                                    const b64 = att.content.toString("base64");
                                    images.push(`data:${att.contentType};base64,${b64}`);
                                }
                            }
                        }

                        let extracted = parsedMail.text;
                        if (!extracted && typeof parsedMail.html === "string") {
                            extracted = extractTextFallback(parsedMail.html);
                        }
                        if (!extracted) {
                            extracted = extractTextFallback(rawStr);
                        }

                        bodyText = extracted || "(Could not parse body)";

                        // Universal clean — decodes QP, strips HTML, normalises ws
                        bodyText = cleanBody(bodyText);
                    } catch {
                        bodyText = "(Could not parse body)";
                    }
                }

                // De-duplicate images
                images = [...new Set(images)].slice(0, 8);

                const fromAddr = envelope.from?.[0] || { name: "", address: "" };
                mails.push({
                    uid: msg.uid,
                    messageId: envelope.messageId || `uid-${msg.uid}`,
                    from: { name: fromAddr.name || "", address: fromAddr.address || "" },
                    to: (envelope.to || []).map((a: any) => ({ name: a.name || "", address: a.address || "" })),
                    subject: envelope.subject || "(No Subject)",
                    date: msgDate.toISOString(),
                    snippet: bodyText.substring(0, 350).replace(/\s+/g, " ").trim(),
                    body: bodyText,
                    htmlBody,
                    images,
                    folder,
                    flags: msg.flags ? Array.from(msg.flags) : [],
                    hasAttachments: checkAttachments(msg.bodyStructure),
                });
            }

            console.log(`[MAIL FETCH] Parsed ${mails.length} mails (after date filter)`);
        } finally {
            lock.release();
        }

        await client.logout();
        client = null;

        // Sort newest first
        mails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({ mails });
    } catch (error: any) {
        console.error("[MAIL FETCH] Error:", error.message);
        if (client) {
            try { await client.logout(); } catch { }
        }
        return NextResponse.json(
            { error: error.message || "Failed to fetch mails" },
            { status: 500 }
        );
    }
}

// ── Extract image URLs from HTML ─────────────────────────────────
function extractImages(html: string): string[] {
    const urls: string[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1];
        // Skip tracking pixels (1x1), spacers, and cid: references
        if (
            src.startsWith("cid:") ||
            src.includes("pixel") ||
            src.includes("track") ||
            src.includes("open.") ||
            src.includes("beacon") ||
            src.includes("spacer") ||
            src.length < 10
        ) continue;
        // Only keep http/https/data URLs
        if (src.startsWith("http") || src.startsWith("data:image")) {
            urls.push(src);
        }
    }
    // Also extract background-image URLs
    const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((match = bgRegex.exec(html)) !== null) {
        const src = match[1];
        if (src.startsWith("http")) urls.push(src);
    }
    return urls;
}

// ── Sanitise HTML for safe client rendering ──────────────────────
function sanitiseHtml(html: string): string {
    if (!html) return "";

    // Decode QP in HTML first
    let h = decodeQuotedPrintable(html);

    // Remove scripts, event handlers, iframes, objects
    h = h.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    h = h.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");
    h = h.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "");
    h = h.replace(/<embed[^>]*>/gi, "");
    h = h.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, ""); // onclick, onload, etc.
    h = h.replace(/javascript\s*:/gi, "");

    // Keep the HTML structure but cap it
    return h.substring(0, 50000);
}

// ── Quoted-Printable decoder ──────────────────────────────────────
// Safe to run on ANY text — only modifies actual QP patterns.
// Handles: soft line-breaks (=\n), hex codes (=3D →  =), UTF-8
// multi-byte sequences (=C2=A0 → NBSP), and malformed trailing-ws
// soft breaks (= \n).
function decodeQuotedPrintable(text: string): string {
    if (!text) return text;

    let d = text;

    // 1. Soft line-breaks: "=" at end-of-line means the line continues
    d = d.replace(/=[ \t]*\r?\n/g, "");

    // 2. Hex-encoded bytes (=XX) — only if we see enough of them to
    //    be confident this really is QP and not just prose containing "=3"
    const hexHits = d.match(/=([0-9A-Fa-f]{2})/g);
    if (hexHits && hexHits.length >= 1) {
        try {
            // Convert QP hex → percent-encoding so decodeURIComponent
            // handles multi-byte UTF-8 correctly.
            const pct = d.replace(/=([0-9A-Fa-f]{2})/g, "%$1");
            d = decodeURIComponent(pct);
        } catch {
            // Fallback for sequences that aren't valid UTF-8
            d = d.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16)),
            );
        }
    }

    return d;
}

// ── Strip HTML to plain text ─────────────────────────────────────
function htmlToPlainText(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#?[a-zA-Z0-9]+;/g, " ");
}

// ── Universal body cleaner ───────────────────────────────────────
// Runs on every body regardless of how it was obtained — guarantees
// the text reaching the frontend is human-readable.
function cleanBody(raw: string): string {
    // Decode any QP artifacts (safe on non-QP text)
    let text = decodeQuotedPrintable(raw);

    // Strip residual HTML
    text = htmlToPlainText(text);

    // Remove MIME debris that sometimes leaks through
    text = text
        .replace(/--[A-Za-z0-9_=.+-]{20,}/g, "")          // MIME boundaries
        .replace(/Content-Type:.*$/gm, "")
        .replace(/Content-Transfer-Encoding:.*$/gm, "")
        .replace(/Content-Disposition:.*$/gm, "")
        .replace(/^[A-Za-z0-9+/=]{60,}$/gm, "");          // stray base64 lines

    // Normalise whitespace
    text = text
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

    return text.substring(0, 5000);
}

function extractTextFallback(raw: string): string {
    const parts = raw.split(/\r?\n\r?\n/);
    const headers = parts.length > 1 ? parts[0].toLowerCase() : "";
    let body = parts.length > 1 ? parts.slice(1).join("\n\n") : raw;

    // Detect and decode Base64
    if (headers.includes("base64") || /^[A-Za-z0-9+/=\r\n]+$/.test(body.substring(0, 200))) {
        try {
            const b64 = body.replace(/[\r\n]/g, "");
            body = Buffer.from(b64, "base64").toString("utf-8");
        } catch { }
    }

    // Run universal cleaner (handles QP + HTML + MIME debris)
    return cleanBody(body);
}

function checkAttachments(structure: any): boolean {
    if (!structure) return false;
    if (structure.disposition === "attachment") return true;
    if (structure.childNodes) {
        return structure.childNodes.some((child: any) => checkAttachments(child));
    }
    return false;
}
