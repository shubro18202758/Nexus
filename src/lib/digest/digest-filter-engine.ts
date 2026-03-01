// ===================================================================
// Digest NL Filter Engine — AI-Powered Natural Language Feed Filter
//
// Multi-pass ranking pipeline that uses Groq LLM to filter daily
// digest feed items against a natural language query with:
//   Pass 1: Semantic keyword expansion & intent parsing
//   Pass 2: Per-item relevance scoring via LLM
//   Pass 3: Confidence calibration & ranking
//
// Returns ranked, scored results with detailed analysis metadata.
// ===================================================================

import {
  groqMsgChat,
  isMsgPoolAvailable,
  type GroqMsgMessage,
} from "@/lib/msg/groq-msg-pool";

// ── Types ──────────────────────────────────────────────

export interface DigestFilterItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  domain: string;
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
  relevanceScore: number;
  publishedAt: string;
  type: "article" | "video" | "social" | "research";
}

export interface FilterConfig {
  query: string;
  minConfidence: number;       // 0-1, default 0.30
  maxResults: number;          // default 50
  sentimentFilter: "all" | "positive" | "neutral" | "negative";
  contentTypes: ("article" | "video" | "social" | "research")[];
  domains: string[];           // empty = all
  dateRange: "1h" | "6h" | "24h" | "7d" | "30d" | "all";
  sortBy: "relevance" | "confidence" | "recency" | "sentiment";
  boostSources: string[];      // sources to prioritize
  excludeKeywords: string[];   // keywords to exclude
  semanticDepth: "fast" | "balanced" | "deep"; // controls LLM analysis depth
}

export interface FilteredResult {
  item: DigestFilterItem;
  confidence: number;         // 0-1
  matchReasons: string[];     // why this matched
  semanticScore: number;      // 0-100 semantic relevance
  keywordHits: string[];      // keywords that matched
  topicAlignment: number;     // 0-100
  sentimentMatch: boolean;
  recencyBoost: number;       // 0-20 extra points for fresh content
  sourceBoost: number;        // 0-10 extra for preferred sources
}

export interface FilterAnalytics {
  totalInput: number;
  totalOutput: number;
  passRate: number;           // percentage
  avgConfidence: number;
  avgSemanticScore: number;
  topKeywords: { keyword: string; count: number }[];
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  domainBreakdown: { domain: string; count: number; avgScore: number }[];
  sourceBreakdown: { source: string; count: number }[];
  contentTypeBreakdown: { type: string; count: number }[];
  processingTimeMs: number;
  engineUsed: string;
  queryExpansion: string[];
  confidenceDistribution: number[]; // histogram buckets [0-10, 10-20, ... 90-100]
}

export interface FilterResponse {
  results: FilteredResult[];
  analytics: FilterAnalytics;
}

// ── Default Config ──────────────────────────────────────

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  query: "",
  minConfidence: 0.30,
  maxResults: 50,
  sentimentFilter: "all",
  contentTypes: ["article", "video", "social", "research"],
  domains: [],
  dateRange: "all",
  sortBy: "relevance",
  boostSources: [],
  excludeKeywords: [],
  semanticDepth: "balanced",
};

// ── Local Scoring (Keyword-Based Fallback) ──────────────

/** Semantic keyword expansion for common topics */
const TOPIC_EXPANSIONS: Record<string, string[]> = {
  "ai": ["artificial intelligence", "machine learning", "deep learning", "neural", "gpt", "llm", "transformer", "nlp", "computer vision", "generative"],
  "web": ["website", "frontend", "backend", "react", "nextjs", "javascript", "typescript", "html", "css", "api", "http"],
  "crypto": ["cryptocurrency", "bitcoin", "ethereum", "blockchain", "defi", "web3", "nft", "token", "mining", "wallet"],
  "startup": ["entrepreneurship", "venture capital", "funding", "seed", "series a", "unicorn", "ipo", "founder", "pitch"],
  "science": ["physics", "biology", "chemistry", "research", "experiment", "discovery", "paper", "journal", "peer review"],
  "security": ["cybersecurity", "hacking", "vulnerability", "exploit", "malware", "encryption", "firewall", "zero day", "breach"],
  "cloud": ["aws", "azure", "gcp", "kubernetes", "docker", "serverless", "microservices", "devops", "infrastructure"],
  "mobile": ["ios", "android", "flutter", "react native", "swift", "kotlin", "app", "smartphone"],
  "data": ["database", "sql", "nosql", "analytics", "big data", "data science", "visualization", "pipeline", "etl"],
  "design": ["ui", "ux", "figma", "interface", "user experience", "accessibility", "prototype", "wireframe"],
};

