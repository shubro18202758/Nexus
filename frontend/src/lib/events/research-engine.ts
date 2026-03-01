// ===================================================================
// Event Research Engine v2 — Multi-Agent Deep Web Research
//
// Architecture:
//   ORCHESTRATOR (DeepSeek R1 8B via Ollama)
//     → Plans search strategy from NL prompt + manual filters
//     → Generates targeted search queries with dynamic dates
//     → Coordinates 5+ Groq research agents
//     → Merges, deduplicates, and ranks final results
//
//   RESEARCH AGENTS (5× Groq llama-3.1-8b-instant + fallback keys)
//     → Process web search results in parallel
//     → Fetch and extract event data from pages (with concurrency control)
//     → Validate freshness (future events only)
//     → Extract RSVP form links + registration info
//
// Enhancements v2:
//   - Dynamic year (no hardcoded dates)
//   - AbortSignal propagation for cancellation
//   - Concurrent fetch limiting (5 parallel max)
//   - Improved confidence scoring with data completeness
//   - Past-event filtering with date validation
//   - Better dedup (URL + title + Jaccard)
//   - Phase progress callbacks with granular status
//   - Pipeline timeout protection (configurable, default 120s)
//   - JSON-LD structured data extraction from pages
//   - Resilient fallbacks at every pipeline stage
//
// Designed for AMD Slingshot / IIT Bombay competition.
// ===================================================================

import { groqPoolChat, groqPoolParallel, type GroqMessage } from "./groq-research-pool";
import { webSearch, searchEventForms, fetchPageContent, fetchPagesBatch, normalizeUrl, clearPageCache, type SearchResult } from "./web-search";

// ─── Types ───────────────────────────────────────────────────────

/** Manual filters the user can set */
export interface ResearchFilters {
    eventType?: string[];   // hackathon, coding-contest, networking, startup-pitch, speaker-session, workshop
    themes?: string[];       // AI/ML, blockchain, web3, cybersecurity, etc.
    location?: string;       // City, country, or "virtual"/"online"
    dateRange?: {
        from?: string;       // ISO date
        to?: string;
    };
    prizePool?: {
        min?: number;
        currency?: string;
    };
    teamSize?: {
        min?: number;
        max?: number;
    };
    eligibility?: string;   // "college students", "open to all", etc.
    freeOnly?: boolean;
}

/** Structured event from research */
export interface ResearchedEvent {
    id: string;              // Generated UUID-like
    title: string;
    description: string;
    eventType: string;       // hackathon, contest, workshop, etc.
    themes: string[];        // Tags: AI, Web3, etc.
    organizer: string;
    location: string;        // City or "Virtual"
    isVirtual: boolean;
    eventDate: string | null;        // ISO date or null
    eventEndDate: string | null;
    registrationDeadline: string | null;
    prizePool: string | null;        // "$10,000" or null
    teamSize: string | null;         // "1-4" or null
    eligibility: string | null;
    isFree: boolean;
    rsvpUrl: string;                 // Primary registration/RSVP link
    websiteUrl: string;              // Event website
    imageUrl: string | null;         // Event logo/banner
    sourceUrl: string;               // Where we found it
    sourcePlatform: string;          // devpost, unstop, eventbrite, etc.
    freshness: "upcoming" | "ongoing" | "deadline-soon" | "past" | "unknown";
    confidenceScore: number;         // 0-1, how confident we are in the data
    snippet: string;                 // Brief extract for preview
    extractedAt: string;             // ISO timestamp of extraction
}

/** Phase progress detail for UI */
export interface ResearchPhaseProgress {
    phase: "planning" | "searching" | "extracting" | "ranking" | "complete" | "error";
    message: string;
    detail?: string;
    pagesFound?: number;
    eventsExtracted?: number;
    progress?: number; // 0-100
}

