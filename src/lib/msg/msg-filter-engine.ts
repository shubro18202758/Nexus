// ===================================================================
// MSG Filter Engine — NanoClaw 5-Pass WhatsApp Message Intelligence
//
// Five-pass architecture powered by the Groq MSG Pool (6 nanobot keys):
//   Pass 1 (NANOBOT-MSG-1 → Intent):    Parse NL query → structured intent
//   Pass 2 (NANOBOT-MSG-2 → Classify):   Classify message relevance
//   Pass 3 (NANOBOT-MSG-3 → Detect):     Detect events / dates / deadlines
//   Pass 4 (NANOBOT-MSG-4 → Enrich):     Deep analysis on borderline msgs
//   Pass 5 (NANOBOT-MSG-5 → Plan):       Generate event structures for planner
//
// Primary engine: Groq MSG Pool (6 dedicated keys, llama-3.1-8b-instant)
// Fallback: LLMEngine (Groq Alpha → Groq Beta → Local Ollama)
//
// Student-life aware: IIT context — placements, hackathons, exams,
// hostel notices, club events, contest deadlines, etc.
// ===================================================================

import { LLMEngine, extractJson, type ChatMode } from "@/lib/ai/llm-engine";
import {
    groqMsgChat,
    isMsgPoolAvailable,
    type GroqMsgMessage,
    type MsgNanobotRole,
} from "@/lib/msg/groq-msg-pool";
import type { WAMessage } from "@/lib/msg/wa-session";

// ─── Engine Selection ───

type MsgEngine = "groq-msg-pool" | "groq-alpha" | "groq-beta" | "local";

function pickMsgEngine(): MsgEngine {
    if (isMsgPoolAvailable()) return "groq-msg-pool";
    const engine = LLMEngine.getInstance();
    if (engine.isGroqAlphaReady()) return "groq-alpha";
    if (engine.isGroqBetaReady()) return "groq-beta";
    return "local";
}

async function msgChat(
    messages: GroqMsgMessage[],
    opts: {
        engine: MsgEngine;
        temperature?: number;
        max_tokens?: number;
        json_mode?: boolean;
        preferredRole?: MsgNanobotRole;
    },
): Promise<string> {
    const {
        engine,
        temperature = 0.15,
        max_tokens = 4096,
        json_mode = true,
        preferredRole,
    } = opts;

    if (engine === "groq-msg-pool") {
        return groqMsgChat(messages, {
            temperature,
            max_tokens,
            json_mode,
            preferredRole,
        });
    }

    const modeMap: Record<string, ChatMode> = {
        "groq-alpha": "groq-alpha",
        "groq-beta": "groq-beta",
        local: "local",
    };
    const llm = LLMEngine.getInstance();
    return llm.chat(messages, {
        mode: modeMap[engine] || "local",
        temperature,
        max_tokens,
        json_mode,
    });
}

// ─── Types ───

export type StudentLifeCategory =
    | "academic"
    | "placement"
    | "scholarship"
    | "hackathon"
    | "club-event"
    | "hostel"
    | "administrative"
    | "research"
    | "extracurricular"
    | "networking"
    | "deadline"
    | "general"
    | "noise";

export interface MsgFilterIntent {
    parsedQuery: string;
    topics: string[];
    groupHints: string[];
    timeHint: string | null;
    dateRange: { after: string | null; before: string | null } | null;
    urgencyBias: "any" | "urgent-only" | "non-urgent" | null;
    studentLifeCategory: StudentLifeCategory | null;
    deadlineFocus: boolean;
    intentType: "search" | "events" | "deadlines" | "action-needed" | "plans" | null;
    includeKeywords: string[];
    excludeKeywords: string[];
    parseConfidence: number;
}

export interface MsgFilterResult {
    msgId: string;
    relevant: boolean;
    reason: string;
    confidence: number;
    matchedTopics: string[];
    category: StudentLifeCategory;
    extractedDate: string | null;
    urgencyScore: number;
    isEvent: boolean;
}

