// ===================================================================
// Mail Search API — Server-side IMAP search
// POST /api/mail/search
// Body: { host, port, email, password, folder, query }
// Returns: { uids: number[] }
// ===================================================================

import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
    try {
        const {
            host, port, email, password,
            folder = "INBOX",
            query = {},
        } = await request.json();

        if (!host || !port || !email || !password) {
            return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
        }

        const client = new ImapFlow({
            host,
            port: Number(port),
            secure: Number(port) === 993,
            auth: { user: email, pass: password },
            logger: false,
            tls: {
                rejectUnauthorized: false,
                minVersion: "TLSv1.2" as any,
            },
            connectionTimeout: 15000,
        } as any);

        await client.connect();
        const lock = await client.getMailboxLock(folder);

        let uids: number[] = [];

        try {
            const criteria: any = {};

            if (query.from) criteria.from = query.from;
            if (query.subject) criteria.subject = query.subject;
            if (query.since) criteria.since = new Date(query.since);
            if (query.unseen) criteria.unseen = true;
            if (query.text) criteria.body = query.text;

            const result = await client.search(criteria, { uid: true });
            uids = Array.isArray(result) ? result : [];
        } finally {
            lock.release();
        }

        await client.logout();

        return NextResponse.json({ uids: uids.sort((a: number, b: number) => b - a) });
    } catch (error: any) {
        console.error("[MAIL SEARCH]", error.message);
        return NextResponse.json(
            { error: error.message || "Search failed" },
            { status: 500 }
        );
    }
}
