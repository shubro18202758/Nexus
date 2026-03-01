// ===================================================================
// Daily Digest — Batch OG Image Resolver
// Accepts multiple article URLs and returns OG image URLs for all.
// Called once after RSS parsing instead of per-card.
// POST /api/digest/og-batch { urls: string[] } → { results: Record<string, string|null> }
// ===================================================================

import { NextRequest, NextResponse } from "next/server";

// Shared cache with the single-URL endpoint
const ogCache = new Map<string, string | null>();

async function scrapeOgImageUrl(articleUrl: string): Promise<string | null> {
    if (ogCache.has(articleUrl)) return ogCache.get(articleUrl) || null;

    try {
        const response = await fetch(articleUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
            },
            signal: AbortSignal.timeout(12000),
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

        // 1. og:image
        const ogMatch = html.match(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i);
        if (ogMatch) imageUrl = ogMatch[1];

        // 2. twitter:image
        if (!imageUrl) {
            const twMatch = html.match(/<meta[^>]*name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i);
            if (twMatch) imageUrl = twMatch[1];
        }

        // 3. link[rel=image_src]
        if (!imageUrl) {
            const linkMatch = html.match(/<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
            if (linkMatch) imageUrl = linkMatch[1];
        }

        // 4. JSON-LD
        if (!imageUrl) {
            const jsonldMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
            for (const jm of jsonldMatches) {
                if (imageUrl) break;
                try {
                    const ld = JSON.parse(jm[1]);
                    const ldItems = Array.isArray(ld) ? ld : [ld];
                    for (const item of ldItems) {
                        const img = item.image || item.thumbnailUrl;
                        if (typeof img === "string") { imageUrl = img; break; }
                        if (Array.isArray(img) && img.length > 0) { imageUrl = typeof img[0] === "string" ? img[0] : img[0]?.url; break; }
                        if (img?.url) { imageUrl = img.url; break; }
                    }
                } catch { }
            }
        }

        // 5. meta[name=thumbnail]
        if (!imageUrl) {
            const thumbMatch = html.match(/<meta[^>]*name=["']thumbnail["'][^>]*content=["']([^"']+)["']/i);
            if (thumbMatch) imageUrl = thumbMatch[1];
        }

        // 6. Lazy-loaded images
        if (!imageUrl) {
            const lazyMatches = html.matchAll(/<img[^>]*(?:data-src|data-lazy-src|data-original|data-full-url)=["']([^"']+)["'][^>]*/gi);
            for (const m of lazyMatches) {
                const src = m[1];
                if (isNonContentImage(src)) continue;
                imageUrl = src;
                break;
            }
        }

        // 7. Regular <img src>
        if (!imageUrl) {
            const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*/gi);
            for (const m of imgMatches) {
                const src = m[1];
                if (isNonContentImage(src)) continue;
                const widthMatch = m[0].match(/width=["']?(\d+)/i);
                const heightMatch = m[0].match(/height=["']?(\d+)/i);
                if (widthMatch && parseInt(widthMatch[1]) < 80) continue;
                if (heightMatch && parseInt(heightMatch[1]) < 80) continue;
                imageUrl = src;
                break;
            }
        }

        // 8. <picture><source srcset>
        if (!imageUrl) {
            const sourceMatch = html.match(/<picture[^>]*>[\s\S]*?<source[^>]*srcset=["']([^"',\s]+)/i);
            if (sourceMatch) imageUrl = sourceMatch[1];
        }

        // 9. srcset on <img>
        if (!imageUrl) {
            const srcsetMatch = html.match(/<img[^>]*srcset=["']([^"']+)["']/i);
            if (srcsetMatch) {
                const candidates = srcsetMatch[1].split(",").map(s => s.trim().split(/\s+/));
                const best = candidates[candidates.length - 1];
                if (best?.[0] && !isNonContentImage(best[0])) imageUrl = best[0];
            }
        }

        // Resolve relative URLs
        if (imageUrl && !imageUrl.startsWith("http")) {
            try { imageUrl = new URL(imageUrl, articleUrl).href; } catch { imageUrl = null; }
        }
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

function isNonContentImage(src: string): boolean {
    const lower = src.toLowerCase();
    return lower.includes("avatar") || lower.includes("icon") || lower.includes("logo") ||
        lower.includes("emoji") || lower.includes("badge") || lower.includes("gravatar") ||
        lower.includes("1x1") || lower.includes("pixel") || lower.includes("tracking") ||
        lower.includes("data:image") || lower.endsWith(".svg") || lower.endsWith(".gif") ||
        lower.includes("spinner") || lower.includes("loading") || lower.includes("ad-") ||
        lower.includes("spacer") || lower.includes("blank");
}

// Process URLs in batches of `concurrency`
async function batchScrape(urls: string[], concurrency: number = 4): Promise<Record<string, string | null>> {
    const results: Record<string, string | null> = {};

    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const promises = batch.map(async (url) => {
            const imageUrl = await scrapeOgImageUrl(url);
            results[url] = imageUrl;
        });
        await Promise.allSettled(promises);
    }

    return results;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const urls: string[] = body.urls;

        if (!Array.isArray(urls) || urls.length === 0) {
            return NextResponse.json({ results: {} }, { status: 200 });
        }

        // Cap at 50 URLs per request
        const toProcess = urls.slice(0, 50);
        const results = await batchScrape(toProcess, 5);

        return NextResponse.json(
            { results },
            { status: 200, headers: { "Cache-Control": "public, max-age=1800" } }
        );
    } catch {
        return NextResponse.json({ results: {} }, { status: 200 });
    }
}
