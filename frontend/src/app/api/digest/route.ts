// ===================================================================
// Daily Digest — RSS Feed Proxy API Route
// Fetches RSS XML from public sources (CORS-safe server-side proxy).
// No external API keys required.
// ===================================================================

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const feedUrl = request.nextUrl.searchParams.get("feedUrl");

    if (!feedUrl) {
        return NextResponse.json({ error: "Missing feedUrl parameter" }, { status: 400 });
    }

    try {
        // Validate URL is a reasonable feed URL
        const url = new URL(feedUrl);
        if (!["http:", "https:"].includes(url.protocol)) {
            return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 });
        }

        const response = await fetch(feedUrl, {
            headers: {
                "User-Agent": "Slingshot-StudentOS/2.0 (RSS Reader)",
                "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, */*",
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return new NextResponse("Feed fetch failed", { status: response.status });
        }

        const text = await response.text();

        return new NextResponse(text, {
            status: 200,
            headers: {
                "Content-Type": "text/xml",
                "Cache-Control": "public, max-age=300", // Cache for 5 minutes
            },
        });
    } catch (error: any) {
        console.error(`[Digest API] Failed to fetch: ${feedUrl}`, error.message);
        return NextResponse.json(
            { error: "Failed to fetch feed" },
            { status: 502 }
        );
    }
}