export interface DetectedEvent {
    title: string;
    description: string;
    eventDate: string | null;
    deadline: string | null;
    location: string | null;
    url: string | null;
    category: string | null;
    priority: number | null;
    confidence: number;
    chatName: string | null;
    authorName: string | null;
    rawContext: string;
}

// ─── Helpers ───

type MsgInput = {
    id: string;
    chatName: string;
    authorName?: string;
    body: string;
    timestamp: number;
    isGroup: boolean;
    urls: string[];
};

function waToInput(m: WAMessage | any): MsgInput {
    return {
        id: m.id || `${m.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        chatName: m.chatName || m.groupName || "Unknown",
        authorName: m.authorName || m.sender || undefined,
        body: m.body || m.text || m.content || "",
        timestamp: typeof m.timestamp === "number" ? m.timestamp : Date.now(),
        isGroup: m.isGroup ?? true,
        urls: Array.isArray(m.urls) ? m.urls : [],
    };
}

const STOP_WORDS = new Set([
    "the", "this", "that", "with", "from", "about", "have", "been",
    "were", "they", "their", "them", "what", "when", "where", "which",
    "will", "would", "could", "should", "there", "here", "some", "more",
    "also", "just", "like", "only", "very", "much", "many", "such",
    "than", "then", "into", "over", "your", "each", "make", "show",
    "find", "messages", "message", "chat", "group", "whatsapp",
]);

// ─── Semantic Keyword Expansion ───
// Maps common query terms to related terms for better pre-screen recall

const SEMANTIC_EXPANSIONS: Record<string, string[]> = {
    // Academics
    math: ["mathematics", "calculus", "algebra", "geometry", "integration", "differential", "equation", "linear", "trigonometry", "stats", "statistics", "probability"],
    exam: ["midsem", "endsem", "quiz", "test", "viva", "examination", "paper", "grading"],
    midsem: ["midsem", "mid-sem", "midterm", "mid semester"],
    endsem: ["endsem", "end-sem", "endterm", "end semester", "final exam"],
    assignment: ["assignment", "homework", "submission", "project", "lab report", "tutorial"],
    course: ["course", "subject", "elective", "slot", "timetable", "registration"],
    grade: ["grade", "cpi", "spi", "cgpa", "marks", "result"],
    professor: ["professor", "prof", "instructor", "faculty", "sir", "mam", "madam"],

    // Placements
    placement: ["placement", "recruit", "hiring", "package", "ctc", "offer", "shortlist", "interview", "resume", "cv"],
    internship: ["internship", "intern", "summer", "winter", "stipend", "ppo"],
    company: ["company", "firm", "startup", "mnc", "corporate"],
    interview: ["interview", "round", "hr", "technical", "coding test", "aptitude"],

    // Hackathons / Tech
    hackathon: ["hackathon", "hack", "code", "coding", "competition", "challenge", "ctf", "devathon"],
    coding: ["coding", "programming", "code", "debug", "leetcode", "codeforces", "competitive"],
    tech: ["tech", "technology", "software", "development", "open source", "github"],
    workshop: ["workshop", "bootcamp", "tutorial", "session", "webinar", "talk", "seminar"],

    // Student Life
    hostel: ["hostel", "room", "mess", "warden", "caretaker", "wing", "floor", "maintenance"],
    fest: ["fest", "techfest", "mood indigo", "moodi", "cultural", "sports", "event"],
    club: ["club", "committee", "council", "secretary", "convener", "wncc", "soc"],
    scholarship: ["scholarship", "fellowship", "financial aid", "merit", "stipend", "bursary"],
    deadline: ["deadline", "due date", "last date", "submission", "register before", "closes"],

    // Research
    research: ["research", "paper", "conference", "journal", "thesis", "lab", "phd", "ra"],

    // General query terms
    question: ["question", "doubt", "query", "ask", "help", "discussion", "answer"],
    important: ["important", "urgent", "asap", "critical", "notify", "attention", "notice"],
    event: ["event", "happening", "schedule", "attend", "register", "rsvp", "invite"],
    free: ["free", "open", "available", "no cost", "complimentary"],
    food: ["food", "mess", "canteen", "snacks", "party", "treats"],
};

function expandKeywords(keywords: string[]): string[] {
    const expanded = new Set<string>();
    for (const kw of keywords) {
        expanded.add(kw);
        const lower = kw.toLowerCase();
        // Check for expansions
        for (const [root, synonyms] of Object.entries(SEMANTIC_EXPANSIONS)) {
            if (lower.includes(root) || root.includes(lower)) {
                for (const syn of synonyms) expanded.add(syn);
            }
        }
        // Also add partial stems (3+ char prefix matching)
        if (lower.length >= 4) {
            expanded.add(lower.slice(0, -1)); // Drop last char for fuzzy match
        }
    }
    return Array.from(expanded);
}

function localMsgPreScreen(
    msgs: MsgInput[],
    intent: MsgFilterIntent,
): MsgInput[] {
    const rawKw: string[] = [
        ...intent.topics,
        ...intent.includeKeywords,
        ...intent.parsedQuery
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
        ...(intent.studentLifeCategory ? [intent.studentLifeCategory] : []),
    ].map((k) => k.toLowerCase());

    if (rawKw.length === 0) return msgs;

    // Expand keywords semantically for much better recall
    const allKw = expandKeywords(rawKw);

    const excludeKw = intent.excludeKeywords.map((k) => k.toLowerCase());

    // Softer pre-screen: if ANY expanded keyword matches, keep the message
    // This dramatically improves recall while still eliminating obvious noise
    return msgs.filter((m) => {
        const text = `${m.chatName} ${m.authorName || ""} ${m.body}`.toLowerCase();
        if (excludeKw.some((ek) => text.includes(ek))) return false;
        return allKw.some((kw) => {
            if (kw.includes(" ")) {
                // For multi-word keywords, require at least half the words to match
                const words = kw.split(" ").filter((w) => w.length > 2);
                const matchCount = words.filter((w) => text.includes(w)).length;
                return matchCount >= Math.ceil(words.length * 0.5);
            }
            return text.includes(kw);
        });
    });
}

// ─── Pass 1: Intent Extraction ───

async function extractMsgIntent(
    rawPrompt: string,
    engine: MsgEngine,
): Promise<MsgFilterIntent> {
    const systemPrompt = `You are a precision NL understanding engine for an IIT Bombay student's WhatsApp message intelligence system (NEXUS NanoClaw).

Parse raw queries into structured filter intents. The user is an IIT Bombay student receiving messages from WhatsApp groups about academics, placements, hackathons, events, etc.

STUDENT-LIFE CONTEXT:
- Placements/Internships: PPOs, Day 1/2 companies, CPI cutoffs, shortlists, interview schedules
- Academics: Exams (midsem, endsem, quiz), assignments, grades, course registration
- Hackathons/Tech: SoC, WnCC, coding competitions, CTFs, tech talks
- Clubs/Events: Mood Indigo, Techfest, E-Cell, cultural/sports events
- Hostel: Room allocation, mess menu, maintenance, warden notices
- Administrative: ID cards, certificates, NOC, registration, transcripts
- Research: Conference papers, lab schedules, thesis deadlines, RA positions

IMPORTANT — KEYWORD GENERATION:
- Generate COMPREHENSIVE includeKeywords that cover the FULL SEMANTIC RANGE of the query
- Include synonyms, abbreviations, related terms, Hindi/Hinglish equivalents common in IIT groups
- For "math questions" → include: math, mathematics, calculus, algebra, integration, equation, formula, proof, theorem, derivation, solution
- For "placement updates" → include: placement, recruit, hiring, offer, package, ctc, shortlist, ppo, interview, company, intern
- Be GENEROUS with keywords — more keywords = better recall

OUTPUT — JSON object only:
{
  "parsedQuery": "Clean version of what they want",
  "topics": ["hackathon", "coding competition"],
  "groupHints": ["coding club", "placement cell"],
  "timeHint": "this week",
  "dateRange": { "after": null, "before": null },
  "urgencyBias": "any",
  "studentLifeCategory": "hackathon",
  "deadlineFocus": true,
  "intentType": "events",
  "includeKeywords": ["hackathon", "hack", "coding", "competition", "registration", "deadline", "ctf", "devathon", "challenge"],
  "excludeKeywords": [],
  "parseConfidence": 0.9
}

CRITICAL: Output ONLY the JSON object.`;

    try {
        console.log(`[NANOCLAW] Pass 1 (Intent) → ${engine}`);
        const raw = await msgChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Parse this student's message filter request:\n\n"${rawPrompt}"` },
            ],
            { engine, temperature: 0.1, max_tokens: 1024, json_mode: true, preferredRole: "intent" },
        );

        const p = extractJson<MsgFilterIntent>(raw);
        return {
            parsedQuery: p.parsedQuery || rawPrompt,
            topics: Array.isArray(p.topics) ? p.topics : [],
            groupHints: Array.isArray(p.groupHints) ? p.groupHints : [],
            timeHint: p.timeHint || null,
            dateRange:
                p.dateRange && typeof p.dateRange === "object"
                    ? { after: p.dateRange.after || null, before: p.dateRange.before || null }
                    : null,
            urgencyBias: p.urgencyBias || null,
            studentLifeCategory: p.studentLifeCategory || null,
            deadlineFocus: !!p.deadlineFocus,
            intentType: p.intentType || null,
            includeKeywords: Array.isArray(p.includeKeywords) ? p.includeKeywords : [],
            excludeKeywords: Array.isArray(p.excludeKeywords) ? p.excludeKeywords : [],
            parseConfidence: typeof p.parseConfidence === "number" ? p.parseConfidence : 0.5,
        };
    } catch (err) {
        console.error("[NANOCLAW INTENT] Parse failed, fallback:", err);
        const lower = rawPrompt.toLowerCase();
        const catHints: Record<string, StudentLifeCategory> = {
            placement: "placement", internship: "placement", ppo: "placement",
            exam: "academic", assignment: "academic", midsem: "academic",
            hackathon: "hackathon", ctf: "hackathon", coding: "hackathon",
            club: "club-event", fest: "club-event", techfest: "club-event",
            hostel: "hostel", mess: "hostel", warden: "hostel",
            scholarship: "scholarship", stipend: "scholarship",
            deadline: "deadline", due: "deadline",
        };
        let category: StudentLifeCategory | null = null;
        for (const [kw, cat] of Object.entries(catHints)) {
            if (lower.includes(kw)) { category = cat; break; }
        }
        return {
            parsedQuery: rawPrompt,
            topics: [],
            groupHints: [],
            timeHint: null,
            dateRange: null,
            urgencyBias: lower.includes("urgent") ? "urgent-only" : null,
            studentLifeCategory: category,
            deadlineFocus: lower.includes("deadline") || lower.includes("due"),
            intentType: null,
            includeKeywords: rawPrompt.split(/\s+/).filter((w) => w.length > 3),
            excludeKeywords: [],
            parseConfidence: 0.3,
        };
    }
}

