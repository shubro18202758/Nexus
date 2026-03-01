/**
 * NEXUS Agent — Real data via Tavily search + Groq extraction
 * Tavily searches the web for each club → Groq structures the real content
 */

import Groq from "groq-sdk";
import { IIT_SEED_REGISTRY, CATEGORY_KEYWORDS } from "./iit-registry";
import type { IITId } from "./iit-registry";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClubLink {
  name: string;
  url: string;
  iitId: string;
}

export interface ClubProfile {
  name: string;
  shortName?: string;
  category: string;
  description: string;
  tagline?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  email?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  tags: string[];
  memberCount?: number;
  foundedYear?: number;
  isRecruiting: boolean;
}

export interface ClubKnowledgeItem {
  knowledgeType: string;
  title: string;
  content: string;
  sourceUrl?: string;
  confidence: number;
  structuredData?: Record<string, unknown>;
}

export interface ClubEvent {
  title: string;
  description?: string;
  eventType: string;
  startDate?: string;
  registrationUrl?: string;
  prizePool?: string;
  venue?: string;
  rawText: string;
}

export interface DiscoveryResult {
  iitId: string;
  clubs: ClubLink[];
  pagesVisited: number;
  errors: string[];
}

export interface ProfileResult {
  profile: ClubProfile;
  events: ClubEvent[];
  rawPageText: string;
  sourceUrl: string;
}

export interface KnowledgeResult {
  knowledgeItems: ClubKnowledgeItem[];
  summary: string;
}

export interface ProgressEvent {
  stage: string;
  iitId: string;
  clubName?: string;
  progress: number;
  message: string;
  data?: unknown;
}

export interface NexusCrawlOptions {
  iitIds?: IITId[];
  maxClubsPerIIT?: number;
  delayBetweenRequestsMs?: number;
  preview?: boolean;
  stages?: ("discovery" | "profile" | "knowledge" | "embed")[];
}

// ─── Clients ──────────────────────────────────────────────────────────────────

// 6-key hyperpool: INTELHUB1-3 + CLUBS1-3 for maximum throughput & 429 resilience
const HYPERPOOL_KEYS = [
  process.env.GROQ_INTELHUB_KEY_1,
  process.env.GROQ_INTELHUB_KEY_2,
  process.env.GROQ_INTELHUB_KEY_3,
  process.env.GROQ_CLUBS_KEY_1,
  process.env.GROQ_CLUBS_KEY_2,
  process.env.GROQ_CLUBS_KEY_3,
].filter(Boolean) as string[];

let _keyIndex = 0;

function getGroq(): Groq {
  if (HYPERPOOL_KEYS.length > 0) {
    const key = HYPERPOOL_KEYS[_keyIndex % HYPERPOOL_KEYS.length];
    _keyIndex++;
    return new Groq({ apiKey: key });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("No Groq API keys configured — set GROQ_INTELHUB_KEY_1/2/3 + GROQ_CLUBS_KEY_1/2/3 or GROQ_API_KEY");
  return new Groq({ apiKey: key });
}

function getTavilyKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY not set — get a free key at app.tavily.com");
  return key;
}

// ─── Tavily search ────────────────────────────────────────────────────────────

async function tavilySearch(query: string, maxResults = 5): Promise<{
  results: Array<{ title: string; url: string; content: string; score: number }>;
  answer?: string;
}> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: getTavilyKey(),
      query,
      max_results: maxResults,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavily error ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── Groq with retry + key rotation on 429 ───────────────────────────────────

