import { NextResponse } from "next/server";
import {
  searchOpportunities,
  getAvailableInstitutions,
  type SearchResult,
} from "@/lib/ai/opportunity-finder";

/**
 * POST /api/opportunities/find
 *
 * Body:
 *   institutionIds?: string[]   — defaults to all registered
 *   departmentIds?: string[]    — defaults to all departments in selected institutions
 *   useDemoData?: boolean       — true = return 6 mock IIT Bombay opportunities
 *   apiKey?: string             — optional per-request Groq key
 *   studentProfile?: { interests: string[]; skills: string[]; level: string }
 *
 * Returns: SearchResult JSON
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      institutionIds,
      departmentIds,
      useDemoData = true,
      apiKey,
      studentProfile,
    } = body as {
      institutionIds?: string[];
      departmentIds?: string[];
      useDemoData?: boolean;
      apiKey?: string;
      studentProfile?: { interests: string[]; skills: string[]; level: string };
    };

    // Default: all institutions and all their departments
    const allInstitutions = getAvailableInstitutions();
    const effectiveInstitutionIds =
      institutionIds && institutionIds.length > 0
        ? institutionIds
        : allInstitutions.map((i) => i.id);

    const effectiveDepartmentIds =
      departmentIds && departmentIds.length > 0
        ? departmentIds
        : allInstitutions
            .filter((i) => effectiveInstitutionIds.includes(i.id))
            .flatMap((i) => i.departments.map((d) => d.id));

    const result: SearchResult = await searchOpportunities(
      effectiveInstitutionIds,
      effectiveDepartmentIds,
      undefined, // onProgress — not used server-side
      {
        apiKey,
        useDemoData,
        studentProfile,
      },
    );

    return NextResponse.json({
      opportunities: result.opportunities,
      searchedDepartments: result.searchedDepartments,
      searchedInstitutions: result.searchedInstitutions,
      totalPagesScanned: result.totalPagesScanned,
      duration: result.duration,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[/api/opportunities/find] Error:", error);
    return NextResponse.json(
      {
        error: "Opportunity search failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/opportunities/find
 *
 * Returns available institutions & departments for the UI picker.
 */
export async function GET() {
  const institutions = getAvailableInstitutions();
  return NextResponse.json({ institutions });
}
