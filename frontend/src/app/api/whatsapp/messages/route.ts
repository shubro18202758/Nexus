// ===================================================================
// WhatsApp Messages API — Fetch + Filter messages from session
//
// GET  /api/whatsapp/messages → Get buffered messages (with filters)
// POST /api/whatsapp/messages → Run NanoClaw AI filter on messages
// ===================================================================

import { NextResponse } from "next/server";
import { getWASession } from "@/lib/msg/wa-session";

export const dynamic = "force-dynamic";

/** GET — Fetch raw messages from the session buffer */
export async function GET(req: Request) {
    try {
        const session = getWASession();
        const state = session.getState();

        if (state.status !== "ready" && state.messageCount === 0) {
            return NextResponse.json({
                messages: [],
                groups: [],
                status: state.status,
                info: "WhatsApp session not connected. Connect via /api/whatsapp/connect first.",
            });
        }

        const { searchParams } = new URL(req.url);
        const since = searchParams.get("since");
        const groupOnly = searchParams.get("groupOnly") === "true";
        const chatId = searchParams.get("chatId");
        const limit = searchParams.get("limit");
        const search = searchParams.get("search");

        // 24h threshold is enforced server-side in getMessages() automatically
        const messages = session.getMessages({
            since: since ? Number(since) : undefined,
            groupOnly: groupOnly || undefined,
            chatId: chatId || undefined,
            limit: limit ? Number(limit) : 200,
            search: search || undefined,
        });

        return NextResponse.json({
            messages,
            groups: session.getGroups(),
            status: state.status,
            totalBuffered: state.messageCount,
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to fetch messages", details: String(error) },
            { status: 500 },
        );
    }
}

/** POST — Ingest external messages into session buffer (for history import) */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { messages } = body;

        if (!Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: "Provide a non-empty 'messages' array" },
                { status: 400 },
            );
        }

        const session = getWASession();

        // Normalise external messages into WAMessage format
        const normalised = messages.map((m: any, i: number) => ({
            id: m.id || `ext-${Date.now()}-${i}`,
            from: m.from || "external",
            chatName: m.chatName || m.groupName || "Unknown",
            chatId: m.chatId || m.groupId || "external",
            body: m.body || m.text || m.content || "",
            timestamp: m.timestamp
                ? typeof m.timestamp === "string"
                    ? new Date(m.timestamp).getTime()
                    : m.timestamp
                : Date.now(),
            isGroup: m.isGroup ?? true,
            authorName: m.authorName || m.sender || undefined,
            hasMedia: m.hasMedia ?? false,
            urls: m.urls || [],
        }));

        session.ingestMessages(normalised);

        return NextResponse.json({
            success: true,
            ingested: normalised.length,
            totalBuffered: session.getState().messageCount,
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to ingest messages", details: String(error) },
            { status: 500 },
        );
    }
}