async function groqWithRetry<T>(fn: (groq: Groq) => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    const groq = getGroq(); // rotates key each attempt
    try {
      return await fn(groq);
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes("429") && i < retries - 1) {
        const match = msg.match(/try again in (\d+)ms/);
        const wait = match ? parseInt(match[1]) + 500 : 2000 * (i + 1);
        await sleep(wait);
        continue; // next iteration gets the NEXT key via rotation
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded across all keys");
}

// ─── Stage 1: Discovery ───────────────────────────────────────────────────────

export async function runDiscoveryAgent(
  iitId: IITId,
  onProgress?: (e: ProgressEvent) => void
): Promise<DiscoveryResult> {
  const iit = IIT_SEED_REGISTRY.find((i) => i.id === iitId);
  if (!iit) throw new Error(`Unknown IIT: ${iitId}`);

  const result: DiscoveryResult = { iitId, clubs: [], pagesVisited: 0, errors: [] };

  onProgress?.({ stage: "discovery", iitId, progress: 20,
    message: `Searching for ${iit.fullName} clubs...` });

  const searchResults = await tavilySearch(
    `${iit.fullName} student clubs societies list site:${iit.id}.ac.in OR gymkhana`,
    8
  );

  result.pagesVisited = searchResults.results.length;

  const context = [
    searchResults.answer ?? "",
    ...searchResults.results.map(r => `[${r.title}]\n${r.url}\n${r.content}`),
  ].join("\n\n---\n\n").slice(0, 6000);

  onProgress?.({ stage: "discovery", iitId, progress: 60,
    message: `Extracting club list from search results...` });

  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `Extract a list of real student clubs at this IIT from the search results.
Return ONLY JSON: { "clubs": [{ "name": "exact club name", "url": "website url if found or empty", "category": "technical|cultural|entrepreneurship|research|sports|social|media|hobby" }] }
List every distinct club you can find. Be accurate — only include clubs that appear in the search results.`,
      },
      {
        role: "user",
        content: `IIT: ${iit.fullName} (${iit.city})\n\nSearch results:\n${context}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  }));

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    clubs?: Array<{ name: string; url?: string; category?: string }>;
  };

  for (const club of parsed.clubs ?? []) {
    if (club.name?.length > 1) {
      result.clubs.push({ name: club.name.trim(), url: club.url ?? "", iitId });
    }
  }

  result.clubs = dedup(result.clubs);

  onProgress?.({ stage: "discovery", iitId, progress: 100,
    message: `Found ${result.clubs.length} clubs at ${iit.fullName}`,
    data: result.clubs });

  return result;
}

// ─── Stage 2: Profile with real web search ────────────────────────────────────

export async function runProfileAgent(
  club: ClubLink,
  onProgress?: (e: ProgressEvent) => void
): Promise<ProfileResult> {
  const iit = IIT_SEED_REGISTRY.find((i) => i.id === club.iitId);
  const iitName = iit?.fullName ?? club.iitId.toUpperCase();

  onProgress?.({ stage: "profile", iitId: club.iitId, clubName: club.name,
    progress: 20, message: `Searching real info for ${club.name}...` });

  const [generalSearch, eventSearch, socialSearch] = await Promise.all([
    tavilySearch(`"${club.name}" "${iitName}" club about members activities description`, 5).catch(() => ({ results: [], answer: "" })),
    tavilySearch(`"${club.name}" "${iitName}" events hackathon workshop 2024 2025`, 3).catch(() => ({ results: [], answer: "" })),
    tavilySearch(`"${club.name}" "${iitName}" instagram linkedin logo banner image`, 4).catch(() => ({ results: [], answer: "" })),
  ]);

  const rawPageText = [
    generalSearch.answer ?? "",
    ...generalSearch.results.map(r => `SOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`),
    "--- EVENTS ---",
    ...eventSearch.results.map(r => `SOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`),
    "--- SOCIAL MEDIA & IMAGES ---",
    socialSearch.answer ?? "",
    ...socialSearch.results.map(r => `SOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`),
  ].join("\n\n").slice(0, 10000);

  const sourceUrl = generalSearch.results[0]?.url ?? club.url ?? "";

  onProgress?.({ stage: "profile", iitId: club.iitId, clubName: club.name,
    progress: 70, message: `Structuring profile...` });

  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You are extracting REAL, ACCURATE data about an IIT student club from web search results.
Only use information that actually appears in the sources. Do NOT hallucinate or invent URLs.
Return JSON:
{
  "name": "official club name",
  "shortName": "abbreviation or acronym if commonly used (e.g. E-Cell, SAC, WnCC), or null",
  "tagline": "their actual tagline/motto if found",
  "description": "detailed 4-5 sentence description covering what the club does, notable achievements, flagship events, and impact",
  "category": "technical|cultural|entrepreneurship|research|sports|social|media|hobby",
  "websiteUrl": "official website url",
  "instagramUrl": "full instagram profile url (e.g. https://www.instagram.com/handle) if found",
  "linkedinUrl": "full linkedin page url if found",
  "githubUrl": "github organization/profile url if found",
  "email": "contact email if found",
  "logoUrl": "direct URL to club logo image if found in sources (must be a real image URL ending in .png/.jpg/.svg/.webp or from a CDN)",
  "coverImageUrl": "direct URL to club banner/cover/header image if found (must be a real image URL)",
  "foundedYear": year as number or null,
  "memberCount": number or null,
  "isRecruiting": true or false,
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "events": [
    {
      "title": "real event name",
      "description": "what the event is",
      "eventType": "hackathon|workshop|talk|competition|fest|recruitment",
      "startDate": "date if mentioned",
      "registrationUrl": "url if found",
      "prizePool": "prize if mentioned"
    }
  ]
}
IMPORTANT: For social media URLs, only include URLs that actually appear in the search results. For images, only use URLs that are real direct links to images.`,
      },
      {
        role: "user",
        content: `Club: ${club.name}\nIIT: ${iitName}\n\nReal web data:\n${rawPageText}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  })).catch(() => null);

  const data = response
    ? (JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>)
    : {};

  const profile: ClubProfile = {
    name: String(data.name ?? club.name),
    shortName: data.shortName ? String(data.shortName) : undefined,
    tagline: data.tagline ? String(data.tagline) : undefined,
    description: String(data.description ?? ""),
    category: String(data.category ?? inferCategory(club.name)),
    websiteUrl: String(data.websiteUrl ?? club.url ?? ""),
    instagramUrl: data.instagramUrl ? String(data.instagramUrl) : undefined,
    linkedinUrl: data.linkedinUrl ? String(data.linkedinUrl) : undefined,
    githubUrl: data.githubUrl ? String(data.githubUrl) : undefined,
    email: data.email ? String(data.email) : undefined,
    logoUrl: data.logoUrl ? String(data.logoUrl) : undefined,
    coverImageUrl: data.coverImageUrl ? String(data.coverImageUrl) : undefined,
    foundedYear: data.foundedYear ? Number(data.foundedYear) : undefined,
    memberCount: data.memberCount ? Number(data.memberCount) : undefined,
    isRecruiting: Boolean(data.isRecruiting),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : extractTags(club.name),
  };

  const events: ClubEvent[] = (Array.isArray(data.events) ? data.events : []).map(
    (e: Record<string, unknown>) => ({
      title: String(e.title ?? "Event"),
      description: String(e.description ?? ""),
      eventType: String(e.eventType ?? "event"),
      startDate: e.startDate ? String(e.startDate) : undefined,
      registrationUrl: e.registrationUrl ? String(e.registrationUrl) : undefined,
      prizePool: e.prizePool ? String(e.prizePool) : undefined,
      rawText: JSON.stringify(e),
    })
  );

  return { profile, events, rawPageText, sourceUrl };
}

// ─── Stage 3: Real tacit knowledge extraction ─────────────────────────────────

export async function runKnowledgeExtractor(
  clubName: string,
  iitName: string,
  rawPageText: string,
  sourceUrl: string,
  onProgress?: (e: ProgressEvent) => void
): Promise<KnowledgeResult> {
  onProgress?.({ stage: "knowledge", iitId: "", clubName, progress: 20,
    message: `Deep searching ${clubName}...` });

  const [recruitSearch, projectSearch, eventSearch, achieveSearch] = await Promise.all([
    tavilySearch(`"${clubName}" "${iitName}" how to join recruitment criteria skills required`, 3).catch(() => ({ results: [], answer: "" })),
    tavilySearch(`"${clubName}" "${iitName}" projects built competitions won achievements`, 3).catch(() => ({ results: [], answer: "" })),
    tavilySearch(`"${clubName}" "${iitName}" upcoming events 2024 2025 hackathon workshop fest`, 3).catch(() => ({ results: [], answer: "" })),
    tavilySearch(`"${clubName}" "${iitName}" awards wins rankings notable alumni`, 2).catch(() => ({ results: [], answer: "" })),
  ]);

  const enrichedText = [
    "=== ABOUT ===",
    rawPageText.slice(0, 2000),
    "=== RECRUITMENT ===",
    recruitSearch.answer ?? "",
    ...recruitSearch.results.map(r => `[${r.title}] ${r.url}\n${r.content}`),
    "=== PROJECTS ===",
    projectSearch.answer ?? "",
    ...projectSearch.results.map(r => `[${r.title}] ${r.url}\n${r.content}`),
    "=== EVENTS ===",
    eventSearch.answer ?? "",
    ...eventSearch.results.map(r => `[${r.title}] ${r.url}\n${r.content}`),
    "=== ACHIEVEMENTS ===",
    achieveSearch.answer ?? "",
    ...achieveSearch.results.map(r => `[${r.title}] ${r.url}\n${r.content}`),
  ].join("\n\n").slice(0, 10000);

  onProgress?.({ stage: "knowledge", iitId: "", clubName, progress: 70,
    message: `Structuring knowledge items...` });

  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You extract REAL, SPECIFIC knowledge about an IIT student club from web search results.
Use ONLY information from the sources. Be specific — mention actual project names, event names, competition results.
Return JSON:
{
  "summary": "punchy 2-3 sentence summary a first-year student would find useful",
  "knowledgeItems": [
    {
      "knowledgeType": "recruitment_criteria|project_highlight|culture_insight|skill_requirements|timeline|achievement|resource",
      "title": "specific title (e.g. 'Techfest Robotics Competition Winners' not just 'Achievement')",
      "content": "specific real content with names, dates, numbers where available",
      "confidence": 0.5-1.0
    }
  ]
}
Aim for 6-10 items covering: how to join, what projects they build, culture/vibe, skills needed, when they recruit, awards won, useful links.`,
      },
      {
        role: "user",
        content: `Club: ${clubName}\nIIT: ${iitName}\nSource: ${sourceUrl}\n\n${enrichedText}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 2500,
    response_format: { type: "json_object" },
  })).catch(() => null);

  if (!response) return { knowledgeItems: [], summary: "" };

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as KnowledgeResult;
  const items = (parsed.knowledgeItems ?? [])
    .filter((i) => i.title && i.content && i.content.length > 20)
    .map((i) => ({
      ...i,
      sourceUrl,
      confidence: Math.min(1, Math.max(0, Number(i.confidence) || 0.7)),
    }));

  onProgress?.({ stage: "knowledge", iitId: "", clubName, progress: 100,
    message: `Extracted ${items.length} knowledge items for ${clubName}` });

  return { knowledgeItems: items, summary: parsed.summary ?? "" };
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function* runNexusPipeline(
  options: NexusCrawlOptions = {}
): AsyncGenerator<ProgressEvent & { type: "progress" | "result" | "error" | "done" }> {
  const {
    iitIds = IIT_SEED_REGISTRY.map((i) => i.id as IITId),
    maxClubsPerIIT = 10,
    delayBetweenRequestsMs = 2000,
    stages = ["discovery", "profile", "knowledge"],
  } = options;

  const allResults: unknown[] = [];

  for (const iitId of iitIds) {
    const iit = IIT_SEED_REGISTRY.find((i) => i.id === iitId);
    if (!iit) continue;

    yield { type: "progress", stage: "discovery", iitId, progress: 0,
      message: `Starting ${iit.fullName}...` };

    let discoveredClubs: ClubLink[] = [];

    if (stages.includes("discovery")) {
      try {
        const discovery = await runDiscoveryAgent(iitId);
        discoveredClubs = discovery.clubs.slice(0, maxClubsPerIIT);
        yield { type: "result", stage: "discovery", iitId, progress: 20,
          message: `Discovered ${discoveredClubs.length} clubs at ${iit.fullName}`,
          data: discoveredClubs };
      } catch (err) {
        yield { type: "error", stage: "discovery", iitId, progress: 0,
          message: `Discovery failed: ${String(err)}` };
        continue;
      }
    }

    const iitResult = { iitId, clubs: [] as unknown[] };

    for (let i = 0; i < discoveredClubs.length; i++) {
      const club = discoveredClubs[i];
      const clubProgress = Math.round(20 + (i / discoveredClubs.length) * 75);

      yield { type: "progress", stage: "profile", iitId, clubName: club.name,
        progress: clubProgress,
        message: `Processing ${club.name} (${i + 1}/${discoveredClubs.length})` };

      const clubEntry: Record<string, unknown> = { link: club };

      if (stages.includes("profile")) {
        const profile = await runProfileAgent(club).catch(() => null);
        if (profile) clubEntry.profile = profile;
      }

      if (stages.includes("knowledge") && (clubEntry.profile as ProfileResult | undefined)?.rawPageText) {
        await sleep(1000);
        const p = clubEntry.profile as ProfileResult;
        const knowledge = await runKnowledgeExtractor(
          club.name, iit.fullName, p.rawPageText, p.sourceUrl
        ).catch(() => ({ knowledgeItems: [], summary: "" }));
        clubEntry.knowledge = knowledge;

        yield {
          type: "result", stage: "knowledge", iitId, clubName: club.name,
          progress: clubProgress,
          message: `Extracted ${knowledge.knowledgeItems.length} knowledge items for ${club.name}`,
          data: clubEntry,
        };
      }

      iitResult.clubs.push(clubEntry);
      if (i < discoveredClubs.length - 1) await sleep(delayBetweenRequestsMs);
    }

    allResults.push(iitResult);
    yield { type: "progress", stage: "done", iitId, progress: 100,
      message: `Completed ${iit.fullName}: ${iitResult.clubs.length} clubs`,
      data: iitResult };
  }

  yield { type: "done", stage: "pipeline", iitId: "all", progress: 100,
    message: `Nexus complete. Processed clubs across ${allResults.length} IITs.`,
    data: allResults };
}

// ─── Search answer ────────────────────────────────────────────────────────────

/**
 * AGENTIC QUERY ENGINE — Multi-agent pipeline for search synthesis
 * Agent 1: Intent Parser — classifies query type (search, compare, recommend, explore)
 * Agent 2: Query Decomposer — breaks complex queries into sub-queries
 * Agent 3: Synthesis Engine — generates the final rich answer
 */

export interface AgenticSearchResult {
  answer: string;
  intent: string;
  subQueries: string[];
  confidence: number;
  suggestedFollowups: string[];
  comparisonData?: ComparisonResult;
  recommendations?: RecommendationResult[];
}

export interface ComparisonResult {
  clubs: Array<{
    name: string;
    iitId: string;
    category: string;
    strengths: string[];
    weaknesses: string[];
    rating: number;
  }>;
  verdict: string;
  dimensions: string[];
}

export interface RecommendationResult {
  clubName: string;
  iitId: string;
  matchScore: number;
  reason: string;
  highlights: string[];
}

// Agent 1: Intent Parser
async function parseSearchIntent(query: string): Promise<{
  intent: "search" | "compare" | "recommend" | "explore" | "stats";
  entities: string[];
  filters: { iits?: string[]; categories?: string[]; attributes?: string[] };
  subQueries: string[];
}> {
  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You are an intent parser for an IIT Club Intelligence Hub. Classify the user's query and extract structured data.
Return JSON:
{
  "intent": "search|compare|recommend|explore|stats",
  "entities": ["club names", "IIT names", "categories mentioned"],
  "filters": { "iits": ["iitb","iitd"], "categories": ["technical","cultural"], "attributes": ["recruiting","large membership"] },
  "subQueries": ["broken down sub-queries if complex, otherwise just the original query"]
}

Intent definitions:
- search: Looking for specific clubs or information
- compare: Comparing clubs, IITs, or categories
- recommend: Asking for suggestions based on interests
- explore: Broad browsing/discovery ("show me...", "what's available...")
- stats: Asking about numbers, rankings, or aggregates`,
      },
      { role: "user", content: query },
    ],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: "json_object" },
  }));

  try {
    return JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch {
    return { intent: "search", entities: [], filters: {}, subQueries: [query] };
  }
}

