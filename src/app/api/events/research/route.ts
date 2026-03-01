import { NextRequest, NextResponse } from "next/server";
import {
    runResearch,
    filterExistingEvents,
    generateClarifyingQuestions,
    type ResearchFilters,
    type ResearchedEvent,
} from "@/lib/events/research-engine";

// ===================================================================
// /api/events/research — Public Forms Research API v2
//
// POST /api/events/research
//   Body: { action: "search" | "filter" | "clarify", ... }
//
// Actions:
//   search  — Run full research session (NL query + optional filters)
//   filter  — Re-filter existing results with new NL prompt
//   clarify — Get AI-generated clarifying questions for vague query
//
// Enhancements v2:
//   - Fixed filter field name mismatch (nlFilter vs query)
//   - AbortSignal support with configurable timeout
//   - Input sanitization and length limits
//   - Request timing and diagnostics in response
//   - Better error categorization
// ===================================================================

const MAX_QUERY_LENGTH = 500;
const MAX_EVENTS_FOR_FILTER = 200;
const SEARCH_TIMEOUT_MS = 150_000; // 2.5 minutes max for full research

/** Sanitize string input */
function sanitize(input: unknown): string {
    if (typeof input !== "string") return "";
    return input.trim().slice(0, MAX_QUERY_LENGTH);
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();

    try {
        const body = await req.json();
        const { action } = body;

        if (!action || typeof action !== "string") {
            return NextResponse.json(
                { error: "action field is required (search | filter | clarify)" },
                { status: 400 },
            );
        }

        switch (action) {
            case "search": {
                const query = sanitize(body.query);
                const filters: ResearchFilters = body.filters || {};

                if (!query || query.length < 2) {
                    return NextResponse.json(
                        { error: "Query must be at least 2 characters" },
                        { status: 400 },
                    );
                }

                console.log(`[Research API] Search: "${query}" with filters:`, filters);

                // Create timeout-aware AbortController
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

                try {
                    const session = await runResearch(query, filters, {
                        signal: controller.signal,
                        timeoutMs: SEARCH_TIMEOUT_MS,
                    });

                    clearTimeout(timer);
                    const durationMs = Date.now() - startTime;

                    return NextResponse.json({
                        success: true,
                        events: session.events,
                        meta: {
                            totalSearchResults: session.totalSearchResults,
                            searchQueries: session.searchQueries,
                            eventsFound: session.events.length,
                            status: session.status,
                            durationMs,
                            researchDurationMs: session.durationMs,
                        },
                    });
                } finally {
                    clearTimeout(timer);
                }
            }

            case "filter": {
                // Accept BOTH "nlFilter" and "query" for backwards compatibility
                const nlFilter = sanitize(body.nlFilter || body.query);
                const events: ResearchedEvent[] = body.events;

                if (!Array.isArray(events) || events.length === 0) {
                    return NextResponse.json(
                        { error: "Non-empty events array is required" },
                        { status: 400 },
                    );
                }

                if (!nlFilter || nlFilter.length < 2) {
                    return NextResponse.json(
                        { error: "Filter query (nlFilter or query) must be at least 2 characters" },
                        { status: 400 },
                    );
                }

                // Cap events for filter to prevent excessive Groq token usage
                const cappedEvents = events.slice(0, MAX_EVENTS_FOR_FILTER);

                console.log(`[Research API] Filter: "${nlFilter}" on ${cappedEvents.length} events`);
                const filtered = await filterExistingEvents(cappedEvents, nlFilter);
                const durationMs = Date.now() - startTime;

                return NextResponse.json({
                    success: true,
                    events: filtered,
                    meta: {
                        originalCount: cappedEvents.length,
                        filteredCount: filtered.length,
                        durationMs,
                    },
                });
            }

            case "clarify": {
                const query = sanitize(body.query);

                if (!query || query.length < 2) {
                    return NextResponse.json(
                        { error: "Query must be at least 2 characters" },
                        { status: 400 },
                    );
                }

                console.log(`[Research API] Clarify: "${query}"`);
                const questions = await generateClarifyingQuestions(query);
                const durationMs = Date.now() - startTime;

                return NextResponse.json({
                    success: true,
                    ...questions,
                    meta: { durationMs },
                });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: "${action}". Valid: search, filter, clarify` },
                    { status: 400 },
                );
        }
    } catch (error: any) {
        console.error("[Research API] Error:", error);
        const durationMs = Date.now() - startTime;

        // Categorize error
        const isTimeout = error.name === "AbortError" || error.message?.includes("timeout") || error.message?.includes("cancelled");
        const isOllama = error.message?.includes("Ollama") || error.message?.includes("ECONNREFUSED");

        return NextResponse.json(
            {
                error: isTimeout
                    ? "Research timed out — try a more specific query"
                    : isOllama
                        ? "AI engine unavailable — ensure Ollama is running"
                        : (error.message || "Internal server error"),
                category: isTimeout ? "timeout" : isOllama ? "ollama_down" : "internal",
                durationMs,
            },
            { status: isTimeout ? 504 : isOllama ? 503 : 500 },
        );
    }
}
