// ===================================================================
// WhatsApp Adaptive Planner API — Auto-generate event plans
//
// POST /api/whatsapp/plan → Creates events + plans from detected events
// ===================================================================

import { NextResponse } from "next/server";
import { generateAdaptivePlan, type DetectedEvent } from "@/lib/msg/adaptive-planner";
import { serverDb } from "@/lib/server-db";
import { events, eventPlans } from "@/db/schema";

export const dynamic = "force-dynamic";

/** POST — Create events + adaptive plans from detected event data */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { detectedEvents } = body;

        if (!Array.isArray(detectedEvents) || detectedEvents.length === 0) {
            return NextResponse.json(
                { error: "Provide a non-empty 'detectedEvents' array" },
                { status: 400 },
            );
        }

        const created: Array<{ event: any; plan: any }> = [];
        const errors: string[] = [];

        for (const det of detectedEvents as DetectedEvent[]) {
            try {
                // Map NanoClaw category to DB event_category enum
                const validCategories = ["exam", "assignment", "hackathon", "workshop", "contest", "internship", "social", "noise"] as const;
                type EventCategory = typeof validCategories[number];
                const dbCategory: EventCategory | null = det.category && validCategories.includes(det.category as EventCategory)
                    ? (det.category as EventCategory)
                    : null;

                // 1. Create event in DB
                const [newEvent] = await serverDb
                    .insert(events)
                    .values({
                        title: det.title,
                        description: det.description || "",
                        eventDate: det.eventDate ? new Date(det.eventDate) : null,
                        deadline: det.deadline ? new Date(det.deadline) : null,
                        location: det.location || null,
                        category: dbCategory,
                        source: "WhatsApp",
                        url: det.url || null,
                        priority: det.priority ?? null,
                        rawContext: det.rawContext || `[nanoclaw] ${det.title}`,
                        metadata: {
                            createdBy: "nanoclaw",
                            chatName: det.chatName || null,
                            authorName: det.authorName || null,
                            detectedAt: new Date().toISOString(),
                            confidence: det.confidence || 0,
                            originalCategory: det.category, // Preserve the NanoClaw category
                        },
                        status: "Detected",
                    })
                    .returning();

                // 2. Generate adaptive plan via AI
                let plan: any = null;
                if (det.eventDate) {
                    try {
                        const generatedPlan = await generateAdaptivePlan(det);
                        const [newPlan] = await serverDb
                            .insert(eventPlans)
                            .values({
                                eventId: newEvent.id,
                                generatedPlan,
                                progress: 0,
                                isLocked: false,
                            })
                            .returning();
                        plan = newPlan;
                    } catch (planErr) {
                        console.warn(`[Planner] Plan gen failed for "${det.title}":`, planErr);
                    }
                }

                created.push({ event: newEvent, plan });
            } catch (err) {
                const msg = `Failed to create event "${det.title}": ${String(err)}`;
                errors.push(msg);
                console.error("[Planner]", msg);
            }
        }

        return NextResponse.json({
            success: true,
            created,
            errors: errors.length > 0 ? errors : undefined,
            eventsCreated: created.length,
            plansGenerated: created.filter((c) => c.plan !== null).length,
        });
    } catch (error) {
        console.error("[Planner API] Error:", error);
        return NextResponse.json(
            { error: "Adaptive planner failed", details: String(error) },
            { status: 500 },
        );
    }
}