// ─── Pass 2: Classification ───

const CONFIDENCE_FLOOR = 0.35;

async function classifyMsgBatch(
    batch: MsgInput[],
    intent: MsgFilterIntent,
    rawPrompt: string,
    engine: MsgEngine,
): Promise<MsgFilterResult[]> {
    const msgList = batch
        .map(
            (m, i) =>
                `[${i}] ID:${m.id}\n    GROUP: ${m.chatName}\n    FROM: ${m.authorName || "unknown"}\n    TIME: ${new Date(m.timestamp).toLocaleString()}\n    MSG: ${m.body.substring(0, 400)}${m.urls.length ? `\n    URLS: ${m.urls.join(", ")}` : ""}`,
        )
        .join("\n\n");

    const intentBlock = `PARSED INTENT:
- Query: ${intent.parsedQuery}
- Topics: ${intent.topics.join(", ") || "none"}
- Group hints: ${intent.groupHints.join(", ") || "any"}
- Time: ${intent.timeHint || "none"}
- Urgency: ${intent.urgencyBias || "any"}
- Category: ${intent.studentLifeCategory || "any"}
- Deadline focus: ${intent.deadlineFocus ? "YES" : "no"}
- Intent: ${intent.intentType || "search"}
- Include: ${intent.includeKeywords.join(", ") || "none"}
- Exclude: ${intent.excludeKeywords.join(", ") || "none"}`;

    const systemPrompt = `You are a WhatsApp message classification engine for an IIT Bombay student's NEXUS NanoClaw system.

TASK: Given the student's filter intent and a batch of WhatsApp messages, classify each message for RELEVANCE. Aim for HIGH RECALL — it's better to include borderline-relevant messages than miss them. The enrichment pass will refine later.

${intentBlock}

CATEGORIES (classify each message into ONE):
- academic, placement, scholarship, hackathon, club-event, hostel, administrative, research, extracurricular, networking, deadline, general, noise

MESSAGE CLASSIFICATION RULES:
1. GENEROUS TOPIC MATCH: Mark relevant if content is RELATED to the query topics, even indirectly. Discussions ABOUT the topic, questions about it, tangential mentions — all count.
2. SEMANTIC MATCHING: "math questions" matches calculus problems, integration help, equation solving, formula discussions, etc. Don't require exact literal keyword matches.
3. NOISE DETECTION: ONLY mark as noise if the message is clearly unrelated (memes, "good morning", random banter with zero topic connection).
4. EVENT DETECTION: If message contains event info (date, venue, registration link), set isEvent: true.
5. DEADLINE EXTRACTION: Extract dates/deadlines in ISO format when found.
6. CONFIDENCE: LOW (0.3-0.5) for indirect/tangential matches, MEDIUM (0.5-0.75) for clear topic relation, HIGH (0.75-1.0) for direct matches.
7. WHEN IN DOUBT: Mark as relevant with medium confidence (0.5) — let the enrichment pass decide.

OUTPUT — JSON array only:
[{ "index": 0, "relevant": true, "reason": "Direct match — hackathon registration deadline", "confidence": 0.92, "matchedTopics": ["hackathon"], "category": "hackathon", "extractedDate": "2025-07-15", "urgencyScore": 0.8, "isEvent": true }]

CRITICAL: Output ONLY the JSON array.`;

    try {
        console.log(`[NANOCLAW] Pass 2 (Classify batch of ${batch.length}) → ${engine}`);
        const raw = await msgChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `STUDENT REQUEST: "${rawPrompt}"\n\nMESSAGES:\n${msgList}\n\nClassify each. JSON array only:` },
            ],
            { engine, temperature: 0.12, max_tokens: 3072, json_mode: true, preferredRole: "classify" },
        );

        const parsed = extractJson<any[]>(raw);
        const arr = Array.isArray(parsed) ? parsed : [];

        return batch.map((m, i) => {
            const match = arr.find((p: any) => p.index === i);
            const rawRelevant = match?.relevant ?? false;
            const confidence = match?.confidence ?? 0;
            return {
                msgId: m.id,
                relevant: rawRelevant && confidence >= CONFIDENCE_FLOOR,
                reason: match?.reason ?? "Unclassified",
                confidence,
                matchedTopics: match?.matchedTopics ?? [],
                category: (match?.category as StudentLifeCategory) || "general",
                extractedDate: match?.extractedDate || null,
                urgencyScore: match?.urgencyScore ?? 0,
                isEvent: match?.isEvent ?? false,
            };
        });
    } catch (err) {
        console.error("[NANOCLAW] Classification error:", err);
        return batch.map((m) => ({
            msgId: m.id,
            relevant: false,
            reason: "Classification error",
            confidence: 0,
            matchedTopics: [],
            category: "general" as StudentLifeCategory,
            extractedDate: null,
            urgencyScore: 0,
            isEvent: false,
        }));
    }
}

