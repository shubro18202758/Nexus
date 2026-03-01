import { NextRequest } from "next/server";
import { queryNexusKnowledge } from "@/lib/agent/nexus-agent";
import type { AgenticSearchResult } from "@/lib/agent/nexus-agent";
import { serverDb } from "@/lib/server-db";
import { clubs, clubKnowledge } from "@/db/schema";
import { eq, and, sql, or, ilike } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/clubs/search — Agentic multi-agent club search
 * Pipeline: Intent Parser → Comparison/Recommendation Engine → Master Synthesis
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query, iitId, category, limit = 30 } = body as {
      query?: string;
      iitId?: string;
      category?: string;
      limit?: number;
    };

    if (!query || query.trim().length < 2) {
      return Response.json({ error: "Query too short", clubs: [], answer: "" }, { status: 400 });
    }

    // Step 1: Full-text search across clubs
    const STOP_WORDS = new Set([
      "i", "me", "my", "am", "is", "are", "was", "be", "the", "a", "an", "and",
      "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from",
      "about", "as", "it", "its", "this", "that", "any", "all", "more", "very",
      "so", "too", "since", "new", "tell", "show", "give", "want", "need",
      "truly", "really", "just", "also", "some", "can", "do", "does", "how",
      "what", "which", "who", "where", "when", "why", "please", "interested",
      "club", "clubs", "iit", "iits", "student", "students", "society", "societies",
      // NL connector / filler words — not useful for text search
      "regarding", "related", "looking", "having", "belong", "belonging",
      "thing", "things", "kind", "type", "types", "available", "know",
      "whether", "should", "would", "could", "might", "much", "many",
      "few", "several", "lot", "lots", "various", "different", "specific",
      "particular", "there", "here", "them", "they", "their", "those",
      "these", "been", "being", "were", "has", "had", "have", "will",
      "shall", "into", "such", "than", "then", "only", "other", "no",
      "not", "nor", "own", "same", "each", "every", "both", "after",
      "before", "under", "over", "through", "during", "up", "down",
      // NL intent words — handled by AI agent, not text search
      "compare", "comparison", "versus", "vs", "between", "difference",
      "recommend", "recommendation", "suggest", "best", "top", "good",
      "explore", "discover", "find", "list", "browse", "overview",
      "stats", "statistics", "data", "info", "information", "details",
      "like", "similar", "related", "better", "worse", "most", "least",
      "bombay", "delhi", "kanpur", "madras", "roorkee", "hyderabad",
      "guwahati", "bhubaneswar", "across", "among",
    ]);

    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

    const conditions = [];
    if (iitId) conditions.push(eq(clubs.iitId, iitId));
    if (category && category !== "all") conditions.push(eq(clubs.category, category));

    const textConditions = searchTerms.map(term =>
      or(
        ilike(clubs.name, `%${term}%`),
        ilike(clubs.description, `%${term}%`),
        ilike(clubs.category, `%${term}%`),
        ilike(clubs.tagline, `%${term}%`),
        ilike(clubs.iitId, `%${term}%`)
      )
    );

    if (textConditions.length > 0) {
      // AND logic: a club must match ALL search terms (each in at least one column)
      conditions.push(and(...textConditions));
    }

    const matchedClubs = await serverDb
      .select()
      .from(clubs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .orderBy(sql`${clubs.updatedAt} desc`);

    // If strict AND match returned nothing, fall back to OR (any term matches)
    let orFallbackClubs: typeof matchedClubs = [];
    if (matchedClubs.length === 0 && textConditions.length > 1) {
      const orConditions = [...(iitId ? [eq(clubs.iitId, iitId)] : []), ...(category && category !== "all" ? [eq(clubs.category, category)] : [])];
      // OR: a club matches if ANY search term appears in ANY column
      orConditions.push(or(...textConditions)!);
      orFallbackClubs = await serverDb
        .select()
        .from(clubs)
        .where(and(...orConditions))
        .limit(limit)
        .orderBy(sql`${clubs.updatedAt} desc`);
    }

    // Load ALL clubs for AI context only (not returned as search results)
    const effectiveMatched = matchedClubs.length > 0 ? matchedClubs : orFallbackClubs;
    let aiContextClubs = effectiveMatched.length > 0 ? effectiveMatched : [];
    if (aiContextClubs.length === 0) {
      aiContextClubs = await serverDb
        .select()
        .from(clubs)
        .limit(limit)
        .orderBy(sql`${clubs.updatedAt} desc`);
    }

    // Step 2: Also search knowledge base
    const knowledgeConditions = searchTerms.map(term =>
      or(
        ilike(clubKnowledge.title, `%${term}%`),
        ilike(clubKnowledge.content, `%${term}%`)
      )
    );

    const matchedKnowledge = await serverDb
      .select()
      .from(clubKnowledge)
      .where(knowledgeConditions.length > 0 ? or(...knowledgeConditions) : undefined)
      .limit(30);

    // Load recent knowledge for AI context only
    let aiContextKnowledge = matchedKnowledge;
    if (matchedKnowledge.length === 0) {
      aiContextKnowledge = await serverDb
        .select()
        .from(clubKnowledge)
        .limit(30);
    }

    // Step 3: Agentic multi-agent AI pipeline
    let agenticResult: AgenticSearchResult | null = null;
    let answer = "";

    try {
      // Use full AI context (including fallback data) for the agent
      const chunks = aiContextKnowledge.map((k) => ({
        clubName: aiContextClubs.find((c) => c.id === k.clubId)?.name ?? "Unknown",
        iitId: aiContextClubs.find((c) => c.id === k.clubId)?.iitId ?? "",
        content: k.content ?? "",
        knowledgeType: k.knowledgeType ?? "general",
      }));

      const clubsData = aiContextClubs.map((c) => ({
        name: c.name,
        iitId: c.iitId,
        category: c.category ?? "other",
        description: c.description ?? "",
        tags: (c.tags ?? []) as string[],
        memberCount: c.memberCount ?? undefined,
      }));

      if (chunks.length > 0 || clubsData.length > 0) {
        agenticResult = await queryNexusKnowledge(query, chunks, clubsData);
        answer = agenticResult.answer;
      } else {
        answer = `No clubs found matching "${query}". Try a different query or crawl more IIT club data.`;
      }
    } catch (err) {
      console.error("Agentic search error:", err);
      answer = effectiveMatched.length > 0
        ? `Found ${effectiveMatched.length} clubs matching "${query}".`
        : `No clubs found matching "${query}". The AI agent encountered an error. Try a different query.`;
    }

    // Use AI recommendations/comparisons to refine results — even when text search
    // returned matches (e.g. OR-fallback returned many clubs but AI identified just a few)
    let resultClubs = effectiveMatched;
    if (agenticResult) {
      const mentionedNames: string[] = [];

      // Extract club names from comparison data
      if (agenticResult.comparisonData?.clubs) {
        for (const c of agenticResult.comparisonData.clubs) {
          if (c.name) mentionedNames.push(c.name);
        }
      }
      // Extract club names from recommendations
      if (agenticResult.recommendations) {
        for (const r of agenticResult.recommendations) {
          if (r.clubName) mentionedNames.push(r.clubName);
        }
      }

      if (mentionedNames.length > 0) {
        // First try: filter effectiveMatched to only clubs the AI mentioned
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const mentionedNorm = mentionedNames.map(normalize);
        const aiFiltered = effectiveMatched.filter(c =>
          mentionedNorm.some(mn =>
            normalize(c.name).includes(mn) || mn.includes(normalize(c.name))
          )
        );

        if (aiFiltered.length > 0) {
          resultClubs = aiFiltered;
        } else {
          // Club names from AI didn't match effectiveMatched — query DB directly
          const nameConditions = mentionedNames.map(n =>
            ilike(clubs.name, `%${n.replace(/[%_]/g, "")}%`)
          );
          const aiClubs = await serverDb
            .select()
            .from(clubs)
            .where(or(...nameConditions))
            .limit(limit);
          if (aiClubs.length > 0) resultClubs = aiClubs;
        }
      }

      // Still 0? Return all clubs scoped by iitId/category filter as browseable context
      if (resultClubs.length === 0) {
        resultClubs = aiContextClubs;
      }
    }

    return Response.json({
      clubs: resultClubs,
      knowledge: matchedKnowledge,
      answer,
      agenticResult,
      total: resultClubs.length,
    });
  } catch (err) {
    console.error("Club search error:", err);
    return Response.json({ clubs: [], knowledge: [], answer: "", error: String(err) }, { status: 500 });
  }
}
