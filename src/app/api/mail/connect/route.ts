// ===================================================================
// Mail Connect API — Validates IMAP credentials
// POST /api/mail/connect
// Body: { host, port, email, password }
// Returns: { success, folders[] } or { error }
//
// Uses ImapFlow first; if that fails with "Command failed",
// falls back to raw TLS LOGIN for maximal compatibility
// (handles Perdition proxies, university servers, etc.)
// ===================================================================

import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import * as tls from "tls";
import * as net from "net";

export const maxDuration = 30;

// ─── Raw IMAP LOGIN via TLS (fallback for Perdition proxies) ───
function rawImapLogin(
    host: string,
    port: number,
    user: string,
    pass: string,
): Promise<{ success: boolean; greeting: string; loginResponse: string }> {
    return new Promise((resolve) => {
        let step = 0;
        let greeting = "";
        let loginResp = "";
        const timeout = setTimeout(() => {
            sock.destroy();
            resolve({ success: false, greeting, loginResponse: "Connection timed out" });
        }, 15000);

        const connectOpts: tls.ConnectionOptions = {
            host,
            port,
            rejectUnauthorized: false,
        };

        const sock = port === 993
            ? tls.connect(connectOpts, () => { /* connected */ })
            : (() => {
                const raw = net.connect({ host, port }, () => { /* connected */ });
                return raw;
            })();

        sock.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (step === 0 && line.includes("* OK")) {
                greeting = line;
                step = 1;
                // Escape password for IMAP literal (handle special chars)
                const escapedPass = `"${pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
                const escapedUser = `"${user.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
                sock.write(`A001 LOGIN ${escapedUser} ${escapedPass}\r\n`);
            } else if (step === 1) {
                loginResp = line;
                clearTimeout(timeout);
                const success = line.includes("A001 OK");
                // Try to logout gracefully
                if (success) {
                    sock.write("A002 LOGOUT\r\n");
                    setTimeout(() => sock.destroy(), 500);
                } else {
                    sock.destroy();
                }
                resolve({ success, greeting, loginResponse: line });
            }
        });

        sock.on("error", (err: Error) => {
            clearTimeout(timeout);
            resolve({ success: false, greeting, loginResponse: `Socket error: ${err.message}` });
        });
    });
}

export async function POST(request: NextRequest) {
    let host = "";
    let port = 993;

    try {
        const body = await request.json();
        host = body.host || "";
        port = Number(body.port) || 993;
        const email = body.email || "";
        const password = body.password || "";

        if (!host || !email || !password) {
            return NextResponse.json(
                { error: "Missing required fields: host, port, email, password" },
                { status: 400 }
            );
        }

        console.log(`[MAIL CONNECT] Attempting ${host}:${port} as ${email}`);

        // ── Strategy 1: ImapFlow (works for most servers) ──
        try {
            const client = new ImapFlow({
                host,
                port,
                secure: port === 993,
                auth: { user: email, pass: password },
                logger: false,
                tls: {
                    rejectUnauthorized: false,
                    minVersion: "TLSv1.2" as any,
                },
                connectionTimeout: 15000,
                greetingTimeout: 10000,
            } as any);

            client.on("error", (err: Error) => {
                console.warn("[MAIL CONNECT] ImapFlow event:", err.message);
            });

            await client.connect();
            console.log(`[MAIL CONNECT] ImapFlow connected to ${host}`);

            let folders: any[] = [];
            try {
                const mailboxes = await client.list();
                folders = mailboxes.map((mb: any) => ({
                    path: mb.path,
                    name: mb.name,
                    delimiter: mb.delimiter,
                    flags: mb.flags ? Array.from(mb.flags) : [],
                    specialUse: mb.specialUse || null,
                }));
            } catch {
                folders = [{ path: "INBOX", name: "Inbox", delimiter: "/", flags: [], specialUse: null }];
            }

            await client.logout();
            return NextResponse.json({ success: true, folders });

        } catch (imapFlowErr: any) {
            console.warn(`[MAIL CONNECT] ImapFlow failed: ${imapFlowErr.message}. Trying raw LOGIN...`);

            // ── Strategy 2: Raw TLS LOGIN (Perdition / minimal servers) ──
            const rawResult = await rawImapLogin(host, port, email, password);
            console.log(`[MAIL CONNECT] Raw LOGIN result:`, rawResult);

            if (rawResult.success) {
                // Raw login worked! Use ImapFlow for actual operations
                // but we know creds are valid
                return NextResponse.json({
                    success: true,
                    folders: [
                        { path: "INBOX", name: "Inbox", delimiter: "/", flags: [], specialUse: null },
                    ],
                });
            }

            // Both strategies failed — give the user a detailed error
            const loginResp = rawResult.loginResponse;
            let userMessage: string;

            if (loginResp.includes("Authentication Failure") || loginResp.includes("NO LOGIN") || loginResp.includes("AUTHENTICATIONFAILED")) {
                userMessage = `Authentication failed for ${email} on ${host}. Your password was rejected by the server. Verify:\n• Your email address is in the correct format\n• Your password is correct (try logging into webmail first)\n• IMAP access is enabled in your mail account settings`;
            } else if (loginResp.includes("timed out")) {
                userMessage = `Connection timed out to ${host}:${port}. Server may be unreachable.`;
            } else if (loginResp.includes("Socket error")) {
                userMessage = `Network error connecting to ${host}: ${loginResp}`;
            } else {
                userMessage = `Login failed on ${host}: ${loginResp}`;
            }

            return NextResponse.json({ error: userMessage }, { status: 500 });
        }

    } catch (error: any) {
        console.error("[MAIL CONNECT] Outer error:", error.message);
        return NextResponse.json(
            { error: error.message || "Connection failed" },
            { status: 500 }
        );
    }
}
