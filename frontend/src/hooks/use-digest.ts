"use client";

// ===================================================================
// useDigest — Zustand store for Daily Digest state + preferences.
// Persisted to localStorage so domain selections survive reloads.
// ===================================================================

import { create } from "zustand";
import { DOMAINS, type DomainDef, getDomainById } from "@/lib/digest-domains";
import type {
    FilterConfig,
    FilteredResult,
    FilterAnalytics,
    FilterResponse,
} from "@/lib/digest/digest-filter-engine";
import { DEFAULT_FILTER_CONFIG } from "@/lib/digest/digest-filter-engine";

// --- Fast HTML Entity Decoder ---
const decodeHTMLEntities = (text: string) => {
    if (!text) return text;
    return text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        .replace(/&(amp|apos|quot|lt|gt|#8220|#8221|#8216|#8217|nbsp|mdash|endash);/g, (match, entity) => {
            const map: Record<string, string> = {
                'amp': '&', 'apos': "'", 'quot': '"', 'lt': '<', 'gt': '>',
                '#8220': '"', '#8221': '"', '#8216': "'", '#8217': "'",
                'nbsp': ' ', 'mdash': '—', 'endash': '–'
            };
            return map[entity] || match;
        });
};

// ── Feed Item Shape ────────────────────────────────────
export interface FeedItem {
    id: string;
    title: string;
    summary: string;
    aiSummary: string;
    url: string;
    source: string;
    sourceIcon?: string;
    imageUrl?: string;
    videoUrl?: string;
    publishedAt: string;
    domain: string;
    domainColor: string;
    relevanceScore: number;
    sentiment: "positive" | "neutral" | "negative";
    tags: string[];
    type: "article" | "video" | "social" | "research";
}

export interface DomainSettings {
    freshness: "1h" | "6h" | "24h" | "7d";
    contentTypes: ("article" | "video" | "social" | "research")[];
    excludeKeywords: string[];
    notifications: boolean;
}

export type LayoutMode = "grid" | "list" | "magazine";
export type ContentDensity = "compact" | "comfortable" | "spacious";
export type FeedTab = "foryou" | "latest" | "trending" | "videos";

interface DigestStore {
    // ── Domain selection ──
    activeDomains: string[];
    domainSettings: Record<string, DomainSettings>;
    // ── Global settings ──
    layout: LayoutMode;
    contentDensity: ContentDensity;
    refreshInterval: number;
    showCharts: boolean;
    showVideos: boolean;
    activeTab: FeedTab;
    // ── Feed state ──
    feedItems: FeedItem[];
    isLoading: boolean;
    lastRefreshed: number;
    trendingTopics: { topic: string; count: number; sentiment: string }[];
    // ── NL Filter state ──
    filterConfig: FilterConfig;
    filterResults: FilteredResult[];
    filterAnalytics: FilterAnalytics | null;
    isFiltering: boolean;
    filterActive: boolean;
    filterHistory: string[];  // recent queries
    // ── Actions ──
    toggleDomain: (id: string) => void;
    setActiveDomains: (ids: string[]) => void;
    updateDomainSettings: (id: string, settings: Partial<DomainSettings>) => void;
    setLayout: (layout: LayoutMode) => void;
    setContentDensity: (density: ContentDensity) => void;
    setRefreshInterval: (mins: number) => void;
    setShowCharts: (show: boolean) => void;
    setShowVideos: (show: boolean) => void;
    setActiveTab: (tab: FeedTab) => void;
    refreshFeed: () => Promise<void>;
    // ── Filter Actions ──
    setFilterConfig: (config: Partial<FilterConfig>) => void;
    runFilter: () => Promise<void>;
    clearFilter: () => void;
}

// Default domain settings
const DEFAULT_DOMAIN_SETTINGS: DomainSettings = {
    freshness: "24h",
    contentTypes: ["article", "video", "social", "research"],
    excludeKeywords: [],
    notifications: false,
};

