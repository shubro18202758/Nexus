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

function getGroq(): Groq {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
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

// ─── Groq with retry ─────────────────────────────────────────────────────────

async function groqWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = String(err);
      if (msg.includes("429") && i < retries - 1) {
        const match = msg.match(/try again in (\d+)ms/);
        const wait = match ? parseInt(match[1]) + 500 : 3000 * (i + 1);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Stage 1: Discovery ───────────────────────────────────────────────────────

export async function runDiscoveryAgent(
  iitId: IITId,
  onProgress?: (e: ProgressEvent) => void
): Promise<DiscoveryResult> {
  const iit = IIT_SEED_REGISTRY.find((i) => i.id === iitId);
  if (!iit) throw new Error(`Unknown IIT: ${iitId}`);

  const groq = getGroq();
  const result: DiscoveryResult = { iitId, clubs: [], pagesVisited: 0, errors: [] };

  onProgress?.({ stage: "discovery", iitId, progress: 20,
    message: `Searching for ${iit.fullName} clubs...` });

  // Search for the club directory with real web results
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

  const response = await groqWithRetry(() => groq.chat.completions.create({
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
  const groq = getGroq();
  const iit = IIT_SEED_REGISTRY.find((i) => i.id === club.iitId);
  const iitName = iit?.fullName ?? club.iitId.toUpperCase();

  onProgress?.({ stage: "profile", iitId: club.iitId, clubName: club.name,
    progress: 20, message: `Searching real info for ${club.name}...` });

  // Real web search for this specific club
  const [generalSearch, eventSearch] = await Promise.all([
    tavilySearch(`"${club.name}" "${iitName}" club about members activities`, 4).catch(() => ({ results: [], answer: "" })),
    tavilySearch(`"${club.name}" "${iitName}" events hackathon workshop 2024 2025`, 3).catch(() => ({ results: [], answer: "" })),
  ]);

  const rawPageText = [
    generalSearch.answer ?? "",
    ...generalSearch.results.map(r => `SOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`),
    "--- EVENTS ---",
    ...eventSearch.results.map(r => `SOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`),
  ].join("\n\n").slice(0, 8000);

  const sourceUrl = generalSearch.results[0]?.url ?? club.url ?? "";

  onProgress?.({ stage: "profile", iitId: club.iitId, clubName: club.name,
    progress: 70, message: `Structuring profile...` });

  const response = await groqWithRetry(() => groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content: `You are extracting REAL, ACCURATE data about an IIT student club from web search results.
Only use information that actually appears in the sources. Do NOT hallucinate.
Return JSON:
{
  "name": "official club name",
  "tagline": "their actual tagline/motto if found",
  "description": "accurate 2-3 sentence description based on sources",
  "category": "technical|cultural|entrepreneurship|research|sports|social|media|hobby",
  "websiteUrl": "official website url",
  "instagramUrl": "instagram url if found",
  "githubUrl": "github url if found",
  "email": "contact email if found",
  "foundedYear": year as number or null,
  "memberCount": number or null,
  "isRecruiting": true or false,
  "tags": ["tag1", "tag2", "tag3"],
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
}`,
      },
      {
        role: "user",
        content: `Club: ${club.name}\nIIT: ${iitName}\n\nReal web data:\n${rawPageText}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  })).catch(() => null);

  const data = response
    ? (JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>)
    : {};

  const profile: ClubProfile = {
    name: String(data.name ?? club.name),
    tagline: data.tagline ? String(data.tagline) : undefined,
    description: String(data.description ?? ""),
    category: String(data.category ?? inferCategory(club.name)),
    websiteUrl: String(data.websiteUrl ?? club.url ?? ""),
    instagramUrl: data.instagramUrl ? String(data.instagramUrl) : undefined,
    githubUrl: data.githubUrl ? String(data.githubUrl) : undefined,
    email: data.email ? String(data.email) : undefined,
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
  const groq = getGroq();

  onProgress?.({ stage: "knowledge", iitId: "", clubName, progress: 20,
    message: `Deep searching ${clubName}...` });

  // 4 targeted searches for rich real data
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

  const response = await groqWithRetry(() => groq.chat.completions.create({
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

export async function queryNexusKnowledge(
  userQuery: string,
  chunks: Array<{ clubName: string; iitId: string; content: string; knowledgeType: string }>
): Promise<string> {
  const groq = getGroq();
  const context = chunks
    .map((c) => `[${c.clubName} — ${c.iitId.toUpperCase()} — ${c.knowledgeType}]\n${c.content}`)
    .join("\n\n---\n\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "You are Nexus, an AI guide for IIT students. Answer using ONLY the provided context. Be specific and student-friendly. If the context is insufficient, say so." },
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${userQuery}` },
    ],
    temperature: 0.3,
    max_tokens: 600,
  });

  return response.choices[0]?.message?.content ?? "Couldn't find relevant information.";
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