// ─── Pass 3: Event Detection (deep pass on event-flagged messages) ───

async function detectEvents(
    msgs: MsgInput[],
    results: MsgFilterResult[],
    engine: MsgEngine,
): Promise<DetectedEvent[]> {
    const eventMsgs = results
        .filter((r) => r.relevant && r.isEvent)
        .map((r) => msgs.find((m) => m.id === r.msgId))
        .filter(Boolean) as MsgInput[];

    if (eventMsgs.length === 0) return [];

    const msgList = eventMsgs
        .map(
            (m, i) =>
                `[${i}] GROUP: ${m.chatName} | FROM: ${m.authorName || "unknown"} | TIME: ${new Date(m.timestamp).toLocaleString()}\nMSG: ${m.body.substring(0, 500)}${m.urls.length ? `\nURLs: ${m.urls.join(", ")}` : ""}`,
        )
        .join("\n\n");

    const systemPrompt = `You are an event extraction engine for an IIT Bombay student. Extract structured event data from WhatsApp messages.

For EACH message, if it contains an event, extract:
- title: Short event name
- description: Brief description
- eventDate: ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm) or null
- deadline: Registration/submission deadline (ISO) or null
- location: Venue or "Virtual" or null
- url: Registration/info URL or null
- category: One of [exam, assignment, hackathon, workshop, contest, internship, social, noise] or null
- priority: 1-5 (5=highest) based on urgency and student relevance
- confidence: 0.0-1.0 how confident you are this is a real event

Be precise with dates. If year is not mentioned, assume 2025. If the message is just discussion (not an actual event), skip it.

OUTPUT — JSON array:
[{ "index": 0, "title": "HackMIT 2025", "description": "Annual MIT hackathon", "eventDate": "2025-09-15", "deadline": "2025-08-30", "location": "Virtual", "url": "https://hackmit.org", "category": "hackathon", "priority": 4, "confidence": 0.95 }]

CRITICAL: Output ONLY the JSON array.`;

    try {
        console.log(`[NANOCLAW] Pass 3 (Detect ${eventMsgs.length} events) → ${engine}`);
        const raw = await msgChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `MESSAGES WITH POTENTIAL EVENTS:\n${msgList}\n\nExtract events. JSON array only:` },
            ],
            { engine, temperature: 0.1, max_tokens: 3072, json_mode: true, preferredRole: "detect" },
        );

        const parsed = extractJson<any[]>(raw);
        const arr = Array.isArray(parsed) ? parsed : [];

        return arr.map((e: any, i: number) => {
            const srcMsg = eventMsgs[e.index ?? i];
            return {
                title: e.title || "Untitled Event",
                description: e.description || "",
                eventDate: e.eventDate || null,
                deadline: e.deadline || null,
                location: e.location || null,
                url: e.url || (srcMsg?.urls?.[0] ?? null),
                category: e.category || null,
                priority: e.priority ?? null,
                confidence: e.confidence ?? 0.5,
                chatName: srcMsg?.chatName || null,
                authorName: srcMsg?.authorName || null,
                rawContext: srcMsg?.body?.substring(0, 1000) || "",
            };
        });
    } catch (err) {
        console.error("[NANOCLAW] Event detection error:", err);
        return [];
    }
}

