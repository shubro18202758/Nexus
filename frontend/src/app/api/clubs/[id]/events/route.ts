import { NextRequest } from "next/server";
import { serverDb } from "@/lib/server-db";
import { clubEventAggregates } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const events = await serverDb
      .select()
      .from(clubEventAggregates)
      .where(eq(clubEventAggregates.clubId, id));
    return Response.json({ events });
  } catch (err) {
    console.error("Events fetch error:", err);
    return Response.json({ events: [] });
  }
}