function expandQuery(query: string): string[] {
  const queryLower = query.toLowerCase().trim();
  const words = queryLower.split(/\s+/);
  const expanded = new Set<string>(words);
  // Also keep the full phrase
  if (words.length > 1) expanded.add(queryLower);

  for (const word of words) {
    // Forward expansion: word is a key → add all synonyms
    if (TOPIC_EXPANSIONS[word]) {
      expanded.add(word);
      for (const synonym of TOPIC_EXPANSIONS[word]) {
        expanded.add(synonym);
      }
    }
    // Forward partial match: word contains or is contained in a key
    for (const [key, synonyms] of Object.entries(TOPIC_EXPANSIONS)) {
      if (word.includes(key) || key.includes(word)) {
        expanded.add(key);
        for (const s of synonyms) expanded.add(s);
      }
    }
  }

  // Reverse expansion: if the full query phrase (or a word) matches a synonym value,
  // add the category key + all sibling synonyms
  for (const [key, synonyms] of Object.entries(TOPIC_EXPANSIONS)) {
    const matched = synonyms.some(syn =>
      queryLower.includes(syn) || syn.includes(queryLower) ||
      words.some(w => syn.includes(w) || w.includes(syn))
    );
    if (matched) {
      expanded.add(key);
      for (const s of synonyms) expanded.add(s);
    }
  }

  return Array.from(expanded);
}

function localScoreItem(item: DigestFilterItem, queryTerms: string[], excludeTerms: string[]): { score: number; hits: string[] } {
  const titleLower = item.title.toLowerCase();
  const summaryLower = item.summary.toLowerCase();
  const tagsLower = item.tags.map(t => t.toLowerCase());
  const domainLower = item.domain.toLowerCase();
  const searchText = `${titleLower} ${summaryLower} ${tagsLower.join(" ")} ${domainLower}`;

  // Check excludes first  
  for (const ex of excludeTerms) {
    if (searchText.includes(ex.toLowerCase())) {
      return { score: 0, hits: [] };
    }
  }

  let score = 0;
  const hits: string[] = [];

  for (const term of queryTerms) {
    const termLower = term.toLowerCase();
    // Title match (highest weight)
    if (titleLower.includes(termLower)) {
      score += 25;
      hits.push(`title:"${term}"`);
    }
    // Summary match
    if (summaryLower.includes(termLower)) {
      score += 15;
      hits.push(`summary:"${term}"`);
    }
    // Tag match — check both contains and exact match
    if (tagsLower.some(t => t.includes(termLower) || termLower.includes(t))) {
      score += 20;
      hits.push(`tag:"${term}"`);
    }
    // Domain match
    if (domainLower.includes(termLower)) {
      score += 10;
      hits.push(`domain:"${term}"`);
    }
  }

  // Also check if any tag from the item is itself in the queryTerms set (bidirectional)
  for (const tag of tagsLower) {
    if (queryTerms.some(qt => qt.toLowerCase() === tag) && !hits.some(h => h.includes(tag))) {
      score += 20;
      hits.push(`tag:"${tag}"`);
    }
  }

  // Normalize to 0-100
  const normalized = Math.min(100, score);
  return { score: normalized, hits: [...new Set(hits)] };
}

// ── Date Filter ───────────────────────────────────────

function getDateCutoff(range: string): number {
  const now = Date.now();
  switch (range) {
    case "1h": return now - 3600000;
    case "6h": return now - 21600000;
    case "24h": return now - 86400000;
    case "7d": return now - 604800000;
    case "30d": return now - 2592000000;
    default: return 0;
  }
}

// ── AI-Powered Scoring (via Groq) ───────────────────────