// ── RSS parsing helper (simple XML → items) ──
function parseRSSItems(xml: string, domain: DomainDef): FeedItem[] {
    const items: FeedItem[] = [];
    // Match <item>...</item> or <entry>...</entry> blocks
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let match: RegExpExecArray | null;
    let counter = 0;

    while ((match = itemRegex.exec(xml)) !== null && counter < 8) {
        const block = match[1];
        const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || "";
        const link = block.match(/<link[^>]*href="([^"]*)"/)?.[1]
            || block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() || "";
        const descMatch = block.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
            block.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i) ||
            block.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i) ||
            block.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);

        // Decode HTML entities FIRST so &lt;img src=...&gt; becomes <img src=...>
        const rawDesc = descMatch?.[1]?.trim() || "";
        const desc = decodeHTMLEntities(rawDesc);

        const pubDate = block.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/)?.[1]?.trim() || "";

        let imageUrl: string | undefined = undefined;
        // Check for common image locations
        const mediaHit = block.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*url=(?:"|')([^"']+)(?:"|')/i);
        if (mediaHit) {
            imageUrl = mediaHit[1];
        } else {
            const imgHit = desc.match(/<img[^>]*src=(?:"|')([^"']+)(?:"|')/i);
            if (imgHit) imageUrl = imgHit[1];
            else {
                // Try to find image element directly if HTML isn't in CDATA
                const rawImgHit = block.match(/<image[^>]*>\s*<url[^>]*>([\s\S]*?)<\/url>\s*<\/image>/i);
                if (rawImgHit) imageUrl = rawImgHit[1].trim();
            }
        }

        if (title && link) {
            // Aggressively strip all remaining HTML tags
            const cleanDesc = desc.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim().substring(0, 300);
            items.push({
                id: `${domain.id}-${counter}-${Date.now()}`,
                title: decodeHTMLEntities(title),
                summary: cleanDesc,
                aiSummary: "",
                url: link.trim(),
                source: new URL(link.trim()).hostname.replace("www.", ""),
                imageUrl,
                videoUrl: link.includes("youtube.com") || link.includes("youtu.be") ? link.trim() : undefined,
                publishedAt: pubDate || new Date().toISOString(),
                domain: domain.id,
                domainColor: domain.accentColor,
                relevanceScore: Math.floor(60 + Math.random() * 40),
                sentiment: (["positive", "neutral", "negative"] as const)[Math.floor(Math.random() * 3)],
                tags: domain.searchKeywords.slice(0, 3),
                type: link.includes("youtube") ? "video" : "article",
            });
            counter++;
        }
    }
    return items;
}

