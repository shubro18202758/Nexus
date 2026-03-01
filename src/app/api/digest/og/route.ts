// ===================================================================
// Daily Digest — Image Proxy
// Scrapes OG/twitter/fallback image from article URL, then PROXIES
// the image bytes through our server to bypass COEP/CORS restrictions.
// Usage: <img src="/api/digest/og?url=ARTICLE_URL" />
// Returns 404 if no image found (so <img onError> fires properly).
// ===================================================================

import { NextRequest, NextResponse } from "next/server";

// In-memory cache: articleUrl → imageUrl
const ogCache = new Map<string, string | null>();
// Image data cache: imageUrl → { data, contentType }
const imageDataCache = new Map<string, { data: ArrayBuffer; contentType: string }>();

async function scrapeOgImage(articleUrl: string): Promise<string | null> {
    if (ogCache.has(articleUrl)) return ogCache.get(articleUrl) || null;

    try {
        const response = await fetch(articleUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        });

        if (!response.ok) { ogCache.set(articleUrl, null); return null; }

        const reader = response.body?.getReader();
        let html = "";
        if (reader) {
            const decoder = new TextDecoder();
            let done = false;
            while (!done && html.length < 150000) {
                const { value, done: d } = await reader.read();
                done = d;
                if (value) html += decoder.decode(value, { stream: !done });
            }
            try { reader.cancel(); } catch { }
        }

        let imageUrl: string | null = null;

        // Strategy 1: og:image (handles both attribute orderings)
        const ogMatch = html.match(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i);
        if (ogMatch) imageUrl = ogMatch[1];

        // Strategy 2: twitter:image
        if (!imageUrl) {
            const twMatch = html.match(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i);
            if (twMatch) imageUrl = twMatch[1];
        }

        // Strategy 3: <link rel="image_src">
        if (!imageUrl) {
            const linkMatch = html.match(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
            if (linkMatch) imageUrl = linkMatch[1];
        }

        // Strategy 4: JSON-LD structured data
        if (!imageUrl) {
            const jsonldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
            if (jsonldMatch) {
                try {
                    const ld = JSON.parse(jsonldMatch[1]);
                    const img = ld.image || ld.thumbnailUrl;
                    if (typeof img === "string") imageUrl = img;
                    else if (Array.isArray(img) && img.length > 0) imageUrl = typeof img[0] === "string" ? img[0] : img[0]?.url;
                    else if (img?.url) imageUrl = img.url;
                } catch { }
            }
        }

        // Strategy 5: <meta name="thumbnail">
        if (!imageUrl) {
            const thumbMatch = html.match(/<meta[^>]*name=["']thumbnail["'][^>]*content=["']([^"']+)["']/i);
            if (thumbMatch) imageUrl = thumbMatch[1];
        }

        // Strategy 6: First content image (with lazy-load + srcset support)
        if (!imageUrl) {
            // Try data-src, data-lazy-src, data-original (lazy-loaded images)
            const lazyMatches = html.matchAll(/<img[^>]*(?:data-src|data-lazy-src|data-original)=["']([^"']+)["'][^>]*/gi);
            for (const m of lazyMatches) {
                const src = m[1];
                if (src.includes("avatar") || src.includes("icon") || src.includes("logo") ||
                    src.includes("emoji") || src.includes("gravatar") || src.includes("pixel") ||
                    src.includes("data:image") || src.endsWith(".svg")) continue;
                imageUrl = src;
                break;
            }
        }

        // Strategy 7: Regular <img src="..."> (skip tiny icons)
        if (!imageUrl) {
            const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*/gi);
            for (const m of imgMatches) {
                const src = m[1];
                if (src.includes("avatar") || src.includes("icon") || src.includes("logo") ||
                    src.includes("emoji") || src.includes("badge") || src.includes("gravatar") ||
                    src.includes("1x1") || src.includes("pixel") || src.includes("tracking") ||
                    src.includes("data:image") || src.endsWith(".svg") || src.endsWith(".gif") ||
                    src.includes("spinner") || src.includes("loading") || src.includes("ad-")) continue;
                const widthMatch = m[0].match(/width=["']?(\d+)/i);
                const heightMatch = m[0].match(/height=["']?(\d+)/i);
                if (widthMatch && parseInt(widthMatch[1]) < 80) continue;
                if (heightMatch && parseInt(heightMatch[1]) < 80) continue;
                imageUrl = src;
                break;
            }
        }

        // Strategy 8: <picture><source srcset="...">
        if (!imageUrl) {
            const sourceMatch = html.match(/<picture[^>]*>[\s\S]*?<source[^>]*srcset=["']([^"',\s]+)/i);
            if (sourceMatch) imageUrl = sourceMatch[1];
        }

        // Strategy 9: srcset on <img> (pick the largest resolution)
        if (!imageUrl) {
            const srcsetMatch = html.match(/<img[^>]*srcset=["']([^"']+)["']/i);
            if (srcsetMatch) {
                const candidates = srcsetMatch[1].split(",").map(s => s.trim().split(/\s+/));
                // Pick the last (usually largest) candidate
                const best = candidates[candidates.length - 1];
                if (best && best[0]) imageUrl = best[0];
            }
        }

        // Resolve relative URLs
        if (imageUrl && !imageUrl.startsWith("http")) {
            try { imageUrl = new URL(imageUrl, articleUrl).href; } catch { imageUrl = null; }
        }

        // Decode HTML entities in URL
        if (imageUrl) {
            imageUrl = imageUrl.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        }

        ogCache.set(articleUrl, imageUrl);
        return imageUrl;
    } catch {
        ogCache.set(articleUrl, null);
        return null;
    }
}

async function fetchImageData(imageUrl: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
    if (imageDataCache.has(imageUrl)) return imageDataCache.get(imageUrl)!;

    try {
        const res = await fetch(imageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/webp,image/avif,image/*,*/*",
                "Referer": new URL(imageUrl).origin + "/",
            },
            signal: AbortSignal.timeout(10000),
            redirect: "follow",
        });

        if (!res.ok) return null;

        const contentType = res.headers.get("content-type") || "image/jpeg";
        // Reject if response isn't actually an image
        if (!contentType.startsWith("image/")) return null;

        const data = await res.arrayBuffer();

        // Only cache images under 2MB
        if (data.byteLength < 2 * 1024 * 1024) {
            imageDataCache.set(imageUrl, { data, contentType });
        }

        return { data, contentType };
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const articleUrl = request.nextUrl.searchParams.get("url");

    if (!articleUrl) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        // Step 1: Scrape image URL from the article
        const imageUrl = await scrapeOgImage(articleUrl);

        if (!imageUrl) {
            // Return 404 so <img onError> fires and card shows domain fallback
            return new NextResponse(null, { status: 404 });
        }

        // Step 2: Fetch the actual image and proxy the bytes
        const imageData = await fetchImageData(imageUrl);

        if (!imageData) {
            return new NextResponse(null, { status: 404 });
        }

        // Step 3: Return the image bytes directly from localhost — no COEP issues!
        return new NextResponse(imageData.data, {
            status: 200,
            headers: {
                "Content-Type": imageData.contentType,
                "Cache-Control": "public, max-age=86400, immutable",
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        });
    } catch {
        return new NextResponse(null, { status: 404 });
    }
}
