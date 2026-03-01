/**
 * POST /api/clubs/seed — Enrich existing clubs with curated seed data.
 * GET  /api/clubs/seed — Preview what would be updated.
 *
 * This endpoint matches clubs by (name, iitId) and updates only fields
 * that are improved by the seed data. It does NOT overwrite descriptions
 * that are already richer than the seed.
 */

import { NextRequest } from "next/server";
import { serverDb, ensureTablesExist } from "@/lib/server-db";
import { clubs } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { CLUB_SEED_DATA } from "@/lib/club-seed-data";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  await ensureTablesExist();

  const results: Array<{ name: string; iitId: string; action: string }> = [];

  for (const seed of CLUB_SEED_DATA) {
    // Find matching club by (name, iitId)
    const existing = await serverDb
      .select()
      .from(clubs)
      .where(and(eq(clubs.name, seed.name), eq(clubs.iitId, seed.iitId)))
      .limit(1);

    if (existing.length > 0) {
      const club = existing[0];

      // Build update object — only override if seed has better data
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // Always update description if seed has one and existing is empty/short
      if (seed.description && (!club.description || club.description.length < seed.description.length)) {
        updates.description = seed.description;
      }
      if (seed.tagline && !club.tagline) updates.tagline = seed.tagline;
      if (seed.shortName && !club.shortName) updates.shortName = seed.shortName;
      if (seed.category && seed.category !== "other") updates.category = seed.category;

      // URLs — only set if seed has them and DB is empty
      if (seed.websiteUrl && !club.websiteUrl) updates.websiteUrl = seed.websiteUrl;
      if (seed.instagramUrl && !club.instagramUrl) updates.instagramUrl = seed.instagramUrl;
      if (seed.linkedinUrl && !club.linkedinUrl) updates.linkedinUrl = seed.linkedinUrl;
      if (seed.githubUrl && !club.githubUrl) updates.githubUrl = seed.githubUrl;
      if (seed.email && !club.email) updates.email = seed.email;

      // Images — always update coverImageUrl if seed has one (allows image fixes)
      if (seed.logoUrl && !club.logoUrl) updates.logoUrl = seed.logoUrl;
      if (seed.coverImageUrl && seed.coverImageUrl !== club.coverImageUrl) updates.coverImageUrl = seed.coverImageUrl;

      // Metadata
      if (seed.tags && seed.tags.length > 0 && (!Array.isArray(club.tags) || (club.tags as string[]).length === 0)) {
        updates.tags = seed.tags;
      }
      if (seed.memberCount && !club.memberCount) updates.memberCount = seed.memberCount;
      if (seed.foundedYear && !club.foundedYear) updates.foundedYear = seed.foundedYear;
      if (seed.activityScore && (!club.activityScore || club.activityScore === 0)) {
        updates.activityScore = seed.activityScore;
      }

      await serverDb.update(clubs).set(updates).where(eq(clubs.id, club.id));
      results.push({ name: seed.name, iitId: seed.iitId, action: `updated (${Object.keys(updates).length - 1} fields)` });
    } else {
      // Club NOT in DB — INSERT it fresh
      await serverDb.insert(clubs).values({
        iitId: seed.iitId,
        name: seed.name,
        shortName: seed.shortName ?? null,
        category: seed.category,
        description: seed.description,
        tagline: seed.tagline ?? null,
        websiteUrl: seed.websiteUrl ?? null,
        instagramUrl: seed.instagramUrl ?? null,
        linkedinUrl: seed.linkedinUrl ?? null,
        githubUrl: seed.githubUrl ?? null,
        email: seed.email ?? null,
        logoUrl: seed.logoUrl ?? null,
        coverImageUrl: seed.coverImageUrl ?? null,
        tags: seed.tags,
        memberCount: seed.memberCount ?? null,
        foundedYear: seed.foundedYear ?? null,
        activityScore: seed.activityScore ?? 0,
        crawlStatus: "seeded",
        lastCrawledAt: new Date(),
        crawlSource: "manual-seed",
      }).onConflictDoNothing();
      results.push({ name: seed.name, iitId: seed.iitId, action: "inserted" });
    }
  }

  return Response.json({ success: true, results, total: results.length });
}

export async function GET() {
  await ensureTablesExist();

  const preview: Array<{ name: string; iitId: string; inDB: boolean; fieldsToUpdate: string[] }> = [];

  for (const seed of CLUB_SEED_DATA) {
    const existing = await serverDb
      .select()
      .from(clubs)
      .where(and(eq(clubs.name, seed.name), eq(clubs.iitId, seed.iitId)))
      .limit(1);

    if (existing.length > 0) {
      const club = existing[0];
      const fields: string[] = [];
      if (seed.description && (!club.description || club.description.length < seed.description.length)) fields.push("description");
      if (seed.tagline && !club.tagline) fields.push("tagline");
      if (seed.shortName && !club.shortName) fields.push("shortName");
      if (seed.websiteUrl && !club.websiteUrl) fields.push("websiteUrl");
      if (seed.instagramUrl && !club.instagramUrl) fields.push("instagramUrl");
      if (seed.linkedinUrl && !club.linkedinUrl) fields.push("linkedinUrl");
      if (seed.githubUrl && !club.githubUrl) fields.push("githubUrl");
      if (seed.coverImageUrl && !club.coverImageUrl) fields.push("coverImageUrl");
      if (seed.tags && seed.tags.length > 0 && (!Array.isArray(club.tags) || (club.tags as string[]).length === 0)) fields.push("tags");
      if (seed.memberCount && !club.memberCount) fields.push("memberCount");
      if (seed.foundedYear && !club.foundedYear) fields.push("foundedYear");
      if (seed.activityScore && (!club.activityScore || club.activityScore === 0)) fields.push("activityScore");
      preview.push({ name: seed.name, iitId: seed.iitId, inDB: true, fieldsToUpdate: fields });
    } else {
      preview.push({ name: seed.name, iitId: seed.iitId, inDB: false, fieldsToUpdate: ["ALL (new insert)"] });
    }
  }

  return Response.json({ preview, total: preview.length });
}