// ─── Pass 4: Enrichment (borderline messages) ───

async function enrichMsgResults(
    msgs: MsgInput[],
    results: MsgFilterResult[],
    intent: MsgFilterIntent,
    engine: MsgEngine,
): Promise<MsgFilterResult[]> {
    // Enrich borderline messages: relevant with medium confidence OR
    // non-relevant but with some confidence (near-misses from classification)
    const borderline = results.filter(
        (r) => (r.relevant && r.confidence >= 0.3 && r.confidence < 0.8) ||
               (!r.relevant && r.confidence >= 0.25 && r.reason !== "Eliminated by keyword pre-screen"),
    );
    if (borderline.length === 0 || borderline.length > 30) return results;

    const enrichMsgs = borderline
        .map((r) => msgs.find((m) => m.id === r.msgId))
        .filter(Boolean) as MsgInput[];

    const msgList = enrichMsgs
        .map(
            (m, i) =>
                `[${i}] ID:${m.id} | GROUP: ${m.chatName} | FROM: ${m.authorName || "?"}\nMSG: ${m.body.substring(0, 400)}`,
        )
        .join("\n");

    const systemPrompt = `You are a deep message analysis engine for IIT Bombay student. Re-evaluate these borderline WhatsApp messages with CAREFUL semantic analysis.

Some were marked irrelevant but may actually be relevant when analyzed more deeply. Look for INDIRECT connections to the query topic — discussions, questions, replies, context clues.

USER QUERY: "${intent.parsedQuery}"
CATEGORY: ${intent.studentLifeCategory || "any"}
TOPICS: ${intent.topics.join(", ") || "general"}

IMPORTANT: A message discussing a topic indirectly (e.g., asking about a math formula when query is "math questions") IS relevant. Be generous with relevance — the student wants to see everything related.

OUTPUT — JSON array:
[{ "id": "msg-id", "relevant": true, "reason": "Refined: contains discussion about exam topic", "confidence": 0.72, "category": "academic", "extractedDate": "2025-07-20", "urgencyScore": 0.5, "isEvent": false }]

CRITICAL: Output ONLY the JSON array.`;

    try {
        console.log(`[NANOCLAW] Pass 4 (Enrich ${enrichMsgs.length} borderline) → ${engine}`);
        const raw = await msgChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `MESSAGES:\n${msgList}\n\nRe-evaluate. JSON array only:` },
            ],
            { engine, temperature: 0.1, max_tokens: 2048, json_mode: true, preferredRole: "enrich" },
        );

        const enriched = extractJson<any[]>(raw);
        const arr = Array.isArray(enriched) ? enriched : [];

        return results.map((r) => {
            const e = arr.find((x: any) => x.id === r.msgId);
            if (!e) return r;
            return {
                ...r,
                relevant: e.relevant && (e.confidence >= CONFIDENCE_FLOOR),
                reason: e.reason || r.reason,
                confidence: e.confidence,
                category: (e.category as StudentLifeCategory) || r.category,
                extractedDate: e.extractedDate || r.extractedDate,
                urgencyScore: e.urgencyScore ?? r.urgencyScore,
                isEvent: e.isEvent ?? r.isEvent,
            };
        });
    } catch (err) {
        console.error("[NANOCLAW] Enrichment error (non-fatal):", err);
        return results;
    }
}

