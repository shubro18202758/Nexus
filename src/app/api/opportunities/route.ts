import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";
import { opportunities } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
    try {
        const rows = await serverDb
            .select()
            .from(opportunities)
            .orderBy(desc(opportunities.createdAt));

        return NextResponse.json({ opportunities: rows });
    } catch (error) {
        console.error("Failed to fetch opportunities:", error);
        return NextResponse.json({ opportunities: [] });
    }
}

export async function PATCH(req: Request) {
    try {
        const { id, status } = await req.json();

        await serverDb
            .update(opportunities)
            .set({ status })
            .where(eq(opportunities.id, id));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to update opportunity:", error);
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
