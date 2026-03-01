import { serverDb } from "@/lib/server-db";
import { clubs, clubKnowledge, clubEventAggregates, iitRegistry } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/clubs/stats — Aggregated Nexus statistics
 */
export async function GET() {
  try {
    // Total clubs
    const [clubCount] = await serverDb
      .select({ count: sql<number>`count(*)::int` })
      .from(clubs);

    // Total knowledge items
    const [knowledgeCount] = await serverDb
      .select({ count: sql<number>`count(*)::int` })
      .from(clubKnowledge);

    // Total events
    const [eventCount] = await serverDb
      .select({ count: sql<number>`count(*)::int` })
      .from(clubEventAggregates);

    // Clubs by category
    const byCategory = await serverDb
      .select({
        category: clubs.category,
        count: sql<number>`count(*)::int`,
      })
      .from(clubs)
      .groupBy(clubs.category)
      .orderBy(sql`count(*) desc`);

    // Clubs by IIT
    const byIIT = await serverDb
      .select({
        iitId: clubs.iitId,
        count: sql<number>`count(*)::int`,
      })
      .from(clubs)
      .groupBy(clubs.iitId)
      .orderBy(sql`count(*) desc`);

    // IIT registry
    const iits = await serverDb.select().from(iitRegistry);

    // Recently crawled
    const recentClubs = await serverDb
      .select({
        id: clubs.id,
        name: clubs.name,
        iitId: clubs.iitId,
        category: clubs.category,
        lastCrawledAt: clubs.lastCrawledAt,
      })
      .from(clubs)
      .orderBy(sql`${clubs.lastCrawledAt} desc nulls last`)
      .limit(10);

    return Response.json({
      totalClubs: clubCount.count,
      totalKnowledge: knowledgeCount.count,
      totalEvents: eventCount.count,
      byCategory,
      byIIT,
      iits,
      recentClubs,
    });
  } catch (err) {
    console.error("Stats error:", err);
    return Response.json({
      totalClubs: 0,
      totalKnowledge: 0,
      totalEvents: 0,
      byCategory: [],
      byIIT: [],
      iits: [],
      recentClubs: [],
    });
  }
}
