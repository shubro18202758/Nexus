// ===================================================================
// Daily Digest — NL AI Filter API Route
// POST /api/digest/filter
// Body: { items: DigestFilterItem[], config: FilterConfig }
// Returns: FilterResponse { results, analytics }
// ===================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  filterDigestFeed,
  DEFAULT_FILTER_CONFIG,
  type DigestFilterItem,
  type FilterConfig,
} from "@/lib/digest/digest-filter-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: DigestFilterItem[] = body.items || [];
    const config: FilterConfig = {
      ...DEFAULT_FILTER_CONFIG,
      ...body.config,
    };

    if (!config.query?.trim()) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const response = await filterDigestFeed(items, config);

    return NextResponse.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("[Digest Filter API] Error:", error.message);
    return NextResponse.json(
      { error: "Filter processing failed", results: [], analytics: null },
      { status: 500 }
    );
  }
}
