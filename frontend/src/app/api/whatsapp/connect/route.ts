// ===================================================================
// WhatsApp Connect API — Session lifecycle management
//
// POST /api/whatsapp/connect   → Initialize WA session (returns QR)
// GET  /api/whatsapp/connect   → Get session status / QR code
// DELETE /api/whatsapp/connect → Disconnect session
//
// IMPORTANT: Both GET and POST return { state: {...}, groups: [...] }
// so the frontend store can parse them uniformly.
// ===================================================================

import { NextResponse } from "next/server";
import { getWASession } from "@/lib/msg/wa-session";

export const dynamic = "force-dynamic";

function buildQrDataUrl(rawQr: string | null): string | null {
    if (!rawQr) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(rawQr)}`;
}

/** GET — Returns current session status including QR if pending */
export async function GET() {
    try {
        const session = getWASession();
        const raw = session.getState();
        const groups = session.getGroups();

        return NextResponse.json({
            state: {
                status: raw.status,
                qrCode: raw.qrCode,
                qrDataUrl: buildQrDataUrl(raw.qrCode),
                connectedPhone: raw.connectedPhone,
                messageCount: raw.messageCount,
                lastMessageAt: raw.lastMessageAt,
                groupCount: raw.groupCount,
                error: raw.error,
                uptime: raw.uptime,
            },
            groups,
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to get session status", details: String(error) },
            { status: 500 },
        );
    }
}

/** POST — Start WhatsApp session (triggers QR generation) */
export async function POST() {
    try {
        const session = getWASession();
        const current = session.getState();

        // Already ready — no-op
        if (current.status === "ready") {
            return NextResponse.json({
                state: {
                    ...current,
                    qrDataUrl: null,
                },
                groups: session.getGroups(),
            });
        }

        // Trigger init (non-blocking — QR will arrive async via Puppeteer)
        session.initialize().catch((err) => {
            console.error("[WA-Connect] Init error:", err);
        });

        // Give Puppeteer 4 seconds to start and generate QR
        await new Promise((r) => setTimeout(r, 4000));

        const updated = session.getState();
        return NextResponse.json({
            state: {
                status: updated.status,
                qrCode: updated.qrCode,
                qrDataUrl: buildQrDataUrl(updated.qrCode),
                connectedPhone: updated.connectedPhone,
                messageCount: updated.messageCount,
                lastMessageAt: updated.lastMessageAt,
                groupCount: updated.groupCount,
                error: updated.error,
                uptime: updated.uptime,
            },
            groups: session.getGroups(),
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to initialize session", details: String(error) },
            { status: 500 },
        );
    }
}

/** DELETE — Disconnect WhatsApp session */
export async function DELETE() {
    try {
        const session = getWASession();
        await session.disconnect();
        return NextResponse.json({ success: true, message: "Session disconnected" });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to disconnect", details: String(error) },
            { status: 500 },
        );
    }
}
