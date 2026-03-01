import { NextResponse } from "next/server";
import {
  generateOpportunityPreview,
  type FoundOpportunity,
} from "@/lib/ai/opportunity-finder";

/**
 * POST /api/opportunities/preview
 *
 * AI-generated deep preview for a single opportunity.
 *
 * Body:
 *   opportunity: FoundOpportunity — the opportunity to preview
 *   studentContext?: string       — optional student background
 *   apiKey?: string               — optional per-request Groq key
 *
 * Returns: OpportunityPreview JSON
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { opportunity, studentContext, apiKey } = body as {
      opportunity?: FoundOpportunity;
      studentContext?: string;
      apiKey?: string;
    };

    if (!opportunity) {
      return NextResponse.json(
        { error: "No opportunity provided" },
        { status: 400 },
      );
    }

    const preview = await generateOpportunityPreview(
      opportunity,
      studentContext,
      apiKey,
    );

    return NextResponse.json(preview);
  } catch (error) {
    console.error("[/api/opportunities/preview] Error:", error);
    return NextResponse.json(
      {
        error: "Preview generation failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