// ── Fetch feeds for a single domain ──
async function fetchDomainFeed(domain: DomainDef): Promise<FeedItem[]> {
    if (domain.rssFeeds.length === 0) {
        // Generate placeholder items for domains without RSS feeds
        return generatePlaceholderItems(domain);
    }

    const allItems: FeedItem[] = [];

    for (const feedUrl of domain.rssFeeds) {
        try {
            const res = await fetch(`/api/digest?feedUrl=${encodeURIComponent(feedUrl)}`, {
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;
            const xml = await res.text();
            const items = parseRSSItems(xml, domain);
            allItems.push(...items);
        } catch {
            // Feed failed — skip silently
        }
    }

    return allItems.length > 0 ? allItems : generatePlaceholderItems(domain);
}

// ── Generate realistic placeholder items for domains without RSS ──
function generatePlaceholderItems(domain: DomainDef): FeedItem[] {
    const headlines = getHeadlinesForDomain(domain);
    return headlines.map((headline, i) => ({
        id: `${domain.id}-gen-${i}-${Date.now()}`,
        title: headline.title,
        summary: headline.summary,
        aiSummary: `AI Analysis: ${headline.summary}`,
        url: headline.url,
        source: headline.source,
        imageUrl: undefined,
        videoUrl: headline.videoUrl,
        publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
        domain: domain.id,
        domainColor: domain.accentColor,
        relevanceScore: Math.floor(70 + Math.random() * 30),
        sentiment: (["positive", "neutral", "negative"] as const)[Math.floor(Math.random() * 3)],
        tags: domain.searchKeywords.slice(0, 3),
        type: headline.videoUrl ? "video" : "article",
    }));
}

function getHeadlinesForDomain(domain: DomainDef): { title: string; summary: string; url: string; source: string; videoUrl?: string }[] {
    const keywords = domain.searchKeywords;
    const kw = keywords[0] || domain.name;
    const kw2 = keywords[1] || domain.name;
    return [
        {
            title: `Breaking: Major Developments in ${domain.name} — What Students Need to Know`,
            summary: `A comprehensive look at the latest trends in ${kw} that are reshaping the field. Experts weigh in on what to watch in 2026.`,
            url: `https://news.google.com/search?q=${encodeURIComponent(kw)}`,
            source: "news.google.com",
        },
        {
            title: `Top 10 ${domain.name} Resources Every Student Should Bookmark`,
            summary: `Curated resources covering ${kw} and ${kw2} — from beginner to advanced. Updated monthly by industry professionals.`,
            url: `https://news.google.com/search?q=${encodeURIComponent(kw2)}`,
            source: "news.google.com",
        },
        {
            title: `${domain.name} in 2026: Trends, Innovations, and Opportunities`,
            summary: `The landscape of ${kw} is evolving rapidly. Here's what the latest research says about emerging opportunities.`,
            url: `https://news.google.com/search?q=${encodeURIComponent(domain.name + " 2026")}`,
            source: "news.google.com",
        },
        {
            title: `How ${domain.name} Is Being Transformed by AI`,
            summary: `AI is disrupting ${kw} in unprecedented ways. From automation to insights — understanding the impact.`,
            url: `https://news.google.com/search?q=${encodeURIComponent(domain.name + " AI")}`,
            source: "news.google.com",
        },
        {
            title: `Watch: Introduction to ${domain.name} — Complete Guide`,
            summary: `A detailed video walkthrough covering the fundamentals of ${kw}. Perfect for students looking to dive deep.`,
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(domain.name + " tutorial 2026")}`,
            source: "youtube.com",
            videoUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(domain.name + " tutorial 2026")}`,
        },
    ];
}

// ── Store ──
export const useDigest = create<DigestStore>((set, get) => {
    // Load persisted state from localStorage
    let persisted: Partial<DigestStore> = {};
    if (typeof window !== "undefined") {
        try {
            const raw = localStorage.getItem("nexus-digest-prefs");
            if (raw) persisted = JSON.parse(raw);
        } catch { /* ignore */ }
    }

    const persist = (partial: Partial<DigestStore>) => {
        if (typeof window !== "undefined") {
            const state = get();
            localStorage.setItem("nexus-digest-prefs", JSON.stringify({
                activeDomains: partial.activeDomains ?? state.activeDomains,
                domainSettings: partial.domainSettings ?? state.domainSettings,
                layout: partial.layout ?? state.layout,
                contentDensity: partial.contentDensity ?? state.contentDensity,
                refreshInterval: partial.refreshInterval ?? state.refreshInterval,
                showCharts: partial.showCharts ?? state.showCharts,
                showVideos: partial.showVideos ?? state.showVideos,
            }));
        }
    };

    return {
        // Defaults with persisted overrides
        activeDomains: persisted.activeDomains || ["artificial-intelligence", "web-development", "startups"],
        domainSettings: persisted.domainSettings || {},
        layout: persisted.layout || "grid",
        contentDensity: persisted.contentDensity || "comfortable",
        refreshInterval: persisted.refreshInterval || 30,
        showCharts: persisted.showCharts ?? true,
        showVideos: persisted.showVideos ?? true,
        activeTab: "foryou",
        feedItems: [],
        isLoading: false,
        lastRefreshed: 0,
        trendingTopics: [],
        // NL Filter defaults
        filterConfig: { ...DEFAULT_FILTER_CONFIG },
        filterResults: [],
        filterAnalytics: null,
        isFiltering: false,
        filterActive: false,
        filterHistory: [],

        toggleDomain: (id) => {
            set((state) => {
                const next = state.activeDomains.includes(id)
                    ? state.activeDomains.filter((d) => d !== id)
                    : [...state.activeDomains, id];
                persist({ activeDomains: next });
                return { activeDomains: next };
            });
        },

        setActiveDomains: (ids) => {
            persist({ activeDomains: ids });
            set({ activeDomains: ids });
        },

        updateDomainSettings: (id, settings) => {
            set((state) => {
                const updated = {
                    ...state.domainSettings,
                    [id]: { ...(state.domainSettings[id] || DEFAULT_DOMAIN_SETTINGS), ...settings },
                };
                persist({ domainSettings: updated });
                return { domainSettings: updated };
            });
        },

        setLayout: (layout) => { persist({ layout }); set({ layout }); },
        setContentDensity: (contentDensity) => { persist({ contentDensity }); set({ contentDensity }); },
        setRefreshInterval: (refreshInterval) => { persist({ refreshInterval }); set({ refreshInterval }); },
        setShowCharts: (showCharts) => { persist({ showCharts }); set({ showCharts }); },
        setShowVideos: (showVideos) => { persist({ showVideos }); set({ showVideos }); },
        setActiveTab: (activeTab) => set({ activeTab }),

        refreshFeed: async () => {
            const { activeDomains } = get();
            if (activeDomains.length === 0) {
                set({ feedItems: [], isLoading: false });
                return;
            }
            set({ isLoading: true });

            try {
                // Fetch feeds for all active domains in parallel
                const domainDefs = activeDomains
                    .map(getDomainById)
                    .filter(Boolean) as DomainDef[];

                const results = await Promise.allSettled(
                    domainDefs.map((d) => fetchDomainFeed(d))
                );

                const allItems: FeedItem[] = [];
                for (const r of results) {
                    if (r.status === "fulfilled") allItems.push(...r.value);
                }

                // Sort by relevance score (for "For You" tab)
                allItems.sort((a, b) => b.relevanceScore - a.relevanceScore);

                // Extract trending topics
                const topicCount = new Map<string, number>();
                for (const item of allItems) {
                    for (const tag of item.tags) {
                        topicCount.set(tag, (topicCount.get(tag) || 0) + 1);
                    }
                }
                const trendingTopics = Array.from(topicCount.entries())
                    .map(([topic, count]) => ({ topic, count, sentiment: "neutral" }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15);

                // Set items immediately so UI renders fast
                set({
                    feedItems: allItems,
                    isLoading: false,
                    lastRefreshed: Date.now(),
                    trendingTopics,
                });

                // --- Batch OG image resolution (non-blocking) ---
                // Identify items without images and fetch OG images for them
                const itemsNeedingImages = allItems.filter(item => !item.imageUrl && item.url);
                if (itemsNeedingImages.length > 0) {
                    const urlsToResolve = itemsNeedingImages.map(item => item.url);
                    try {
                        const ogRes = await fetch("/api/digest/og-batch", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ urls: urlsToResolve }),
                            signal: AbortSignal.timeout(60000), // 60s for batch
                        });
                        if (ogRes.ok) {
                            const { results: ogResults } = await ogRes.json();
                            // Merge resolved images into feed items
                            const currentItems = get().feedItems;
                            const updated = currentItems.map(item => {
                                if (!item.imageUrl && ogResults[item.url]) {
                                    return { ...item, imageUrl: ogResults[item.url] };
                                }
                                return item;
                            });
                            set({ feedItems: updated });
                        }
                    } catch {
                        // OG batch failed — items will use category hero fallback
                    }
                }
            } catch (error) {
                console.error("Feed refresh failed:", error);
                set({ isLoading: false });
            }
        },

        // ── NL Filter Actions ──
        setFilterConfig: (partial) => {
            set((state) => ({
                filterConfig: { ...state.filterConfig, ...partial },
            }));
        },

        runFilter: async () => {
            const { feedItems, filterConfig } = get();
            if (!filterConfig.query.trim() || feedItems.length === 0) return;

            set({ isFiltering: true, filterActive: true });

            try {
                // Convert FeedItems to filter format
                const filterItems = feedItems.map(item => ({
                    id: item.id,
                    title: item.title,
                    summary: item.summary || item.aiSummary,
                    source: item.source,
                    domain: item.domain,
                    tags: item.tags,
                    sentiment: item.sentiment,
                    relevanceScore: item.relevanceScore,
                    publishedAt: item.publishedAt,
                    type: item.type,
                }));

                const res = await fetch("/api/digest/filter", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: filterItems, config: filterConfig }),
                    signal: AbortSignal.timeout(30000),
                });

                if (res.ok) {
                    const data: FilterResponse = await res.json();
                    // Add query to history (deduped, max 10)
                    const history = get().filterHistory;
                    const newHistory = [filterConfig.query, ...history.filter(h => h !== filterConfig.query)].slice(0, 10);
                    set({
                        filterResults: data.results,
                        filterAnalytics: data.analytics,
                        isFiltering: false,
                        filterHistory: newHistory,
                    });
                } else {
                    set({ isFiltering: false });
                }
            } catch (error) {
                console.error("Filter failed:", error);
                set({ isFiltering: false });
            }
        },

        clearFilter: () => {
            set({
                filterActive: false,
                filterResults: [],
                filterAnalytics: null,
                filterConfig: { ...DEFAULT_FILTER_CONFIG },
            });
        },
    };
});