// Agent 2: Comparison Engine
export async function runComparisonAgent(
  query: string,
  clubs: Array<{ name: string; iitId: string; category: string; description: string; tags: string[]; memberCount?: number }>,
  knowledge: Array<{ clubName: string; iitId: string; content: string; knowledgeType: string }>
): Promise<ComparisonResult> {
  const context = [
    "CLUBS DATA:",
    ...clubs.map(c => `[${c.name} — ${c.iitId.toUpperCase()}] Category: ${c.category}, Members: ${c.memberCount ?? "N/A"}, Tags: ${(c.tags || []).join(", ")}\n${c.description}`),
    "\nKNOWLEDGE BASE:",
    ...knowledge.slice(0, 20).map(k => `[${k.clubName} — ${k.iitId.toUpperCase()} — ${k.knowledgeType}] ${k.content}`),
  ].join("\n\n").slice(0, 8000);

  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You are a club comparison analyst. Compare IIT clubs based on REAL data provided.
Return JSON:
{
  "clubs": [
    {
      "name": "club name",
      "iitId": "iitb",
      "category": "technical",
      "strengths": ["specific strength 1", "strength 2"],
      "weaknesses": ["area to improve"],
      "rating": 8.5
    }
  ],
  "dimensions": ["Innovation", "Community", "Events", "Reach"],
  "verdict": "Clear, opinionated verdict about which club leads and why"
}

Be specific. Use real data from the context. Rate 1-10. Be fair but opinionated.`,
      },
      { role: "user", content: `Comparison Query: ${query}\n\n${context}` },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  }));

  try {
    return JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch {
    return { clubs: [], verdict: "Comparison data insufficient.", dimensions: [] };
  }
}

// Agent 3: Recommendation Engine
async function runRecommendationAgent(
  query: string,
  allClubs: Array<{ name: string; iitId: string; category: string; description: string; tags: string[] }>,
  knowledge: Array<{ clubName: string; content: string; knowledgeType: string }>
): Promise<RecommendationResult[]> {
  const context = [
    ...allClubs.slice(0, 30).map(c => `[${c.name} — ${c.iitId.toUpperCase()}] ${c.category} | ${c.description?.slice(0, 200)} | Tags: ${(c.tags || []).join(", ")}`),
    "\nKNOWLEDGE:",
    ...knowledge.slice(0, 15).map(k => `[${k.clubName}] ${k.content.slice(0, 200)}`),
  ].join("\n").slice(0, 6000);

  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You are a club recommendation engine for IIT students. Based on the user's interests, recommend the best clubs.
Return JSON:
{
  "recommendations": [
    {
      "clubName": "exact club name from data",
      "iitId": "iitb",
      "matchScore": 0.95,
      "reason": "Why this club matches their interests",
      "highlights": ["specific highlight 1", "highlight 2", "highlight 3"]
    }
  ]
}
Recommend 3-6 clubs. Be specific about WHY each club matches. Use real data.`,
      },
      { role: "user", content: `User interests: ${query}\n\nAvailable clubs:\n${context}` },
    ],
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  }));

  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    return parsed.recommendations ?? [];
  } catch {
    return [];
  }
}

