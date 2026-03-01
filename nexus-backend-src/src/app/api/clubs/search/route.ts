/**
 * POST /api/clubs/crawl
 * Triggers the Nexus pipeline and streams progress via Server-Sent Events.
 *
 * Body: { iitIds?: string[], maxClubsPerIIT?: number, preview?: boolean }
 *
 * The frontend listens via EventSource and updates a progress UI in real-time.
 * On completion, clubs and knowledge items are written to PGlite.
 */

import { NextRequest } from "next/server";
import { runNexusPipeline } from "@/lib/agent/nexus-agent";
import { serverDb as db } from "@/lib/server-db";
import {
  clubs,
  clubKnowledge,
  clubEventAggregates,
  crawlLogs,
  iitRegistry,
} from "@/db/schema";
import { IIT_SEED_REGISTRY } from "@/lib/agent/iit-registry";
import type { IITId } from "@/lib/agent/iit-registry";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — crawls take time

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    iitIds = ["iitb"],             // Default: IITB only for first run
    maxClubsPerIIT = 20,
    preview = false,
    stages = ["discovery", "profile", "knowledge"],
  } = body as {
    iitIds?: string[];
    maxClubsPerIIT?: number;
    preview?: boolean;
    stages?: string[];
  };

  // Seed IIT registry if not already done
  await seedIITRegistry();

  // Server-Sent Events stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: object) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

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

          // Write to DB when we get a complete club result
          if (!preview && event.type === "result" && event.stage === "knowledge") {
            const clubEntry = event.data as {
              link: { name: string; url: string; iitId: string };
              profile?: {
                profile: Record<string, unknown>;
                events: Record<string, unknown>[];
                sourceUrl: string;
              };
              knowledge?: {
                knowledgeItems: Record<string, unknown>[];
                summary: string;
              };
            };

            try {
              await persistClubToDB(clubEntry);
              send({
                type: "persisted",
                clubName: clubEntry.link.name,
                message: `Saved ${clubEntry.link.name} to database`,
              });
            } catch (err) {
              send({
                type: "error",
                clubName: clubEntry.link.name,
                message: `Failed to save ${clubEntry.link.name}: ${String(err)}`,
              });
            }
          }

          // If preview, send results but don't persist
          if (preview && event.type === "result" && event.stage === "knowledge") {
            send({
              type: "preview_data",
              data: event.data,
            });
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

// GET — List all crawled clubs with optional filters
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const iitId = searchParams.get("iitId");
  const category = searchParams.get("category");
  const recruiting = searchParams.get("recruiting");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const { eq, and, sql } = await import("drizzle-orm");

  const conditions = [];
  if (iitId) conditions.push(eq(clubs.iitId, iitId));
  if (category) conditions.push(eq(clubs.category as unknown as string, category));
  if (recruiting === "true") conditions.push(eq(clubs.isRecruiting, true));

  const results = await db
    .select()
    .from(clubs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset(offset)
    .orderBy(sql`${clubs.updatedAt} desc`);

  return Response.json({ clubs: results, total: results.length });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function seedIITRegistry() {
  for (const iit of IIT_SEED_REGISTRY) {
    await db
      .insert(iitRegistry)
      .values({
        id: iit.id,
        fullName: iit.fullName,
        city: iit.city,
        clubDirectoryUrl: iit.clubDirectoryUrl,
      })
      .onConflictDoNothing();
  }
}

async function persistClubToDB(clubEntry: {
  link: { name: string; url: string; iitId: string };
  profile?: {
    profile: Record<string, unknown>;
    events: Record<string, unknown>[];
    sourceUrl: string;
  };
  knowledge?: {
    knowledgeItems: Record<string, unknown>[];
    summary: string;
  };
}) {
  const { eq } = await import("drizzle-orm");

  const p = clubEntry.profile?.profile ?? {};
  const description = String(p.description ?? "");
  const summary = clubEntry.knowledge?.summary ?? description;

  // Upsert the club
  const [club] = await db
    .insert(clubs)
    .values({
      iitId: clubEntry.link.iitId,
      name: String(p.name ?? clubEntry.link.name),
      shortName: String(p.shortName ?? ""),
      category: (p.category as "technical" | "cultural" | "sports" | "other") ?? "other",
      description: summary || description,
      tagline: String(p.tagline ?? ""),
      websiteUrl: clubEntry.link.url,
      instagramUrl: String(p.instagramUrl ?? ""),
      linkedinUrl: String(p.linkedinUrl ?? ""),
      githubUrl: String(p.githubUrl ?? ""),
      email: String(p.email ?? ""),
      tags: p.tags as string[] ?? [],
      memberCount: Number(p.memberCount) || null,
      foundedYear: Number(p.foundedYear) || null,
      isRecruiting: Boolean(p.isRecruiting),
      crawlStatus: "done",
      lastCrawledAt: new Date(),
      crawlSource: clubEntry.profile?.sourceUrl ?? clubEntry.link.url,
    })
    .onConflictDoUpdate({
      target: [clubs.name, clubs.iitId],
      set: {
        description: summary || description,
        updatedAt: new Date(),
        crawlStatus: "done",
        lastCrawledAt: new Date(),
      },
    })
    .returning();

  if (!club) return;

  // Insert knowledge items
  const knowledgeItems = clubEntry.knowledge?.knowledgeItems ?? [];
  for (const item of knowledgeItems) {
    await db
      .insert(clubKnowledge)
      .values({
        clubId: club.id,
        knowledgeType: String(item.knowledgeType),
        title: String(item.title),
        content: String(item.content),
        sourceUrl: String(item.sourceUrl ?? ""),
        confidence: Number(item.confidence) || 0.7,
        structuredData: item.structuredData as Record<string, unknown> ?? {},
      })
      .onConflictDoNothing();
  }

  // Insert events
  const events = clubEntry.profile?.events ?? [];
  for (const ev of events as Record<string, unknown>[]) {
    await db
      .insert(clubEventAggregates)
      .values({
        clubId: club.id,
        title: String(ev.title ?? "Untitled"),
        description: String(ev.description ?? ""),
        eventType: String(ev.eventType ?? "event"),
        registrationUrl: String(ev.registrationUrl ?? ""),
        rawText: String(ev.rawText ?? ""),
        isUpcoming: true,
      })
      .onConflictDoNothing();
  }

  // Log the crawl
  await db.insert(crawlLogs).values({
    iitId: clubEntry.link.iitId,
    clubId: club.id,
    stage: "persist",
    status: "done",
    message: `Persisted ${club.name} with ${knowledgeItems.length} knowledge items`,
    itemsExtracted: knowledgeItems.length,
  });
}
