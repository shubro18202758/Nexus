import { NextResponse } from "next/server";
import {
  filterOpportunitiesNL,
  type FoundOpportunity,
} from "@/lib/ai/opportunity-finder";

/**
 * POST /api/opportunities/filter
 *
 * AI-powered natural language filter for opportunities.
 *
 * Body:
 *   query: string                  — natural language search query
 *   opportunities: FoundOpportunity[] — the list to filter
 *   apiKey?: string                — optional per-request Groq key
 *
 * Returns: NLFilterResult JSON
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query, opportunities, apiKey } = body as {
      query?: string;
      opportunities?: FoundOpportunity[];
      apiKey?: string;
    };

    if (!query || !opportunities || opportunities.length === 0) {
      return NextResponse.json({
        filtered: opportunities || [],
        interpretation: "No query or opportunities provided",
        appliedFilters: {},
      });
    }

    const result = await filterOpportunitiesNL(query, opportunities, apiKey);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/opportunities/filter] Error:", error);
    return NextResponse.json(
      {
        error: "AI filter failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