// Master Synthesis Agent
export async function queryNexusKnowledge(
  userQuery: string,
  chunks: Array<{ clubName: string; iitId: string; content: string; knowledgeType: string }>,
  clubsData?: Array<{ name: string; iitId: string; category: string; description: string; tags: string[]; memberCount?: number }>
): Promise<AgenticSearchResult> {
  // Stage 1: Parse intent in parallel with preparing context
  const [intentResult] = await Promise.all([
    parseSearchIntent(userQuery).catch(() => ({
      intent: "search" as const,
      entities: [],
      filters: {},
      subQueries: [userQuery],
    })),
  ]);

  // Stage 2: Run specialized agents based on intent
  let comparisonData: ComparisonResult | undefined;
  let recommendations: RecommendationResult[] | undefined;

  if (intentResult.intent === "compare" && clubsData && clubsData.length >= 2) {
    comparisonData = await runComparisonAgent(userQuery, clubsData, chunks).catch(() => undefined);
  }

  if (intentResult.intent === "recommend" && clubsData) {
    recommendations = await runRecommendationAgent(userQuery, clubsData, chunks).catch(() => undefined);
  }

  // Stage 3: Rich synthesis with all gathered data
  const context = chunks
    .map((c) => `[${c.clubName} — ${c.iitId.toUpperCase()} — ${c.knowledgeType}]\n${c.content}`)
    .join("\n\n---\n\n")
    .slice(0, 6000);

  const extraContext = [
    comparisonData ? `\n\n[COMPARISON ANALYSIS]\n${comparisonData.verdict}` : "",
    recommendations?.length ? `\n\n[RECOMMENDATIONS]\n${recommendations.map(r => `${r.clubName} (${r.matchScore * 100}% match): ${r.reason}`).join("\n")}` : "",
  ].join("");

  const systemPrompt = intentResult.intent === "compare"
    ? `You are Nexus, an AI intelligence agent for IIT clubs. You're delivering a COMPARISON analysis. Be structured, use bullet points, mention specific strengths and weaknesses. End with a clear verdict. Use ONLY the provided context. Be bold and opinionated.`
    : intentResult.intent === "recommend"
    ? `You are Nexus, an AI intelligence agent for IIT clubs. You're giving PERSONALIZED RECOMMENDATIONS. For each recommendation, explain WHY it's a great match and what makes it special. Be enthusiastic and specific. Use ONLY the provided context.`
    : intentResult.intent === "stats"
    ? `You are Nexus, an AI intelligence agent for IIT clubs. You're answering a STATISTICS/RANKING query. Provide concrete numbers, percentages, and rankings where possible. Be data-driven. Use ONLY the provided context.`
    : `You are Nexus, an AI intelligence agent for IIT clubs. Answer the user's question using ONLY the provided context. Be specific, cite club names, and be student-friendly. If the context lacks info, say so honestly.`;

  const response = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Context:\n${context}${extraContext}\n\nQuestion: ${userQuery}` },
    ],
    temperature: 0.3,
    max_tokens: 800,
  }));

  const answer = response.choices[0]?.message?.content ?? "Couldn't find relevant information.";

  // Stage 4: Generate follow-up suggestions
  const followups = await groqWithRetry((groq) => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `Based on this Q&A about IIT clubs, suggest 3 natural follow-up questions the user might ask next. Return JSON: { "followups": ["question 1", "question 2", "question 3"] }`,
      },
      { role: "user", content: `Q: ${userQuery}\nA: ${answer.slice(0, 500)}` },
    ],
    temperature: 0.5,
    max_tokens: 300,
    response_format: { type: "json_object" },
  })).catch(() => null);

  let suggestedFollowups: string[] = [];
  try {
    if (followups) {
      const parsed = JSON.parse(followups.choices[0]?.message?.content ?? "{}");
      suggestedFollowups = parsed.followups ?? [];
    }
  } catch { /* skip */ }

  return {
    answer,
    intent: intentResult.intent,
    subQueries: intentResult.subQueries,
    confidence: chunks.length > 5 ? 0.9 : chunks.length > 0 ? 0.7 : 0.3,
    suggestedFollowups,
    comparisonData,
    recommendations,
  };
}

export async function detectHomeIIT(universityName: string): Promise<IITId | null> {
  const lower = universityName.toLowerCase();
  const map: Record<string, IITId> = {
    "bombay": "iitb", "iitb": "iitb", "delhi": "iitd", "iitd": "iitd",
    "kanpur": "iitk", "iitk": "iitk", "madras": "iitm", "iitm": "iitm",
    "chennai": "iitm", "roorkee": "iitr", "iitr": "iitr",
    "hyderabad": "iith", "iith": "iith", "guwahati": "iitg", "iitg": "iitg",
    "bhubaneswar": "iitbbs", "iitbbs": "iitbbs",
  };
  for (const [key, id] of Object.entries(map)) {
    if (lower.includes(key)) return id;
  }
  return null;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function dedup(clubs: ClubLink[]): ClubLink[] {
  const seen = new Set<string>();
  return clubs.filter((c) => {
    const k = c.name.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return cat;
  }
  return "other";
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  const lower = text.toLowerCase();
  for (const kw of Object.values(CATEGORY_KEYWORDS).flat()) {
    if (kw.length > 3 && lower.includes(kw.toLowerCase())) tags.add(kw);
  }
  return Array.from(tags).slice(0, 8);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
