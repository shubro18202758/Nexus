// ===================================================================
// /api/channels — CRUD for channel_settings (Life Ops pipeline)
//
// GET  → List all channels (for the Channel Manager UI)
// PATCH → Update a channel's type or is_active status
// ===================================================================

import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";
import { channelSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── GET: List all channels ──────────────────────────────────────
export async function GET() {
    try {
        const channels = await serverDb
            .select()
            .from(channelSettings)
            .orderBy(channelSettings.createdAt);

        return NextResponse.json({ channels });
    } catch (error) {
        console.error("[Channels API] GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch channels" },
            { status: 500 }
        );
    }
}

// ─── PATCH: Update a channel's type or active status ─────────────
export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, type, isActive } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Missing channel id" },
                { status: 400 }
            );
        }

        const updates: Record<string, unknown> = {};
        if (type !== undefined) updates.type = type;
        if (isActive !== undefined) updates.isActive = isActive;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: "No fields to update" },
                { status: 400 }
            );
        }

        const [updated] = await serverDb
            .update(channelSettings)
            .set(updates)
            .where(eq(channelSettings.id, id))
            .returning();

        if (!updated) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 }
            );
        }

        console.log(
            `[Channels API] Updated "${updated.name}": type=${updated.type}, active=${updated.isActive}`
        );

        return NextResponse.json({ channel: updated });
    } catch (error) {
        console.error("[Channels API] PATCH error:", error);
        return NextResponse.json(
            { error: "Failed to update channel" },
            { status: 500 }
        );
    }
}
