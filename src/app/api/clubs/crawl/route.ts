import { NextRequest } from "next/server";
import { runNexusPipeline } from "@/lib/agent/nexus-agent";
import { serverDb } from "@/lib/server-db";
import { clubs, clubKnowledge, clubEventAggregates, iitRegistry } from "@/db/schema";
import { IIT_SEED_REGISTRY } from "@/lib/agent/iit-registry";
import { ensureTablesExist } from "@/lib/server-db";
import type { IITId } from "@/lib/agent/iit-registry";
import { eq, and, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    iitIds = IIT_SEED_REGISTRY.map((i) => i.id),
    maxClubsPerIIT = 10,
    preview = false,
    stages = ["discovery", "profile", "knowledge"],
  } = body as { iitIds?: string[]; maxClubsPerIIT?: number; preview?: boolean; stages?: string[] };

  await ensureTablesExist();
  await seedIITRegistry();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: "connected", message: "Nexus pipeline starting..." });

      try {
        const pipeline = runNexusPipeline({
          iitIds: iitIds as IITId[],
          maxClubsPerIIT,
          preview,
          stages: stages as ("discovery" | "profile" | "knowledge" | "embed")[],
        });

        for await (const event of pipeline) {
          send(event);

          if (!preview && event.type === "result" && event.stage === "knowledge") {
            const clubEntry = event.data as {
              link: { name: string; url: string; iitId: string };
              profile?: { profile: Record<string, unknown>; events: Record<string, unknown>[]; sourceUrl: string };
              knowledge?: { knowledgeItems: Record<string, unknown>[]; summary: string };
            };

            try {
              const savedId = await persistClub(clubEntry);
              send({ type: "persisted", clubName: clubEntry.link.name, clubId: savedId, message: `✅ Saved ${clubEntry.link.name}` });
            } catch (err) {
              send({ type: "error", clubName: clubEntry.link.name, message: `Save failed: ${String(err)}` });
            }
          }
        }

        send({ type: "complete", message: "Nexus pipeline finished successfully" });
      } catch (err) {
        send({ type: "fatal_error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const iitId = searchParams.get("iitId");
  const category = searchParams.get("category");
  const limit = parseInt(searchParams.get("limit") ?? "200");

  try {
    const conditions = [];
    if (iitId) conditions.push(eq(clubs.iitId, iitId));
    if (category && category !== "all") conditions.push(eq(clubs.category, category));

    const results = await serverDb
      .select()
      .from(clubs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .orderBy(sql`${clubs.updatedAt} desc`);

    return Response.json({ clubs: results, total: results.length });
  } catch (err) {
    console.error("Club list error:", err);
    return Response.json({ clubs: [], total: 0 });
  }
}

async function seedIITRegistry() {
  for (const iit of IIT_SEED_REGISTRY) {
    await serverDb.insert(iitRegistry).values({
      id: iit.id,
      fullName: iit.fullName,
      city: iit.city,
      clubDirectoryUrl: iit.clubDirectoryUrl,
    }).onConflictDoNothing().catch(() => {});
  }
}

async function persistClub(clubEntry: {
  link: { name: string; url: string; iitId: string };
  profile?: { profile: Record<string, unknown>; events: Record<string, unknown>[]; sourceUrl: string };
  knowledge?: { knowledgeItems: Record<string, unknown>[]; summary: string };
}): Promise<string> {
  const p = clubEntry.profile?.profile ?? {};
  const clubName = String(p.name ?? clubEntry.link.name);
  const iitId = clubEntry.link.iitId;

  // Check if club already exists
  const existing = await serverDb
    .select({ id: clubs.id })
    .from(clubs)
    .where(and(eq(clubs.name, clubName), eq(clubs.iitId, iitId)))
    .limit(1);

  let clubId: string;

  if (existing.length > 0) {
    clubId = existing[0].id;
    await serverDb.update(clubs)
      .set({
        shortName: p.shortName ? String(p.shortName) : null,
        description: String(p.description ?? clubEntry.knowledge?.summary ?? ""),
        tagline: String(p.tagline ?? ""),
        websiteUrl: clubEntry.link.url || String(p.websiteUrl ?? ""),
        instagramUrl: String(p.instagramUrl ?? ""),
        linkedinUrl: String(p.linkedinUrl ?? ""),
        githubUrl: String(p.githubUrl ?? ""),
        email: String(p.email ?? ""),
        logoUrl: p.logoUrl ? String(p.logoUrl) : null,
        coverImageUrl: p.coverImageUrl ? String(p.coverImageUrl) : null,
        tags: Array.isArray(p.tags) ? p.tags : [],
        memberCount: p.memberCount ? Number(p.memberCount) : null,
        foundedYear: p.foundedYear ? Number(p.foundedYear) : null,
        isRecruiting: p.isRecruiting ? "true" : "false",
        crawlStatus: "done",
        lastCrawledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, clubId));

    await serverDb.delete(clubKnowledge).where(eq(clubKnowledge.clubId, clubId)).catch(() => {});
    await serverDb.delete(clubEventAggregates).where(eq(clubEventAggregates.clubId, clubId)).catch(() => {});
  } else {
    const [inserted] = await serverDb.insert(clubs).values({
      iitId,
      name: clubName,
      shortName: p.shortName ? String(p.shortName) : null,
      category: String(p.category ?? "other"),
      description: String(p.description ?? clubEntry.knowledge?.summary ?? ""),
      tagline: String(p.tagline ?? ""),
      websiteUrl: clubEntry.link.url || String(p.websiteUrl ?? ""),
      instagramUrl: String(p.instagramUrl ?? ""),
      linkedinUrl: String(p.linkedinUrl ?? ""),
      githubUrl: String(p.githubUrl ?? ""),
      email: String(p.email ?? ""),
      logoUrl: p.logoUrl ? String(p.logoUrl) : null,
      coverImageUrl: p.coverImageUrl ? String(p.coverImageUrl) : null,
      tags: Array.isArray(p.tags) ? p.tags : [],
      memberCount: p.memberCount ? Number(p.memberCount) : null,
      foundedYear: p.foundedYear ? Number(p.foundedYear) : null,
      isRecruiting: p.isRecruiting ? "true" : "false",
      crawlStatus: "done",
      lastCrawledAt: new Date(),
      crawlSource: clubEntry.profile?.sourceUrl ?? "",
    }).returning({ id: clubs.id });

    clubId = inserted.id;
  }

  // Save knowledge items
  for (const item of clubEntry.knowledge?.knowledgeItems ?? []) {
    await serverDb.insert(clubKnowledge).values({
      clubId,
      knowledgeType: String(item.knowledgeType ?? "other"),
      title: String(item.title),
      content: String(item.content),
      sourceUrl: String(item.sourceUrl ?? ""),
      confidence: String(Number(item.confidence ?? 0.7).toFixed(2)),
      structuredData: {},
    }).catch(() => {});
  }

  // Save events
  for (const ev of clubEntry.profile?.events ?? []) {
    const e = ev as Record<string, unknown>;
    await serverDb.insert(clubEventAggregates).values({
      clubId,
      title: String(e.title ?? "Event"),
      description: String(e.description ?? ""),
      eventType: String(e.eventType ?? "event"),
      registrationUrl: String(e.registrationUrl ?? ""),
      rawText: JSON.stringify(e),
    }).catch(() => {});
  }

  return clubId;
}
