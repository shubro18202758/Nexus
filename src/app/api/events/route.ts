import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";
import { events } from "@/db/schema";
import { desc, eq, gte, lte, and } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const start = searchParams.get("start"); // YYYY-MM-DD
        const end = searchParams.get("end");     // YYYY-MM-DD

        const conditions = [];
        if (start) {
            conditions.push(gte(events.eventDate, new Date(start)));
        }
        if (end) {
            conditions.push(lte(events.eventDate, new Date(end)));
        }

        const query = serverDb
            .select()
            .from(events);

        const allEvents = conditions.length > 0
            ? await query.where(and(...conditions)).orderBy(desc(events.createdAt))
            : await query.orderBy(desc(events.createdAt));

        return NextResponse.json({ events: allEvents });
    } catch (error) {
        console.error("Fetch Events Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch events", details: String(error) },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            title,
            description,
            date,
            startDate,
            time,
            location,
            category,
            source: eventSource,
            eventType,
            url,
            priority,
            metadata,
        } = body;

        if (!title) {
            return NextResponse.json(
                { error: "Missing required field: title" },
                { status: 400 }
            );
        }

        // Build eventDate from date + optional time
        const dateStr = date || startDate;
        let eventDate: Date | null = null;
        if (dateStr) {
            if (time) {
                eventDate = new Date(`${dateStr}T${time}`);
            } else {
                eventDate = new Date(dateStr);
            }
        }

        const [created] = await serverDb
            .insert(events)
            .values({
                title,
                description: description || "",
                eventDate,
                location: location || null,
                category: category || null,
                source: eventSource || "WhatsApp",
                url: url || null,
                priority: priority || null,
                rawContext: body.rawContext || `[nanobot] ${title}`,
                metadata: metadata || { createdBy: "nanobot", eventType: eventType || "calendar" },
                status: "Detected",
            })
            .returning();

        return NextResponse.json({ success: true, event: created }, { status: 201 });
    } catch (error) {
        console.error("Create Event Error:", error);
        return NextResponse.json(
            { error: "Failed to create event", details: String(error) },
            { status: 500 }
        );
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, status } = body;

        if (!id || !status) {
            return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
        }

        const [updatedEvent] = await serverDb
            .update(events)
            .set({ status })
            .where(eq(events.id, id))
            .returning();

        return NextResponse.json({ success: true, event: updatedEvent });
    } catch (error) {
        console.error("Update Event Error:", error);
        return NextResponse.json(
            { error: "Failed to update event", details: String(error) },
            { status: 500 }
        );
    }
}
