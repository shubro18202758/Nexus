// ===================================================================
// Raw IMAP Client — Lightweight IMAP over TLS
//
// Bypasses ImapFlow for maximum compatibility with:
// - Perdition proxies (IIT Bombay, etc.)
// - University servers with minimal CAPABILITY sets
// - Servers that don't advertise AUTH mechanisms
//
// Supports: LOGIN, SELECT, SEARCH, FETCH (headers + body), LIST, LOGOUT
// ===================================================================

import * as tls from "tls";
import * as net from "net";

interface RawMailItem {
    uid: number;
    seq: number;
    flags: string[];
    from: { name: string; address: string };
    to: { name: string; address: string }[];
    subject: string;
    date: string;
    messageId: string;
    body: string;
    hasAttachments: boolean;
}

export class RawImapClient {
    private sock: tls.TLSSocket | net.Socket | null = null;
    private buffer = "";
    private tag = 0;
    private host: string;
    private port: number;
    private user: string;
    private pass: string;
    private resolveData: ((line: string) => void) | null = null;

    constructor(host: string, port: number, user: string, pass: string) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.pass = pass;
    }

    private nextTag(): string {
        return `A${String(++this.tag).padStart(4, "0")}`;
    }

    // ── Connect via TLS ──
    async connect(): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Connection timed out"));
            }, 15000);

            const opts: tls.ConnectionOptions = {
                host: this.host,
                port: this.port,
                rejectUnauthorized: false,
            };

            this.sock = this.port === 993
                ? tls.connect(opts)
                : net.connect({ host: this.host, port: this.port });

            this.sock.setEncoding("utf-8");

            let gotGreeting = false;
            this.sock.on("data", (data: string) => {
                this.buffer += data;

                // On greeting
                if (!gotGreeting && this.buffer.includes("* OK")) {
                    gotGreeting = true;
                    clearTimeout(timeout);
                    resolve(this.buffer.trim());
                    this.buffer = "";
                }

                // Resolve pending command
                if (this.resolveData) {
                    this.resolveData(data);
                }
            });

            this.sock.on("error", (err: Error) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    // ── Send a command and wait for tagged response ──
    private async command(cmd: string): Promise<{ tagged: string; untagged: string[] }> {
        const tag = this.nextTag();
        const fullCmd = `${tag} ${cmd}\r\n`;

        return new Promise((resolve, reject) => {
            const untagged: string[] = [];
            let fullResponse = "";

            const timeout = setTimeout(() => {
                this.resolveData = null;
                reject(new Error(`Command timed out: ${cmd.substring(0, 30)}...`));
            }, 30000);

            this.resolveData = (chunk: string) => {
                fullResponse += chunk;

                // Check if we have the tagged response
                const lines = fullResponse.split(/\r?\n/);
                for (const line of lines) {
                    if (line.startsWith(tag)) {
                        clearTimeout(timeout);
                        this.resolveData = null;
                        resolve({ tagged: line, untagged });
                        return;
                    } else if (line.startsWith("*")) {
                        untagged.push(line);
                    }
                }
            };

            this.sock?.write(fullCmd);
        });
    }

    // ── Login ──
    async login(): Promise<boolean> {
        const esc = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
        const { tagged } = await this.command(`LOGIN ${esc(this.user)} ${esc(this.pass)}`);
        if (!tagged.includes("OK")) {
            throw new Error(`Authentication failed: ${tagged}`);
        }
        return true;
    }

    // ── List folders ──
    async list(): Promise<{ path: string; name: string }[]> {
        const { untagged } = await this.command('LIST "" "*"');
        const folders: { path: string; name: string }[] = [];

        for (const line of untagged) {
            // * LIST (\HasNoChildren) "/" "INBOX"
            const match = line.match(/\* LIST \(([^)]*)\) "?([^"]*)"? "?([^"]*)"?$/);
            if (match) {
                const path = match[3].replace(/"/g, "");
                const parts = path.split(match[2]);
                folders.push({ path, name: parts[parts.length - 1] || path });
            }
        }

        if (folders.length === 0) {
            folders.push({ path: "INBOX", name: "Inbox" });
        }
        return folders;
    }

    // ── Select mailbox ──
    async select(folder: string): Promise<{ exists: number }> {
        const { untagged, tagged } = await this.command(`SELECT "${folder}"`);
        if (!tagged.includes("OK")) {
            throw new Error(`Cannot select folder: ${folder}`);
        }
        let exists = 0;
        for (const line of untagged) {
            const m = line.match(/\* (\d+) EXISTS/);
            if (m) exists = parseInt(m[1]);
        }
        return { exists };
    }

    // ── Search ──
    async search(criteria: string = "ALL"): Promise<number[]> {
        const { untagged, tagged } = await this.command(`UID SEARCH ${criteria}`);
        if (!tagged.includes("OK")) return [];

        const uids: number[] = [];
        for (const line of untagged) {
            // * SEARCH 1 2 3 4 5
            const m = line.match(/\* SEARCH (.+)/);
            if (m) {
                const nums = m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
                uids.push(...nums);
            }
        }
        return uids;
    }

    // ── Fetch mail headers + body ──
    async fetchMails(uids: number[]): Promise<RawMailItem[]> {
        if (uids.length === 0) return [];

        const mails: RawMailItem[] = [];
        const uidRange = uids.join(",");

        // Fetch ENVELOPE + FLAGS + BODYSTRUCTURE + BODY[TEXT]
        const tag = this.nextTag();
        const cmd = `${tag} UID FETCH ${uidRange} (UID FLAGS ENVELOPE BODY.PEEK[TEXT]<0.5000>)\r\n`;

        return new Promise((resolve, reject) => {
            let fullResponse = "";
            const timeout = setTimeout(() => {
                this.resolveData = null;
                resolve(mails); // Return whatever we have
            }, 45000);

            this.resolveData = (chunk: string) => {
                fullResponse += chunk;

                if (fullResponse.includes(`${tag} OK`) || fullResponse.includes(`${tag} NO`)) {
                    clearTimeout(timeout);
                    this.resolveData = null;

                    // Parse each FETCH response block
                    const fetchBlocks = fullResponse.split(/\* \d+ FETCH/);

                    for (const block of fetchBlocks) {
                        if (!block.trim()) continue;

                        try {
                            const mail = this.parseFetchBlock(block);
                            if (mail) mails.push(mail);
                        } catch (e) {
                            // Skip malformed blocks
                        }
                    }

                    resolve(mails);
                }
            };

            this.sock?.write(cmd);
        });
    }

    private parseFetchBlock(block: string): RawMailItem | null {
        // Extract UID
        const uidMatch = block.match(/UID (\d+)/);
        if (!uidMatch) return null;
        const uid = parseInt(uidMatch[1]);

        // Extract FLAGS
        const flagsMatch = block.match(/FLAGS \(([^)]*)\)/);
        const flags = flagsMatch ? flagsMatch[1].split(/\s+/).filter(Boolean) : [];

        // Extract ENVELOPE
        const envMatch = block.match(new RegExp('ENVELOPE \\((.+?)\\)\\s*(?:BODY|$)', 's'));
        let subject = "(No Subject)";
        let date = new Date().toISOString();
        let from = { name: "", address: "" };
        let to: { name: string; address: string }[] = [];
        let messageId = `uid-${uid}`;

        if (envMatch) {
            const envStr = envMatch[1];
            // Parse date (first quoted string)
            const dateMatch = envStr.match(/^"([^"]*?)"/);
            if (dateMatch) {
                try { date = new Date(dateMatch[1]).toISOString(); } catch { }
            }
            // Parse subject (second quoted string or NIL)
            const subjMatch = envStr.match(/^"[^"]*"\s+"?([^"]*)"?/);
            if (subjMatch && subjMatch[1] !== "NIL") {
                subject = subjMatch[1];
            }
        }

        // Extract body text
        const bodyMatch = block.match(/BODY\[TEXT\]<0>\s*\{(\d+)\}\r?\n([\s\S]*?)$/);
        let body = "";
        if (bodyMatch) {
            body = bodyMatch[2].substring(0, parseInt(bodyMatch[1]));
        } else {
            // Try simpler pattern
            const simpleBody = block.match(/BODY\[TEXT\]\s+"?([\s\S]*?)"?\s*\)/);
            if (simpleBody) body = simpleBody[1];
        }

        // Clean up body — decode QP, strip HTML, normalise whitespace
        body = this.decodeAndClean(body);

        return {
            uid,
            seq: 0,
            flags,
            from,
            to,
            subject,
            date,
            messageId,
            body,
            hasAttachments: block.includes("attachment") || block.includes("ATTACHMENT"),
        };
    }

    // ── Decode QP + strip HTML + normalise ──
    private decodeAndClean(raw: string): string {
        if (!raw) return raw;
        let d = raw;

        // QP soft line-breaks
        d = d.replace(/=[ \t]*\r?\n/g, "");

        // QP hex codes
        const hexHits = d.match(/=([0-9A-Fa-f]{2})/g);
        if (hexHits && hexHits.length >= 1) {
            try {
                d = decodeURIComponent(d.replace(/=([0-9A-Fa-f]{2})/g, "%$1"));
            } catch {
                d = d.replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
                    String.fromCharCode(parseInt(h, 16)),
                );
            }
        }

        // Strip HTML
        d = d
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&#?[a-zA-Z0-9]+;/g, " ");

        // Whitespace
        d = d
            .replace(/\r\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();

        return d.substring(0, 5000);
    }

    // ── Logout ──
    async logout(): Promise<void> {
        try {
            await this.command("LOGOUT");
        } catch { } finally {
            this.sock?.destroy();
            this.sock = null;
        }
    }
}