/** Research session state */
export interface ResearchSession {
    query: string;
    filters: ResearchFilters;
    status: "planning" | "searching" | "extracting" | "ranking" | "complete" | "error";
    events: ResearchedEvent[];
    totalSearchResults: number;
    searchQueries: string[];
    error?: string;
    durationMs?: number;
    phaseProgress?: ResearchPhaseProgress;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Dynamic current year */
function currentYear(): number {
    return new Date().getFullYear();
}

/** Today's date as YYYY-MM-DD */
function todayISO(): string {
    return new Date().toISOString().split("T")[0];
}

/** Check if a date string represents a past event */
function isPastDate(dateStr: string | null): boolean {
    if (!dateStr) return false;
    try {
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return false;
        // Past if more than 2 days ago (allow some slack)
        return d.getTime() < Date.now() - 2 * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

// ─── Orchestrator (Ollama DeepSeek R1 8B via fetch) ──────────────

const OLLAMA_BASE = process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434";
const CORE_MODEL = "deepseek-r1:8b";

/** Call Ollama directly (server-side, no proxy needed) */
async function ollamaChat(
    messages: { role: string; content: string }[],
    opts: { temperature?: number; json?: boolean; timeout?: number; signal?: AbortSignal } = {},
): Promise<string> {
    const { temperature = 0.4, json = false, timeout = 60_000, signal } = opts;

    const body: Record<string, unknown> = {
        model: CORE_MODEL,
        messages,
        stream: false,
        options: {
            num_gpu: -1,
            temperature,
            num_ctx: 16384,
        },
    };

    if (json) {
        body.format = "json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);

        if (!res.ok) {
            throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
        }

        const data = await res.json();
        let content = data.message?.content || "";

        // Strip <think> tags from DeepSeek R1
        content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        return content;
    } catch (err: any) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (err.name === "AbortError" && signal?.aborted) {
            throw new Error("Research cancelled by user");
        }
        throw err;
    }
}

/** Extract JSON from possibly-wrapped LLM output */
function extractJson<T>(text: string): T | null {
    // Try direct parse first
    try {
        return JSON.parse(text);
    } catch {
        // Look for JSON in markdown code blocks
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
            try {
                return JSON.parse(match[1].trim());
            } catch { /* fall through */ }
        }
        // Look for { ... } or [ ... ]
        const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch { /* fall through */ }
        }
        // Last resort — try to fix common JSON issues and re-parse
        try {
            const fixed = text
                .replace(/,\s*}/g, "}")
                .replace(/,\s*]/g, "]")
                .replace(/'/g, '"');
            const m = fixed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (m) return JSON.parse(m[1]);
        } catch { /* give up */ }
    }
    return null;
}

// ─── Phase 1: Orchestrator Plans Search Strategy ─────────────────

interface SearchPlan {
    searchQueries: string[];
    eventTypes: string[];
    focusKeywords: string[];
    locationHint: string;
    dateContext: string;
}

async function planSearchStrategy(
    nlQuery: string,
    filters: ResearchFilters,
    signal?: AbortSignal,
): Promise<SearchPlan> {
    const year = currentYear();
    const filterContext = Object.entries(filters)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");

    const prompt = `You are a search strategy planner for finding public events (hackathons, coding contests, networking events, startup pitching arenas, speaker sessions, workshops).

USER QUERY: "${nlQuery}"
${filterContext ? `MANUAL FILTERS:\n${filterContext}` : "No manual filters."}
CURRENT DATE: ${todayISO()}

Generate a search plan as JSON:
{
  "searchQueries": ["query1", "query2", ...],  // 4-8 diverse search queries targeting different aspects
  "eventTypes": ["hackathon", "contest", ...],  // Event types to look for
  "focusKeywords": ["keyword1", ...],           // Key terms to prioritize
  "locationHint": "city/country or global",     // Target location
  "dateContext": "${year}"                       // Year/timeframe focus
}

RULES:
- Generate diverse queries that cover different angles and platforms
- Include platform-specific queries (site:devpost.com, site:unstop.com, site:eventbrite.com)
- Focus on UPCOMING/FUTURE events (${year} onwards)
- Include registration/RSVP keywords in some queries
- If location specified, include location-specific queries
- Keep each query concise but targeted`;

    try {
        const result = await ollamaChat(
            [{ role: "user", content: prompt }],
            { temperature: 0.3, json: true, signal },
        );

        const plan = extractJson<SearchPlan>(result);
        if (plan?.searchQueries?.length) {
            // Ensure dynamic year — replace any hardcoded 2025 with current year
            plan.searchQueries = plan.searchQueries.map(q =>
                q.replace(/\b2025\b/g, String(year))
            );
            plan.dateContext = String(year);
            return plan;
        }
    } catch (err: any) {
        if (err.message?.includes("cancelled")) throw err;
        console.warn("[Research] Ollama planner failed, using fallback:", err.message);
    }

    // Fallback: generate basic queries with dynamic year
    return {
        searchQueries: [
            `${nlQuery} ${year} registration`,
            `${nlQuery} hackathon ${year} apply`,
            `upcoming ${nlQuery} events ${year}`,
            `site:devpost.com ${nlQuery} ${year}`,
            `site:unstop.com ${nlQuery} ${year}`,
            `site:eventbrite.com ${nlQuery} ${year}`,
        ],
        eventTypes: filters.eventType || ["hackathon", "contest", "workshop"],
        focusKeywords: nlQuery.split(/\s+/).filter(w => w.length > 3),
        locationHint: filters.location || "global",
        dateContext: String(year),
    };
}