async function aiScoreBatch(
  items: DigestFilterItem[],
  query: string,
  depth: "fast" | "balanced" | "deep"
): Promise<Map<string, { score: number; reasons: string[] }>> {
  const results = new Map<string, { score: number; reasons: string[] }>();

  if (!isMsgPoolAvailable()) {
    // Fallback: just return empty (local scores will be used)
    return results;
  }

  // Build batch prompt
  const batchSize = depth === "fast" ? 20 : depth === "balanced" ? 12 : 8;
  const batches: DigestFilterItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // Limit to first 3 batches for speed
  const limitedBatches = batches.slice(0, depth === "fast" ? 2 : depth === "balanced" ? 3 : 5);

  for (const batch of limitedBatches) {
    try {
      const itemsText = batch.map((item, idx) => 
        `[${idx}] "${item.title}" — ${item.summary.substring(0, 120)} (src: ${item.source}, domain: ${item.domain})`
      ).join("\n");

      const systemPrompt = `You are a precision content relevance scorer for a news/article feed filter.
Given a user's natural language query and a list of feed items, score each item from 0-100 on relevance.
Also provide 1-2 word match reasons.

SCORING RULES:
- 90-100: Directly about the query topic, highly specific match
- 70-89: Strongly related, covers key aspects of the query
- 50-69: Moderately related, tangential connection
- 30-49: Loosely related, shares some keywords/themes
- 0-29: Not relevant to the query

Respond ONLY with a JSON array: [{"idx":0,"score":85,"reasons":["exact topic","keyword match"]}, ...]
No markdown, no explanation. Just the JSON array.`;

      const messages: GroqMsgMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Query: "${query}"\n\nItems:\n${itemsText}` },
      ];

      const response = await groqMsgChat(messages, {
        temperature: 0.1,
        max_tokens: depth === "fast" ? 800 : depth === "balanced" ? 1200 : 2000,
        preferredRole: "classify",
      });

      if (response) {
        try {
          // Parse JSON from response
          const jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const scores = JSON.parse(jsonMatch[0]) as { idx: number; score: number; reasons: string[] }[];
            for (const s of scores) {
              if (s.idx >= 0 && s.idx < batch.length) {
                results.set(batch[s.idx].id, { score: s.score, reasons: s.reasons || [] });
              }
            }
          }
        } catch {
          // JSON parse failed — skip this batch
        }
      }
    } catch {
      // LLM call failed — continue with next batch
    }
  }

  return results;
}

// ── Main Filter Pipeline ────────────────────────────────

export async function filterDigestFeed(
  items: DigestFilterItem[],
  config: FilterConfig
): Promise<FilterResponse> {
  const startTime = performance.now();
  const totalInput = items.length;

  if (!config.query.trim() || items.length === 0) {
    return {
      results: [],
      analytics: emptyAnalytics(totalInput, performance.now() - startTime),
    };
  }

  // ── PASS 0: Pre-filters (date, content type, domain, sentiment) ──
  let candidates = [...items];

  // Date filter
  if (config.dateRange !== "all") {
    const cutoff = getDateCutoff(config.dateRange);
    candidates = candidates.filter(item => new Date(item.publishedAt).getTime() >= cutoff);
  }

  // Content type filter
  if (config.contentTypes.length > 0 && config.contentTypes.length < 4) {
    candidates = candidates.filter(item => config.contentTypes.includes(item.type));
  }

  // Domain filter
  if (config.domains.length > 0) {
    candidates = candidates.filter(item => config.domains.includes(item.domain));
  }

  // Sentiment filter
  if (config.sentimentFilter !== "all") {
    candidates = candidates.filter(item => item.sentiment === config.sentimentFilter);
  }

  // ── PASS 1: Local keyword scoring ──
  const queryTerms = expandQuery(config.query);
  const excludeTerms = config.excludeKeywords || [];

  const localScores = candidates.map(item => ({
    item,
    ...localScoreItem(item, queryTerms, excludeTerms),
  }));

  // Filter out zero-score items early
  let scoredItems = localScores.filter(s => s.score > 0);

  // ── PASS 2: AI scoring (if available) ──
  let aiScores = new Map<string, { score: number; reasons: string[] }>();
  let engineUsed = "local-keyword";

  if (isMsgPoolAvailable() && scoredItems.length > 0) {
    try {
      aiScores = await aiScoreBatch(
        scoredItems.map(s => s.item),
        config.query,
        config.semanticDepth
      );
      if (aiScores.size > 0) {
        engineUsed = `groq-${config.semanticDepth}`;
      }
    } catch {
      // AI scoring failed, fall back to local
    }
  }

  // ── PASS 3: Merge scores & compute final confidence ──
  const finalResults: FilteredResult[] = scoredItems.map(scored => {
    const ai = aiScores.get(scored.item.id);
    const localNorm = scored.score / 100;
    const aiNorm = ai ? ai.score / 100 : localNorm;

    // Weighted blend: AI gets more weight when available
    const semanticScore = ai
      ? Math.round(aiNorm * 70 + localNorm * 30)
      : scored.score;

    // Recency boost (0-20 points for items < 6h old)
    const age = Date.now() - new Date(scored.item.publishedAt).getTime();
    const recencyBoost = age < 3600000 ? 20 : age < 21600000 ? 12 : age < 86400000 ? 5 : 0;

    // Source boost
    const sourceBoost = config.boostSources.includes(scored.item.source) ? 10 : 0;

    // Topic alignment (based on domain match to query)
    const topicAlignment = scored.hits.some(h => h.startsWith("domain:")) ? 90 :
      scored.hits.some(h => h.startsWith("tag:")) ? 75 :
        scored.hits.some(h => h.startsWith("title:")) ? 85 : 50;

    // Final confidence (0-1)
    const rawConfidence = (semanticScore + recencyBoost + sourceBoost) / 130;
    const confidence = Math.min(1, Math.max(0, rawConfidence));

    return {
      item: scored.item,
      confidence,
      matchReasons: ai?.reasons || scored.hits.slice(0, 3),
      semanticScore,
      keywordHits: scored.hits,
      topicAlignment,
      sentimentMatch: config.sentimentFilter === "all" || scored.item.sentiment === config.sentimentFilter,
      recencyBoost,
      sourceBoost,
    };
  });

  // ── PASS 4: Filter by minimum confidence & sort ──
  let filtered = finalResults.filter(r => r.confidence >= config.minConfidence);

  // Sort
  switch (config.sortBy) {
    case "relevance":
      filtered.sort((a, b) => b.semanticScore - a.semanticScore);
      break;
    case "confidence":
      filtered.sort((a, b) => b.confidence - a.confidence);
      break;
    case "recency":
      filtered.sort((a, b) => new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime());
      break;
    case "sentiment":
      const sentOrder = { positive: 3, neutral: 2, negative: 1 };
      filtered.sort((a, b) => sentOrder[b.item.sentiment] - sentOrder[a.item.sentiment]);
      break;
  }

  // Limit results
  filtered = filtered.slice(0, config.maxResults);

  // ── Analytics ──
  const analytics = computeAnalytics(totalInput, filtered, queryTerms, engineUsed, performance.now() - startTime);

  return { results: filtered, analytics };
}

// ── Analytics Computation ────────────────────────────

function computeAnalytics(
  totalInput: number,
  results: FilteredResult[],
  queryExpansion: string[],
  engineUsed: string,
  processingTimeMs: number
): FilterAnalytics {
  const totalOutput = results.length;
  const avgConfidence = totalOutput > 0
    ? results.reduce((a, r) => a + r.confidence, 0) / totalOutput
    : 0;
  const avgSemanticScore = totalOutput > 0
    ? results.reduce((a, r) => a + r.semanticScore, 0) / totalOutput
    : 0;

  // Keyword frequency
  const kwMap = new Map<string, number>();
  for (const r of results) {
    for (const h of r.keywordHits) {
      const keyword = h.replace(/^(title|summary|tag|domain):/, "").replace(/"/g, "");
      kwMap.set(keyword, (kwMap.get(keyword) || 0) + 1);
    }
  }
  const topKeywords = Array.from(kwMap.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Sentiment breakdown
  const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
  for (const r of results) {
    sentimentBreakdown[r.item.sentiment]++;
  }

  // Domain breakdown
  const domainMap = new Map<string, { count: number; totalScore: number }>();
  for (const r of results) {
    const e = domainMap.get(r.item.domain) || { count: 0, totalScore: 0 };
    domainMap.set(r.item.domain, { count: e.count + 1, totalScore: e.totalScore + r.semanticScore });
  }
  const domainBreakdown = Array.from(domainMap.entries())
    .map(([domain, d]) => ({ domain, count: d.count, avgScore: Math.round(d.totalScore / d.count) }))
    .sort((a, b) => b.count - a.count);

  // Source breakdown
  const sourceMap = new Map<string, number>();
  for (const r of results) {
    sourceMap.set(r.item.source, (sourceMap.get(r.item.source) || 0) + 1);
  }
  const sourceBreakdown = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // Content type breakdown
  const typeMap = new Map<string, number>();
  for (const r of results) {
    typeMap.set(r.item.type, (typeMap.get(r.item.type) || 0) + 1);
  }
  const contentTypeBreakdown = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Confidence distribution (10 buckets)
  const confidenceDistribution = new Array(10).fill(0);
  for (const r of results) {
    const bucket = Math.min(9, Math.floor(r.confidence * 10));
    confidenceDistribution[bucket]++;
  }

  return {
    totalInput,
    totalOutput,
    passRate: totalInput > 0 ? Math.round((totalOutput / totalInput) * 100) : 0,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    avgSemanticScore: Math.round(avgSemanticScore),
    topKeywords,
    sentimentBreakdown,
    domainBreakdown,
    sourceBreakdown,
    contentTypeBreakdown,
    processingTimeMs: Math.round(processingTimeMs),
    engineUsed,
    queryExpansion: queryExpansion.slice(0, 20),
    confidenceDistribution,
  };
}

function emptyAnalytics(totalInput: number, processingTimeMs: number): FilterAnalytics {
  return {
    totalInput,
    totalOutput: 0,
    passRate: 0,
    avgConfidence: 0,
    avgSemanticScore: 0,
    topKeywords: [],
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    domainBreakdown: [],
    sourceBreakdown: [],
    contentTypeBreakdown: [],
    processingTimeMs: Math.round(processingTimeMs),
    engineUsed: "none",
    queryExpansion: [],
    confidenceDistribution: new Array(10).fill(0),
  };
}
