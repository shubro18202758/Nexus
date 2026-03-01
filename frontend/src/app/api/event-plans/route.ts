import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";
import { eventPlans, events } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// ─── GET /api/event-plans?eventId=xxx ────────────────────────────
// Returns the plan for a specific event (if any).
export async function GET(req: NextRequest) {
    try {
        const eventId = req.nextUrl.searchParams.get("eventId");
        if (!eventId) {
            return NextResponse.json(
                { error: "Missing eventId query parameter" },
                { status: 400 }
            );
        }

        const rows = await serverDb
            .select()
            .from(eventPlans)
            .where(eq(eventPlans.eventId, eventId))
            .limit(1);

        if (rows.length === 0) {
            return NextResponse.json({ plan: null });
        }

        return NextResponse.json({ plan: rows[0] });
    } catch (error) {
        console.error("[event-plans GET] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch event plan", details: String(error) },
            { status: 500 }
        );
    }
}

// ─── PATCH /api/event-plans ──────────────────────────────────────
// Update generatedPlan JSON (task completion, DnD reorder) and progress.
// Body: { eventId: string, generatedPlan?: PlanDay[], progress?: number, isLocked?: boolean }
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { eventId, generatedPlan, progress, isLocked } = body;

        if (!eventId) {
            return NextResponse.json(
                { error: "Missing eventId" },
                { status: 400 }
            );
        }

        // Build set clause dynamically
        const setClause: Record<string, unknown> = { updatedAt: new Date() };
        if (generatedPlan !== undefined) setClause.generatedPlan = generatedPlan;
        if (progress !== undefined) setClause.progress = progress;
        if (isLocked !== undefined) setClause.isLocked = isLocked;

        const [updated] = await serverDb
            .update(eventPlans)
            .set(setClause)
            .where(eq(eventPlans.eventId, eventId))
            .returning();

        if (!updated) {
            return NextResponse.json(
                { error: "Plan not found for this event" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, plan: updated });
    } catch (error) {
        console.error("[event-plans PATCH] Error:", error);
        return NextResponse.json(
            { error: "Failed to update event plan", details: String(error) },
            { status: 500 }
        );
    }
}