// ─── Phase 2: Parallel Web Search ────────────────────────────────

async function executeSearchPhase(plan: SearchPlan, signal?: AbortSignal): Promise<SearchResult[]> {
    if (signal?.aborted) throw new Error("Research cancelled by user");

    // Run search queries with staggered concurrency (3 at a time)
    const allResults: SearchResult[][] = [];
    for (let i = 0; i < plan.searchQueries.length; i += 3) {
        if (signal?.aborted) throw new Error("Research cancelled by user");
        const batch = plan.searchQueries.slice(i, i + 3);
        const batchResults = await Promise.all(
            batch.map(q =>
                webSearch(q, {
                    eventType: plan.eventTypes[0],
                    location: plan.locationHint !== "global" ? plan.locationHint : undefined,
                    maxResultsPerQuery: 12,
                    maxTotalResults: 25,
                    signal,
                }),
            ),
        );
        allResults.push(...batchResults);
    }

    // Flatten and deduplicate using proper URL normalization
    const seen = new Set<string>();
    const deduplicated: SearchResult[] = [];

    for (const results of allResults) {
        for (const r of results) {
            const key = normalizeUrl(r.url);
            if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(r);
            }
        }
    }

    console.log(`[Research] Search phase: ${deduplicated.length} unique results from ${plan.searchQueries.length} queries`);
    return deduplicated;
}

// ─── Phase 3: Parallel Event Extraction (5× Groq Agents) ────────

/**
 * Pre-filter search results to identify likely event pages.
 * Uses a fast Groq call to classify URLs as event/non-event.
 */
async function preFilterResults(results: SearchResult[], signal?: AbortSignal): Promise<SearchResult[]> {
    if (results.length === 0) return [];
    if (signal?.aborted) throw new Error("Research cancelled by user");

    // Batch into groups of 15 for parallel classification
    const batchSize = 15;
    const batches: SearchResult[][] = [];
    for (let i = 0; i < results.length; i += batchSize) {
        batches.push(results.slice(i, i + batchSize));
    }

    const filteredBatches = await Promise.all(
        batches.map(async (batch) => {
            const listText = batch
                .map((r, i) => `[${i}] "${r.title}" — ${r.url}\n    ${r.snippet}`)
                .join("\n");

            const messages: GroqMessage[] = [
                {
                    role: "system",
                    content: `You classify search results as event pages or not. Return ONLY a JSON array of indices that ARE event-related pages (hackathons, coding contests, workshops, conferences, meetups, competitions, speaker sessions, networking events). Exclude news articles, blog posts, generic company pages, and old/past events. Current date: ${todayISO()}.`,
                },
                {
                    role: "user",
                    content: `Classify these search results. Return JSON: {"keep": [0, 2, 5, ...]}\n\n${listText}`,
                },
            ];

            try {
                const response = await groqPoolChat(messages, { json_mode: true, temperature: 0.1, signal });
                const parsed = extractJson<{ keep: number[] }>(response);
                if (!parsed?.keep) return batch; // On failure, keep all
                return parsed.keep
                    .filter(i => i >= 0 && i < batch.length)
                    .map(i => batch[i]);
            } catch (err: any) {
                if (err.message?.includes("cancelled")) throw err;
                console.warn("[Research] Pre-filter batch failed, keeping all:", err.message);
                return batch;
            }
        }),
    );

    const filtered = filteredBatches.flat();
    console.log(`[Research] Pre-filter: ${results.length} → ${filtered.length} event pages`);
    return filtered;
}

/**
 * Deep extraction: Fetch pages and extract structured event data.
 * Uses concurrent fetch limiting (5 parallel) and 5 Groq agents.
 */
