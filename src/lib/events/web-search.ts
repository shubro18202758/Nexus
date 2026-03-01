// ===================================================================
// Web Search Engine v2 — Multi-Source Event Discovery with Resilience
//
// Searches multiple sources for public events:
//   1. DuckDuckGo HTML (no API key, reliable, rate-limited)
//   2. Brave Search API (free tier, 2000 req/month)
//   3. Direct platform scraping (Devpost, Unstop, etc.)
//
// Features:
//   - Retry with exponential backoff on failures
//   - Concurrent fetch limiting (max 5 parallel)
//   - Page content caching (avoids re-fetching same URLs)
//   - Dynamic year detection (no hardcoded dates)
//   - External AbortSignal support for cancellation
// ===================================================================

import * as cheerio from "cheerio";

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source: string;
    relevanceHint?: number; // 0-1 search-engine-level relevance
}

/** User-Agents rotation to reduce fingerprinting */
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
];
let uaIdx = 0;
function getUA(): string {
    return USER_AGENTS[uaIdx++ % USER_AGENTS.length];
}

/** Dynamic year — always reference current year */
function currentYear(): number {
    return new Date().getFullYear();
}

/** Simple LRU-ish page content cache */
const pageCache = new Map<string, { title: string; text: string; success: boolean; ts: number }>();
const PAGE_CACHE_MAX = 100;
const PAGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedPage(url: string) {
    const entry = pageCache.get(url);
    if (entry && Date.now() - entry.ts < PAGE_CACHE_TTL) return entry;
    return null;
}

function setCachedPage(url: string, data: { title: string; text: string; success: boolean }) {
    if (pageCache.size >= PAGE_CACHE_MAX) {
        // Evict oldest
        const oldest = [...pageCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) pageCache.delete(oldest[0]);
    }
    pageCache.set(url, { ...data, ts: Date.now() });
}

/** Concurrency limiter — runs at most `limit` tasks at a time */
async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let idx = 0;

    async function worker() {
        while (idx < tasks.length) {
            const i = idx++;
            results[i] = await tasks[i]();
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
    return results;
}

/** Sleep with AbortSignal support */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new Error("Aborted")); return; }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Aborted")); }, { once: true });
    });
}

/**
 * Primary: DuckDuckGo HTML search with retry.
 * Parses the HTML results page for links + snippets.
 */
