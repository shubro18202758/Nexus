import { NextRequest } from "next/server";
import { runComparisonAgent } from "@/lib/agent/nexus-agent";
import { serverDb } from "@/lib/server-db";
import { clubs, clubKnowledge } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/clubs/compare — Multi-agent club comparison
 * Accepts 2-4 club IDs and returns structured comparison analysis
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { clubIds } = body as { clubIds?: string[] };

    if (!clubIds || !Array.isArray(clubIds) || clubIds.length < 2 || clubIds.length > 4) {
      return Response.json(
        { error: "Provide 2-4 club IDs to compare" },
        { status: 400 }
      );
    }

    // Fetch clubs
    const matchedClubs = await serverDb
      .select()
      .from(clubs)
      .where(inArray(clubs.id, clubIds));

    if (matchedClubs.length < 2) {
      return Response.json(
        { error: "Not enough clubs found" },
        { status: 404 }
      );
    }

    // Fetch associated knowledge
    const knowledge = await serverDb
      .select()
      .from(clubKnowledge)
      .where(inArray(clubKnowledge.clubId, clubIds));

    // Build comparison context
    const clubsData = matchedClubs.map((c) => ({
      name: c.name,
      iitId: c.iitId,
      category: c.category ?? "other",
      description: c.description ?? "",
      tags: (c.tags ?? []) as string[],
      memberCount: c.memberCount ?? undefined,
    }));

    // Build knowledge context as array for comparison agent
    const knowledgeContext = knowledge.map((k) => {
      const club = matchedClubs.find((c) => c.id === k.clubId);
      return {
        clubName: club?.name ?? "Unknown",
        iitId: club?.iitId ?? "",
        content: k.content ?? "",
        knowledgeType: k.knowledgeType ?? "general",
      };
    });

    // Run the comparison agent
    const comparisonResult = await runComparisonAgent(
      matchedClubs.map((c) => c.name).join(" vs "),
      clubsData,
      knowledgeContext
    );

    return Response.json({
      clubs: matchedClubs,
      comparison: comparisonResult,
    });
  } catch (err) {
    console.error("Club comparison error:", err);
    return Response.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
