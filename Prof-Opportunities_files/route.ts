/**
 * API Route: /api/opportunities/find
 * 
 * POST - Search for opportunities across institution departments
 * GET  - Get available institutions and departments
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchOpportunities,
  getAvailableInstitutions,
  type SearchResult,
  type FoundOpportunity,
} from "@/lib/ai/opportunity-finder";

// Store results in memory for demo (in production, use proper caching/DB)
let lastSearchResults: SearchResult | null = null;

export async function GET() {
  try {
    const institutions = getAvailableInstitutions();
    return NextResponse.json({
      institutions,
      lastResults: lastSearchResults,
    });
  } catch (error) {
    console.error("Failed to get institutions:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      institutionIds = ["iit-bombay"],
      departmentIds = ["cse", "physics"],
      apiKey,
      useDemoData = true, // Default to demo for presentation
      studentProfile,
    } = body as {
      institutionIds?: string[];
      departmentIds?: string[];
      apiKey?: string;
      useDemoData?: boolean;
      studentProfile?: {
        interests: string[];
        skills: string[];
        level: string;
      };
    };

    // Use provided API key or fallback to env
    const groqKey = apiKey || process.env.GROQ_API_KEY;
    
    if (!useDemoData && !groqKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY required for live search" },
        { status: 400 }
      );
    }

    const result = await searchOpportunities(
      institutionIds,
      departmentIds,
      undefined, // Progress callback not used in API
      {
        apiKey: groqKey,
        useDemoData,
        studentProfile,
      }
    );

    lastSearchResults = result;

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Opportunity search failed:", error);
    return NextResponse.json(
      { error: "Search failed", details: String(error) },
      { status: 500 }
    );
  }
}