async function searchDuckDuckGo(
    query: string,
    maxResults = 15,
    signal?: AbortSignal,
): Promise<SearchResult[]> {
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) return [];

        const encoded = encodeURIComponent(query);
        const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 20_000);
            const onAbort = () => controller.abort();
            signal?.addEventListener("abort", onAbort, { once: true });

            const res = await fetch(url, {
                headers: {
                    "User-Agent": getUA(),
                    Accept: "text/html",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate",
                },
                redirect: "follow",
                signal: controller.signal,
            });

            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);

            if (!res.ok) {
                console.warn(`[WebSearch] DuckDuckGo returned ${res.status} (attempt ${attempt + 1})`);
                if (res.status === 429 || res.status === 503) {
                    await sleep(2000 * (attempt + 1), signal).catch(() => {});
                    continue;
                }
                return [];
            }

            const html = await res.text();
            const $ = cheerio.load(html);
            const results: SearchResult[] = [];

            $(".result").each((i, el) => {
                if (results.length >= maxResults) return false;

                const $el = $(el);
                const titleEl = $el.find(".result__title .result__a");
                const snippetEl = $el.find(".result__snippet");
                const urlEl = $el.find(".result__url");

                const title = titleEl.text().trim();
                let href = titleEl.attr("href") || "";
                const snippet = snippetEl.text().trim();

                // Extract real URL from DuckDuckGo redirect
                if (href.includes("uddg=")) {
                    const match = href.match(/uddg=([^&]+)/);
                    if (match) href = decodeURIComponent(match[1]);
                }

                if (!href || href.startsWith("/")) {
                    const displayUrl = urlEl.text().trim();
                    if (displayUrl) href = displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`;
                }

                if (title && href && href.startsWith("http")) {
                    results.push({
                        title,
                        url: href,
                        snippet,
                        source: "duckduckgo",
                        relevanceHint: Math.max(0, 1 - i * 0.05), // Position-based relevance
                    });
                }
            });

            console.log(`[WebSearch] DuckDuckGo: ${results.length} results for "${query.slice(0, 60)}..."`);
            return results;
        } catch (err: any) {
            if (err.name === "AbortError" && signal?.aborted) return [];
            console.warn(`[WebSearch] DuckDuckGo attempt ${attempt + 1} failed:`, err.message);
            if (attempt < maxRetries) {
                await sleep(1500 * (attempt + 1), signal).catch(() => {});
            }
        }
    }

    return [];
}

/**
 * Fetch and extract text content from a web page.
 * Features: caching, retry, better content extraction, external signal.
 */
export async function fetchPageContent(
    url: string,
    opts: { maxChars?: number; signal?: AbortSignal; retries?: number } = {},
): Promise<{ title: string; text: string; success: boolean }> {
    const { maxChars = 10000, signal, retries = 1 } = opts;

    // Check cache first
    const cached = getCachedPage(url);
    if (cached) return { title: cached.title, text: cached.text, success: cached.success };

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal?.aborted) return { title: "", text: "", success: false };

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 18_000);
            const onAbort = () => controller.abort();
            signal?.addEventListener("abort", onAbort, { once: true });

            const res = await fetch(url, {
                headers: {
                    "User-Agent": getUA(),
                    Accept: "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                signal: controller.signal,
                redirect: "follow",
            });

            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);

            if (!res.ok) {
                if (attempt < retries) { await sleep(1000, signal).catch(() => {}); continue; }
                const result = { title: "", text: "", success: false };
                setCachedPage(url, result);
                return result;
            }

            const contentType = res.headers.get("content-type") || "";
            if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
                const result = { title: "", text: `[Non-HTML content: ${contentType}]`, success: false };
                setCachedPage(url, result);
                return result;
            }

            const html = await res.text();
            const $ = cheerio.load(html);

            // Remove noise
            $(
                "script, style, nav, footer, header, noscript, iframe, " +
                ".ad, .ads, .advertisement, .cookie-banner, .sidebar, " +
                ".nav, .menu, .popup, .modal, .social-share, .comments, " +
                "[role='navigation'], [role='banner'], [role='complementary']"
            ).remove();

            const title = $("title").text().trim()
                || $("h1").first().text().trim()
                || $('meta[property="og:title"]').attr("content")?.trim()
                || "";

            // Try progressively broader selectors for main content
            let text = "";
            const selectors = [
                "article",
                "main",
                "[role='main']",
                ".post-content",
                ".entry-content",
                ".article-body",
                ".content",
                "#content",
                ".event-details",
                ".event-description",
                ".challenge-description",
            ];

            for (const sel of selectors) {
                const el = $(sel);
                if (el.length > 0) {
                    text = el.first().text();
                    break;
                }
            }
            if (!text) text = $("body").text();

            // Extract structured data if available (JSON-LD)
            let structuredData = "";
            $('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const json = JSON.parse($(el).text());
                    if (json["@type"]?.match?.(/Event|Competition|Hackathon/i) || json.name) {
                        structuredData += `\n[Structured: ${json.name || ""} | ${json.startDate || ""} | ${json.location?.name || json.location || ""}]`;
                    }
                } catch {}
            });

            // Also extract key meta tags
            const ogDesc = $('meta[property="og:description"]').attr("content") || "";
            const metaDesc = $('meta[name="description"]').attr("content") || "";
            const extraMeta = [ogDesc, metaDesc].filter(Boolean).join(" | ");

            // Clean up whitespace
            text = text
                .replace(/\s+/g, " ")
                .replace(/\n\s*\n/g, "\n")
                .trim();

            // Combine: structured data first (most useful), then meta, then page text
            const fullText = [structuredData, extraMeta ? `[Meta: ${extraMeta}]` : "", text]
                .filter(Boolean)
                .join("\n")
                .slice(0, maxChars);

            const result = { title, text: fullText, success: true };
            setCachedPage(url, result);
            return result;
        } catch (err: any) {
            if (err.name === "AbortError" && signal?.aborted) {
                return { title: "", text: "", success: false };
            }
            if (attempt < retries) {
                await sleep(1000 * (attempt + 1), signal).catch(() => {});
                continue;
            }
            console.error(`[WebSearch] Failed to fetch ${url}:`, err.message);
            const result = { title: "", text: "", success: false };
            setCachedPage(url, result);
            return result;
        }
    }

    return { title: "", text: "", success: false };
}

/**
 * Batch fetch multiple URLs concurrently with a concurrency limit.
 * Prevents overwhelming network / getting rate-limited.
 */
export async function fetchPagesBatch(
    urls: string[],
    opts: { maxChars?: number; signal?: AbortSignal; concurrency?: number } = {},
): Promise<Map<string, { title: string; text: string; success: boolean }>> {
    const { maxChars = 10000, signal, concurrency = 5 } = opts;
    const results = new Map<string, { title: string; text: string; success: boolean }>();

    const tasks = urls.map(url => async () => {
        const content = await fetchPageContent(url, { maxChars, signal });
        results.set(url, content);
        return content;
    });

    await pLimit(tasks, concurrency);
    return results;
}

/**
 * Generate multiple targeted search queries for event discovery.
 * Uses dynamic year — no hardcoded dates.
 */
function generateSearchQueries(
    baseQuery: string,
    eventType?: string,
    location?: string,
): string[] {
    const year = currentYear();
    const queries: string[] = [];

    // Core query
    queries.push(`${baseQuery} ${year} registration form`);

    // With event type specifiers
    if (eventType) {
        queries.push(`${eventType} ${baseQuery} ${year} apply`);
    }

    // Location-specific
    if (location) {
        queries.push(`${baseQuery} ${location} ${year}`);
    }

    // Platform-specific queries for better coverage
    queries.push(`site:devpost.com ${baseQuery} ${year}`);
    queries.push(`site:unstop.com ${baseQuery} ${year}`);
    queries.push(`site:eventbrite.com ${baseQuery} ${year}`);

    // Add "upcoming" variant
    queries.push(`upcoming ${baseQuery} open registration ${year}`);

    // Add a recency-focused variant
    queries.push(`${baseQuery} ${year} latest upcoming deadline`);

    return queries.slice(0, 8); // Max 8 parallel searches
}

/** Normalize URL for deduplication */
export function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        // Remove trailing slash, www prefix, tracking params
        u.searchParams.delete("utm_source");
        u.searchParams.delete("utm_medium");
        u.searchParams.delete("utm_campaign");
        u.searchParams.delete("ref");
        u.searchParams.delete("fbclid");
        let normalized = u.origin.replace("://www.", "://") + u.pathname.replace(/\/+$/, "");
        if (u.search && u.searchParams.toString()) {
            normalized += "?" + u.searchParams.toString();
        }
        return normalized.toLowerCase();
    } catch {
        return url.replace(/\/+$/, "").replace(/^https?:\/\/www\./, "https://").toLowerCase();
    }
}

/**
 * Full web search — runs multiple queries with staggered concurrency.
 * Returns deduplicated results from all queries.
 * Supports external AbortSignal for cancellation.
 */
export async function webSearch(
    query: string,
    opts: {
        eventType?: string;
        location?: string;
        maxResultsPerQuery?: number;
        maxTotalResults?: number;
        signal?: AbortSignal;
    } = {},
): Promise<SearchResult[]> {
    const { eventType, location, maxResultsPerQuery = 12, maxTotalResults = 40, signal } = opts;

    const queries = generateSearchQueries(query, eventType, location);
    console.log(`[WebSearch] Executing ${queries.length} searches`);

    // Stagger searches: run in batches of 3 to avoid rate-limiting
    const resultSets: SearchResult[][] = [];
    for (let i = 0; i < queries.length; i += 3) {
        if (signal?.aborted) break;
        const batch = queries.slice(i, i + 3);
        const batchResults = await Promise.all(
            batch.map(q => searchDuckDuckGo(q, maxResultsPerQuery, signal)),
        );
        resultSets.push(...batchResults);
        // Small delay between batches to be polite
        if (i + 3 < queries.length) {
            await sleep(500, signal).catch(() => {});
        }
    }

    // Flatten and deduplicate by normalized URL
    const seen = new Set<string>();
    const allResults: SearchResult[] = [];

    for (const results of resultSets) {
        for (const r of results) {
            const normalized = normalizeUrl(r.url);
            if (!seen.has(normalized) && allResults.length < maxTotalResults) {
                seen.add(normalized);
                allResults.push(r);
            }
        }
    }

    console.log(`[WebSearch] Total deduplicated results: ${allResults.length}`);
    return allResults;
}

/**
 * Search specifically for event RSVP forms and registration pages.
 * Enhanced with better keyword scoring and signal support.
 */
export async function searchEventForms(
    query: string,
    opts: {
        eventType?: string;
        location?: string;
        themes?: string[];
        signal?: AbortSignal;
    } = {},
): Promise<SearchResult[]> {
    const { eventType, location, themes, signal } = opts;

    // Build enhanced query for form-finding
    let enhancedQuery = query;
    if (themes && themes.length > 0) {
        enhancedQuery += ` ${themes.slice(0, 3).join(" ")}`;
    }

    // Run the main search
    const results = await webSearch(enhancedQuery, {
        eventType,
        location,
        maxResultsPerQuery: 14,
        maxTotalResults: 50,
        signal,
    });

    // Boost results that look like registration/form pages
    const formKeywords = [
        "register", "registration", "apply", "sign up", "signup",
        "rsvp", "form", "submit", "participate", "enroll",
        "devpost", "unstop", "eventbrite", "luma", "meetup",
        "hackathon", "challenge", "competition", "contest",
    ];

    // Platform domain boost — higher trust
    const trustedDomains = [
        "devpost.com", "unstop.com", "eventbrite.com", "luma.com",
        "meetup.com", "hackerearth.com", "kaggle.com", "devfolio.co",
        "gdg.community.dev", "mlh.io",
    ];

    return results
        .map(r => {
            const textLower = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
            let formScore = formKeywords.reduce(
                (score, kw) => score + (textLower.includes(kw) ? 1 : 0),
                0,
            );
            // Trusted domain bonus
            if (trustedDomains.some(d => r.url.toLowerCase().includes(d))) {
                formScore += 3;
            }
            // Position-based relevance from search engine
            if (r.relevanceHint) formScore += r.relevanceHint * 2;
            return { ...r, _formScore: formScore };
        })
        .sort((a, b) => (b as any)._formScore - (a as any)._formScore)
        .map(({ _formScore, ...r }) => r);
}

/** Clear page cache (useful between research sessions) */
export function clearPageCache() {
    pageCache.clear();
}