async function deepExtractEvents(
    results: SearchResult[],
    plan: SearchPlan,
    signal?: AbortSignal,
): Promise<ResearchedEvent[]> {
    if (results.length === 0) return [];
    if (signal?.aborted) throw new Error("Research cancelled by user");

    // Limit to top 25 for deep extraction (bumped from 20)
    const toExtract = results.slice(0, 25);
    const urls = toExtract.map(r => r.url);

    // Fetch pages concurrently with limit of 5 parallel fetches
    console.log(`[Research] Fetching ${urls.length} pages (max 5 concurrent)...`);
    const pageMap = await fetchPagesBatch(urls, { maxChars: 8000, signal, concurrency: 5 });

    // Match back to search results
    const successfulPages: { result: SearchResult; page: { title: string; text: string } }[] = [];
    for (const r of toExtract) {
        const page = pageMap.get(r.url);
        if (page?.success && page.text.length > 100) {
            successfulPages.push({ result: r, page });
        }
    }

    console.log(`[Research] Fetched ${successfulPages.length}/${toExtract.length} pages successfully`);

    if (successfulPages.length === 0) {
        // Fallback: extract from snippets alone
        return extractFromSnippets(results, plan, signal);
    }

    if (signal?.aborted) throw new Error("Research cancelled by user");

    // Build extraction tasks for Groq pool
    const extractionTasks = successfulPages.map(({ result, page }) => {
        const messages: GroqMessage[] = [
            {
                role: "system",
                content: `You are an expert event data extractor. Extract structured event information from web page content. Return ONLY valid JSON.

Current date: ${todayISO()}
Focus on: ${plan.eventTypes.join(", ")} events
Keywords: ${plan.focusKeywords.join(", ")}

IMPORTANT: Only extract events that are UPCOMING or ONGOING (dates on or after ${todayISO()}). If all dates are in the past, set "is_event" to false.`,
            },
            {
                role: "user",
                content: `Extract event data from this page. If it's NOT an event page or the event is in the past, return {"is_event": false}.

URL: ${result.url}
Title: ${page.title || result.title}
Content (truncated):
${page.text.slice(0, 5500)}

Return JSON:
{
  "is_event": true,
  "title": "Event Name",
  "description": "2-3 sentence description",
  "event_type": "hackathon|contest|workshop|conference|meetup|networking|speaker-session|startup-pitch",
  "themes": ["AI", "Web3", ...],
  "organizer": "Org Name",
  "location": "City, Country" or "Virtual",
  "is_virtual": true/false,
  "event_date": "YYYY-MM-DD" or null,
  "event_end_date": "YYYY-MM-DD" or null,
  "registration_deadline": "YYYY-MM-DD" or null,
  "prize_pool": "$10,000" or null,
  "team_size": "1-4" or null,
  "eligibility": "Open to all" or "College students" or null,
  "is_free": true/false,
  "rsvp_url": "https://..." (registration/apply link),
  "image_url": null,
  "freshness": "upcoming|ongoing|deadline-soon|past|unknown"
}`,
            },
        ];

        return { messages, opts: { json_mode: true, temperature: 0.1, max_tokens: 1024, signal } };
    });

    // Execute all extractions in parallel across Groq keys
    const extractionResults = await groqPoolParallel(
        extractionTasks as Parameters<typeof groqPoolParallel>[0],
        { signal },
    );

    // Parse results
    const events: ResearchedEvent[] = [];
    const now = todayISO();

    for (let i = 0; i < extractionResults.length; i++) {
        if (!extractionResults[i]) continue;
        const raw = extractJson<any>(extractionResults[i]);
        if (!raw || raw.is_event === false) continue;

        // Filter out past events
        if (raw.freshness === "past") continue;
        if (isPastDate(raw.event_date) && isPastDate(raw.event_end_date)) continue;

        const sp = successfulPages[i];
        events.push({
            id: `res-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
            title: raw.title || sp.result.title,
            description: raw.description || sp.result.snippet,
            eventType: raw.event_type || "unknown",
            themes: Array.isArray(raw.themes) ? raw.themes : [],
            organizer: raw.organizer || "",
            location: raw.location || "Unknown",
            isVirtual: raw.is_virtual ?? false,
            eventDate: raw.event_date || null,
            eventEndDate: raw.event_end_date || null,
            registrationDeadline: raw.registration_deadline || null,
            prizePool: raw.prize_pool || null,
            teamSize: raw.team_size || null,
            eligibility: raw.eligibility || null,
            isFree: raw.is_free ?? true,
            rsvpUrl: raw.rsvp_url || sp.result.url,
            websiteUrl: sp.result.url,
            imageUrl: raw.image_url || null,
            sourceUrl: sp.result.url,
            sourcePlatform: detectPlatform(sp.result.url),
            freshness: raw.freshness || "unknown",
            confidenceScore: calculateConfidence(raw),
            snippet: (raw.description || sp.result.snippet || "").slice(0, 200),
            extractedAt: new Date().toISOString(),
        });
    }

    // If we have deep results AND snippet fallback could add more, merge them
    if (events.length < 5 && results.length > successfulPages.length) {
        const snippetEvents = await extractFromSnippets(
            results.filter(r => !successfulPages.some(sp => sp.result.url === r.url)),
            plan,
            signal,
        );
        events.push(...snippetEvents);
    }

    console.log(`[Research] Deep extraction: ${events.length} events extracted`);
    return events;
}

/** Fallback: extract basic info from search snippets when page fetch fails */
async function extractFromSnippets(
    results: SearchResult[],
    plan: SearchPlan,
    signal?: AbortSignal,
): Promise<ResearchedEvent[]> {
    if (signal?.aborted) return [];

    const batchSize = 10;
    const batches: SearchResult[][] = [];
    for (let i = 0; i < Math.min(results.length, 30); i += batchSize) {
        batches.push(results.slice(i, i + batchSize));
    }

    const batchResults = await Promise.all(
        batches.map(async (batch) => {
            const listText = batch
                .map((r, i) => `[${i}] Title: "${r.title}"\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
                .join("\n\n");

            const messages: GroqMessage[] = [
                {
                    role: "system",
                    content: `Extract event information from search result snippets. Return a JSON array of events. Only include results that are actual UPCOMING events (not news articles, blog posts, or past events). Current date: ${todayISO()}`,
                },
                {
                    role: "user",
                    content: `Extract events from these search results:\n\n${listText}\n\nReturn JSON: {"events": [{"index": 0, "title": "...", "event_type": "...", "themes": [...], "location": "...", "event_date": "YYYY-MM-DD" or null, "registration_deadline": null, "prize_pool": null, "is_free": true, "description": "...", "freshness": "upcoming|ongoing|unknown"}]}`,
                },
            ];

            try {
                const response = await groqPoolChat(messages, { json_mode: true, temperature: 0.1, signal });
                const parsed = extractJson<{ events: any[] }>(response);
                if (!parsed?.events) return [];

                return parsed.events
                    .filter((e: any) => e.freshness !== "past" && !isPastDate(e.event_date))
                    .map((e: any) => {
                        const srcResult = batch[e.index] || batch[0];
                        return {
                            id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            title: e.title || srcResult.title,
                            description: e.description || srcResult.snippet,
                            eventType: e.event_type || "unknown",
                            themes: Array.isArray(e.themes) ? e.themes : [],
                            organizer: "",
                            location: e.location || "Unknown",
                            isVirtual: e.location?.toLowerCase().includes("virtual") ?? false,
                            eventDate: e.event_date || null,
                            eventEndDate: null,
                            registrationDeadline: e.registration_deadline || null,
                            prizePool: e.prize_pool || null,
                            teamSize: null,
                            eligibility: null,
                            isFree: e.is_free ?? true,
                            rsvpUrl: srcResult.url,
                            websiteUrl: srcResult.url,
                            imageUrl: null,
                            sourceUrl: srcResult.url,
                            sourcePlatform: detectPlatform(srcResult.url),
                            freshness: e.freshness || "unknown",
                            confidenceScore: 0.45, // lower confidence for snippet-only
                            snippet: (e.description || srcResult.snippet || "").slice(0, 200),
                            extractedAt: new Date().toISOString(),
                        } satisfies ResearchedEvent;
                    });
            } catch (err: any) {
                if (err.message?.includes("cancelled")) throw err;
                console.warn("[Research] Snippet extraction batch failed:", err.message);
                return [];
            }
        }),
    );

    return batchResults.flat();
}

