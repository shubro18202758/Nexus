import { NextRequest } from "next/server";
import { serverDb } from "@/lib/server-db";
import { clubKnowledge } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const items = await serverDb
      .select()
      .from(clubKnowledge)
      .where(eq(clubKnowledge.clubId, id));
    return Response.json({ items });
  } catch (err) {
    console.error("Knowledge fetch error:", err);
    return Response.json({ items: [] });
  }
}