// ─── Public API ───

/**
 * NanoClaw 5-pass WhatsApp message intelligence pipeline:
 * 1. Intent extraction (NANOBOT-MSG-1)
 * 2. Classification (NANOBOT-MSG-2)
 * 3. Event detection (NANOBOT-MSG-3)
 * 4. Enrichment (NANOBOT-MSG-4)
 * 5. Event structuring for adaptive planner (NANOBOT-MSG-5)
 */
export async function classifyMessagesWithNL(
    rawMessages: (WAMessage | any)[],
    nlPrompt: string,
): Promise<{
    results: MsgFilterResult[];
    intent: MsgFilterIntent;
    detectedEvents: DetectedEvent[];
}> {
    if (!nlPrompt.trim() || rawMessages.length === 0) {
        return { results: [], intent: emptyIntent(), detectedEvents: [] };
    }

    const msgs = rawMessages.map(waToInput);
    const engine = pickMsgEngine();
    console.log(
        `[NANOCLAW] Engine: ${engine} | Messages: ${msgs.length} | Prompt: "${nlPrompt.slice(0, 80)}"`,
    );

    // ── Pass 1: Extract intent ──
    const intent = await extractMsgIntent(nlPrompt, engine);
    console.log(
        `[NANOCLAW] Intent (conf: ${intent.parseConfidence}) — cat: ${intent.studentLifeCategory || "any"}, topics: [${intent.topics.join(", ")}]`,
    );

    // ── Pre-screen: local keyword filter (semantic expansion enabled) ──
    const candidates = localMsgPreScreen(msgs, intent);
    const skipped = msgs.filter((m) => !candidates.find((c) => c.id === m.id));
    console.log(
        `[NANOCLAW] Pre-screen: ${candidates.length}/${msgs.length} candidates, ${skipped.length} eliminated (semantic expansion active)`,
    );

    const results: MsgFilterResult[] = skipped.map((m) => ({
        msgId: m.id,
        relevant: false,
        reason: "Eliminated by keyword pre-screen",
        confidence: 0,
        matchedTopics: [],
        category: "noise" as StudentLifeCategory,
        extractedDate: null,
        urgencyScore: 0,
        isEvent: false,
    }));

    // ── Pass 2: Classify candidates via LLM ──
    const batchSize = engine === "groq-msg-pool" ? 15 : 6;
    const concurrency = engine === "groq-msg-pool" ? 6 : 2;
    const batches: MsgInput[][] = [];
    for (let i = 0; i < candidates.length; i += batchSize) {
        batches.push(candidates.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency);
        const promises = chunk.map(async (batch) => {
            try {
                return await classifyMsgBatch(batch, intent, nlPrompt, engine);
            } catch (err) {
                console.warn("[NANOCLAW] Batch retry...", err);
                try {
                    return await classifyMsgBatch(batch, intent, nlPrompt, engine);
                } catch {
                    return batch.map((m) => ({
                        msgId: m.id,
                        relevant: false,
                        reason: "LLM classification error",
                        confidence: 0,
                        matchedTopics: [] as string[],
                        category: "general" as StudentLifeCategory,
                        extractedDate: null,
                        urgencyScore: 0,
                        isEvent: false,
                    }));
                }
            }
        });
        const chunkResults = await Promise.all(promises);
        for (const br of chunkResults) results.push(...br);
    }

    // ── Pass 3: Detect events from flagged messages ──
    const detectedEvents = await detectEvents(msgs, results, engine);
    console.log(`[NANOCLAW] Detected ${detectedEvents.length} events`);

    // ── Pass 4: Enrich borderline results ──
    const enriched = await enrichMsgResults(msgs, results, intent, engine);

    // Sort: relevant first, then by urgency
    enriched.sort((a, b) => {
        if (a.relevant && !b.relevant) return -1;
        if (!a.relevant && b.relevant) return 1;
        return b.urgencyScore - a.urgencyScore;
    });

    const relevantCount = enriched.filter((r) => r.relevant).length;
    console.log(
        `[NANOCLAW] Complete: ${relevantCount}/${msgs.length} relevant, ${detectedEvents.length} events (${engine})`,
    );

    return { results: enriched, intent, detectedEvents };
}

function emptyIntent(): MsgFilterIntent {
    return {
        parsedQuery: "",
        topics: [],
        groupHints: [],
        timeHint: null,
        dateRange: null,
        urgencyBias: null,
        studentLifeCategory: null,
        deadlineFocus: false,
        intentType: null,
        includeKeywords: [],
        excludeKeywords: [],
        parseConfidence: 0,
    };
}