// ─── Phase 4: Ranking & Deduplication ────────────────────────────

function rankAndDeduplicate(
    events: ResearchedEvent[],
    filters: ResearchFilters,
): ResearchedEvent[] {
    // Deduplicate by both URL and title similarity
    const unique: ResearchedEvent[] = [];
    const titleSet = new Set<string>();
    const urlSet = new Set<string>();

    for (const event of events) {
        const normalizedTitle = event.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normalizedTitle.length < 3) continue;

        // URL dedup
        const normalizedSourceUrl = normalizeUrl(event.sourceUrl);
        if (urlSet.has(normalizedSourceUrl)) continue;

        // Title similarity dedup
        let isDupe = false;
        for (const existing of titleSet) {
            if (similarityScore(normalizedTitle, existing) > 0.75) {
                isDupe = true;
                break;
            }
        }

        if (!isDupe) {
            titleSet.add(normalizedTitle);
            urlSet.add(normalizedSourceUrl);
            unique.push(event);
        }
    }

    // Score each event with enhanced multi-factor scoring
    const scored = unique.map(event => {
        let score = event.confidenceScore * 50; // Base: confidence (0-50)

        // Freshness bonus (0-30)
        if (event.freshness === "deadline-soon") score += 30;
        if (event.freshness === "upcoming") score += 22;
        if (event.freshness === "ongoing") score += 18;

        // Date proximity bonus for events with dates
        if (event.eventDate) {
            try {
                const daysUntil = (new Date(event.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                if (daysUntil >= 0 && daysUntil <= 30) score += 15; // Within a month
                else if (daysUntil > 30 && daysUntil <= 90) score += 10; // Within 3 months
                else if (daysUntil > 0) score += 5;
            } catch {}
        }

        // Has distinct registration link bonus
        if (event.rsvpUrl && event.rsvpUrl !== event.websiteUrl) score += 12;

        // Has date bonus
        if (event.eventDate) score += 8;

        // Has prize pool bonus
        if (event.prizePool) score += 7;

        // Has description quality bonus
        if (event.description && event.description.length > 80) score += 5;

        // Platform trust bonus
        const trustedPlatforms: Record<string, number> = {
            devpost: 12, unstop: 12, eventbrite: 10, luma: 10, meetup: 8,
            hackerearth: 8, kaggle: 8, mlh: 10, devfolio: 10,
        };
        score += trustedPlatforms[event.sourcePlatform] || 0;

        // Filter match bonus
        if (filters.eventType?.length) {
            if (filters.eventType.some(t => event.eventType.toLowerCase().includes(t.toLowerCase()))) {
                score += 15;
            }
        }

        if (filters.location) {
            if (event.location.toLowerCase().includes(filters.location.toLowerCase())) {
                score += 12;
            }
        }

        if (filters.themes?.length) {
            const matchedThemes = filters.themes.filter(t =>
                event.themes.some(et => et.toLowerCase().includes(t.toLowerCase()))
            );
            score += matchedThemes.length * 4;
        }

        if (filters.freeOnly && event.isFree) score += 8;

        return { ...event, _score: score };
    });

    // Sort by score descending
    scored.sort((a, b) => b._score - a._score);

    // Remove _score and return
    return scored.map(({ _score, ...event }) => event);
}

/** Improved Jaccard bigram similarity for title dedup */
function similarityScore(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 4 || b.length < 4) return a === b ? 1 : 0;
    const bigrams = (s: string) => {
        const bg = new Set<string>();
        for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
        return bg;
    };
    const setA = bigrams(a);
    const setB = bigrams(b);
    let intersection = 0;
    for (const bg of setA) if (setB.has(bg)) intersection++;
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/** Detect platform from URL — expanded list */
function detectPlatform(url: string): string {
    const lurl = url.toLowerCase();
    const platforms: Record<string, string> = {
        "devpost.com": "devpost",
        "unstop.com": "unstop",
        "eventbrite.com": "eventbrite",
        "meetup.com": "meetup",
        "lu.ma": "luma",
        "hackerearth.com": "hackerearth",
        "kaggle.com": "kaggle",
        "mlh.io": "mlh",
        "codeforces.com": "codeforces",
        "leetcode.com": "leetcode",
        "hackerrank.com": "hackerrank",
        "devfolio.co": "devfolio",
        "gdg.community.dev": "gdg",
        "konfhub.com": "konfhub",
        "townscript.com": "townscript",
        "airmeet.com": "airmeet",
        "hopin.com": "hopin",
    };
    for (const [domain, platform] of Object.entries(platforms)) {
        if (lurl.includes(domain)) return platform;
    }
    return "web";
}

/** Enhanced confidence scoring based on extracted data completeness */
function calculateConfidence(raw: any): number {
    let score = 0.2; // Lower base, earn it
    if (raw.title && raw.title.length > 5) score += 0.12;
    if (raw.description?.length > 80) score += 0.12;
    if (raw.description?.length > 200) score += 0.05; // Bonus for detailed descriptions
    if (raw.event_date) score += 0.15;
    if (raw.rsvp_url && raw.rsvp_url.startsWith("http")) score += 0.12;
    if (raw.organizer && raw.organizer.length > 2) score += 0.06;
    if (raw.event_type && raw.event_type !== "unknown") score += 0.08;
    if (raw.themes?.length > 0) score += 0.05;
    if (raw.location && raw.location !== "Unknown") score += 0.06;
    if (raw.registration_deadline) score += 0.05;
    if (raw.prize_pool) score += 0.04;
    if (raw.team_size) score += 0.03;
    if (raw.eligibility) score += 0.03;
    return Math.min(Math.round(score * 100) / 100, 1);
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Run a full research session.
 * This is the main entry point for the Public Forms feature.
 *
 * @param query - Natural language search query
 * @param filters - Manual filters (optional)
 * @param opts - Options including signal, timeout, and progress callback
 * @returns Complete research session with events
 */
export async function runResearch(
    query: string,
    filters: ResearchFilters = {},
    opts: {
        onProgress?: (session: ResearchSession) => void;
        signal?: AbortSignal;
        timeoutMs?: number;
    } = {},
): Promise<ResearchSession> {
    const { onProgress, signal, timeoutMs = 120_000 } = opts;
    const startTime = Date.now();

    // Clear page cache at start of new research session
    clearPageCache();

    // Pipeline-level timeout
    const pipelineController = new AbortController();
    const pipelineTimer = setTimeout(() => pipelineController.abort(), timeoutMs);
    const onExternalAbort = () => pipelineController.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    const pipelineSignal = pipelineController.signal;

    const session: ResearchSession = {
        query,
        filters,
        status: "planning",
        events: [],
        totalSearchResults: 0,
        searchQueries: [],
    };

    const updateProgress = (
        phase: ResearchPhaseProgress["phase"],
        message: string,
        detail?: string,
        extra?: Partial<ResearchPhaseProgress>,
    ) => {
        session.status = phase === "complete" || phase === "error" ? phase : phase;
        session.phaseProgress = { phase, message, detail, ...extra };
        onProgress?.(session);
    };

    try {
        // Phase 1: Plan search strategy (Ollama orchestrator)
        console.log("[Research] Phase 1: Planning search strategy...");
        updateProgress("planning", "AI is planning search strategy...", `Analyzing: "${query.slice(0, 50)}..."`, { progress: 5 });

        const plan = await planSearchStrategy(query, filters, pipelineSignal);
        session.searchQueries = plan.searchQueries;
        console.log(`[Research] Plan: ${plan.searchQueries.length} queries, types: ${plan.eventTypes.join(", ")}`);
        updateProgress("planning", "Search plan ready", `${plan.searchQueries.length} search queries prepared`, { progress: 15 });

        // Phase 2: Execute web searches
        console.log("[Research] Phase 2: Executing web searches...");
        updateProgress("searching", "Searching the web...", `Running ${plan.searchQueries.length} targeted queries`, { progress: 20 });

        const searchResults = await executeSearchPhase(plan, pipelineSignal);
        session.totalSearchResults = searchResults.length;
        updateProgress("searching", "Web search complete", `Found ${searchResults.length} potential pages`, {
            progress: 40,
            pagesFound: searchResults.length,
        });

        // Phase 3: Pre-filter + deep extraction (5× Groq agents)
        console.log("[Research] Phase 3: Extracting event data...");
        updateProgress("extracting", "AI agents extracting event data...", `Analyzing ${Math.min(searchResults.length, 25)} pages with ${5} parallel agents`, { progress: 45 });

        const filteredResults = await preFilterResults(searchResults, pipelineSignal);
        updateProgress("extracting", "Classified pages, extracting events...", `${filteredResults.length} event pages identified`, {
            progress: 55,
            pagesFound: filteredResults.length,
        });

        const events = await deepExtractEvents(filteredResults, plan, pipelineSignal);
        updateProgress("extracting", "Extraction complete", `${events.length} events extracted from pages`, {
            progress: 80,
            eventsExtracted: events.length,
        });

        // Phase 4: Rank and deduplicate
        console.log("[Research] Phase 4: Ranking and deduplicating...");
        updateProgress("ranking", "Ranking and deduplicating results...", "Scoring events by relevance, freshness, and data quality", { progress: 90 });

        session.events = rankAndDeduplicate(events, filters);
        session.durationMs = Date.now() - startTime;

        updateProgress("complete", "Research complete!", `${session.events.length} events found in ${(session.durationMs / 1000).toFixed(1)}s`, {
            progress: 100,
            eventsExtracted: session.events.length,
        });

        session.status = "complete";
        console.log(`[Research] COMPLETE: ${session.events.length} events found in ${session.durationMs}ms`);
        return session;
    } catch (err: any) {
        console.error("[Research] Error:", err);
        const isCancelled = err.message?.includes("cancelled") || signal?.aborted || pipelineSignal.aborted;
        session.status = "error";
        session.error = isCancelled ? "Research cancelled" : (err.message || "Research failed");
        session.durationMs = Date.now() - startTime;
        updateProgress("error", isCancelled ? "Research cancelled" : "Research failed", session.error);
        return session;
    } finally {
        clearTimeout(pipelineTimer);
        signal?.removeEventListener("abort", onExternalAbort);
    }
}

/**
 * AI-powered iterative filter on already-fetched results.
 * Uses Groq to re-evaluate events against a new NL prompt.
 */
export async function filterExistingEvents(
    events: ResearchedEvent[],
    nlFilter: string,
    signal?: AbortSignal,
): Promise<ResearchedEvent[]> {
    if (events.length === 0) return [];

    // Build a concise events summary for the AI
    const eventsText = events
        .map((e, i) => `[${i}] "${e.title}" — ${e.eventType} — ${e.location} — ${e.themes.join(",")} — ${e.description?.slice(0, 80)}`)
        .join("\n");

    const messages: GroqMessage[] = [
        {
            role: "system",
            content: `You filter a list of events based on a user's natural language query. Return ONLY the indices of events that match the query. Be STRICT — only include events that clearly match. Current date: ${todayISO()}.`,
        },
        {
            role: "user",
            content: `Filter query: "${nlFilter}"\n\nEvents:\n${eventsText}\n\nReturn JSON: {"keep": [0, 2, 5, ...]}`,
        },
    ];

    try {
        const response = await groqPoolChat(messages, { json_mode: true, temperature: 0.1, signal });
        const parsed = extractJson<{ keep: number[] }>(response);
        if (!parsed?.keep) return events; // On failure, return all

        const filtered = parsed.keep
            .filter(i => i >= 0 && i < events.length)
            .map(i => events[i]);

        // If filter returns nothing, likely a miss — return all with warning
        if (filtered.length === 0 && events.length > 0) {
            console.warn("[Research] Filter returned 0 results — returning all events as fallback");
            return events;
        }
        return filtered;
    } catch (err: any) {
        console.error("[Research] Filter failed:", err.message);
        return events; // On error, return all
    }
}

/**
 * Sequential AI questioning — when user gives a vague query,
 * the orchestrator asks clarifying questions to refine the search.
 */
export async function generateClarifyingQuestions(
    query: string,
    signal?: AbortSignal,
): Promise<{ questions: { id: string; question: string; options: string[] }[] }> {
    const prompt = `A user wants to find public events. Their query is: "${query}"

This query is vague and could use more details. Generate 2-3 clarifying questions to help narrow down the search. Each question should have 3-5 suggested answer options.

Return JSON:
{
  "questions": [
    {
      "id": "type",
      "question": "What type of events are you looking for?",
      "options": ["Hackathons", "Coding Contests", "Networking Events", "Workshops", "Speaker Sessions"]
    },
    ...
  ]
}

Rules:
- Questions should be relevant to event discovery
- Options should be practical and common choices
- Don't ask obvious questions if the query already provides context
- Max 3 questions`;

    try {
        const result = await ollamaChat(
            [{ role: "user", content: prompt }],
            { temperature: 0.3, json: true, signal },
        );

        const parsed = extractJson<{ questions: any[] }>(result);
        if (parsed?.questions?.length) {
            return parsed as { questions: { id: string; question: string; options: string[] }[] };
        }
    } catch (err: any) {
        if (err.message?.includes("cancelled")) throw err;
        console.warn("[Research] Clarification generation failed:", err.message);
    }

    // Default questions
    return {
        questions: [
            {
                id: "type",
                question: "What type of events are you looking for?",
                options: ["Hackathons", "Coding Contests", "Networking Events", "Workshops", "Speaker Sessions", "Startup Pitching"],
            },
            {
                id: "location",
                question: "Do you have a location preference?",
                options: ["Virtual / Online", "India", "USA", "Europe", "No preference"],
            },
            {
                id: "themes",
                question: "Any specific themes or domains?",
                options: ["AI / Machine Learning", "Web Development", "Blockchain / Web3", "Cybersecurity", "Open Innovation"],
            },
        ],
    };
}
