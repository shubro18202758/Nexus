// ===================================================================
// Mail Filter Engine v3 — Three-Body Nanobot NL Filtering
//
// Three-pass architecture powered by the Groq Mail Pool:
//   Pass 1 (NANOBOT-MAIL-1 → Intent):     Parses raw NL → structured intent
//   Pass 2 (NANOBOT-MAIL-2 → Classify):    Classifies each mail against intent
//   Pass 3 (NANOBOT-MAIL-3 → Enrich):      Deep analysis — dates, deadlines, urgency
//
// Primary engine: Groq Mail Pool (3 dedicated keys, llama-3.1-8b-instant)
// Fallback: LLMEngine (Groq Alpha → Groq Beta → Local Ollama)
//
// Student-life aware: understands IIT/university context, placements,
// hackathons, scholarships, hostel notices, exam schedules, clubs, etc.
// ===================================================================

import { LLMEngine, extractJson, type ChatMode } from "@/lib/ai/llm-engine";
import {
    groqMailChat,
    isMailPoolAvailable,
    type GroqMailMessage,
} from "@/lib/mail/groq-mail-pool";

// ─── Engine Selection ───

type FilterEngine = "groq-mail-pool" | "groq-alpha" | "groq-beta" | "local";

/**
 * Pick the best available engine for filter operations.
 * Priority: Groq Mail Pool → Groq Alpha → Groq Beta → Local Ollama
 */
function pickFilterEngine(): FilterEngine {
    // Priority 1: Dedicated mail pool (3 keys, no contention)
    if (isMailPoolAvailable()) return "groq-mail-pool";

    // Priority 2/3: General Groq engines (cloud, but shared with other features)
    const engine = LLMEngine.getInstance();
    if (engine.isGroqAlphaReady()) return "groq-alpha";
    if (engine.isGroqBetaReady()) return "groq-beta";

    // Last resort: local Ollama
    return "local";
}

/**
 * Unified chat function — routes to mail pool or LLMEngine transparently.
 */
async function filterChat(
    messages: GroqMailMessage[],
    opts: {
        engine: FilterEngine;
        temperature?: number;
        max_tokens?: number;
        json_mode?: boolean;
        signal?: AbortSignal;
        preferredRole?: "intent" | "classify" | "enrich";
    },
): Promise<string> {
    const { engine, temperature = 0.15, max_tokens = 4096, json_mode = true, signal, preferredRole } = opts;

    if (engine === "groq-mail-pool") {
        return groqMailChat(messages, {
            temperature,
            max_tokens,
            json_mode,
            signal,
            preferredRole,
        });
    }

    // Route through LLMEngine for non-pool engines
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

// ─── Local Pre-Screen ───

type MailInput = { uid: number; from: string; subject: string; snippet: string };

/** Common English stop words to skip during keyword extraction */
const STOP_WORDS = new Set([
    "the", "this", "that", "with", "from", "about", "have", "been",
    "were", "they", "their", "them", "what", "when", "where", "which",
    "will", "would", "could", "should", "there", "here", "some", "more",
    "also", "just", "like", "only", "very", "much", "many", "such",
    "than", "then", "into", "over", "your", "each", "make", "show",
    "find", "mails", "emails", "mail", "email", "regarding", "related",
    "any", "all", "does", "didn", "don", "isn",
]);

/**
 * Quick local keyword check — eliminates mails that have ZERO overlap
 * with the intent's topics/keywords. Avoids LLM calls on obviously
 * irrelevant mails. Threshold is LOW — only eliminates obvious misses.
 */
function localPreScreen(
    mails: MailInput[],
    intent: FilterIntent,
    _rawPrompt: string,
): MailInput[] {
    const allKeywords: string[] = [
        ...intent.topics,
        ...intent.includeKeywords,
        ...intent.parsedQuery
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3 && !STOP_WORDS.has(w)),
        // Student-life category keywords
        ...(intent.studentLifeCategory ? [intent.studentLifeCategory] : []),
    ].map(k => k.toLowerCase());

    if (allKeywords.length === 0) return mails;

    const excludeKws = intent.excludeKeywords.map(k => k.toLowerCase());

    return mails.filter(m => {
        const text = `${m.from} ${m.subject} ${m.snippet}`.toLowerCase();

        if (excludeKws.some(ek => text.includes(ek))) return false;

        const hasOverlap = allKeywords.some(kw => {
            if (kw.includes(" ")) {
                const words = kw.split(" ").filter(w => w.length > 2);
                return words.every(w => text.includes(w));
            }
            return text.includes(kw);
        });

        return hasOverlap;
    });
}

// ─── Types ───

/** Student life categories relevant to IIT/university context */
export type StudentLifeCategory =
    | "academic"          // Courses, grades, assignments, exams
    | "placement"         // Jobs, internships, company visits, PPOs
    | "scholarship"       // Financial aid, stipends, grants, fee waivers
    | "hackathon"         // Coding competitions, tech events, CTFs
    | "club-event"        // Student clubs, societies, cultural events
    | "hostel"            // Room allocation, mess, maintenance, notices
    | "administrative"    // Registration, ID cards, certificates, NOCs
    | "research"          // Papers, conferences, lab work, thesis
    | "extracurricular"   // Sports, NCC, NSS, workshops
    | "networking"        // LinkedIn, professional connections, alumni
    | "newsletter"        // Periodic updates, digests, announcements
    | "deadline"          // Any time-sensitive items
    | "general";          // Uncategorised

export interface FilterIntent {
    /** Cleaned, structured version of what the user wants */
    parsedQuery: string;
    /** Key topics/themes extracted */
    topics: string[];
    /** Any sender hints (names, domains, org types) */
    senderHints: string[];
    /** Implied time constraints (ISO date or relative like "this week") */
    timeHint: string | null;
    /** Date range filter — structured start/end dates */
    dateRange: { after: string | null; before: string | null } | null;
    /** Time-of-day filter */
    timeOfDay: "morning" | "afternoon" | "evening" | "night" | null;
    /** Priority/urgency bias */
    urgencyBias: "any" | "urgent-only" | "non-urgent" | null;
    /** Student life category */
    studentLifeCategory: StudentLifeCategory | null;
    /** Whether deadlines/due dates are important */
    deadlineFocus: boolean;
    /** Intent type (what the user wants to DO with the results) */
    intentType: "search" | "review" | "action-needed" | "archive" | "delete" | null;
    /** Include/exclude signals */
    includeKeywords: string[];
    excludeKeywords: string[];
    /** Confidence in parsing (0-1) */
    parseConfidence: number;
    /** Sentiment bias — only match mails with this tone */
    sentimentBias: "positive" | "negative" | "neutral" | null;
}

export interface FilterResult {
    uid: number;
    relevant: boolean;
    reason: string;
    confidence: number;
    /** Matched topics from the intent */
    matchedTopics: string[];
    /** Student life category detected */
    category: StudentLifeCategory;
    /** Extracted deadline/date if found */
    extractedDate: string | null;
    /** Urgency level 0-1 */
    urgencyScore: number;
}

// ─── Constants ───

/** Minimum confidence for a mail to be considered relevant */
const CONFIDENCE_FLOOR = 0.60;

// ─── Pass 1: Intent Extraction ───

async function extractFilterIntent(
    rawPrompt: string,
    engine: FilterEngine,
): Promise<FilterIntent> {
    const systemPrompt = `You are a PRECISION natural language understanding engine for an IIT Bombay student's email search system (NEXUS / Slingshot platform).

Your task: Parse raw, messy human queries into a TIGHT, SPECIFIC structured filter intent. The user is an IIT Bombay student — understand their world.

STUDENT-LIFE CONTEXT — recognise and parse these concepts:
- Placements/Internships: PPOs, Day 1/2 companies, CPI cutoffs, shortlists, interview schedules, stipends
- Academics: Exams (midsem, endsem, quiz), assignments, grades, course registration, professors, TAs
- Scholarships: MCM, Institute Merit, KVPY, fee waivers, financial aid
- Hackathons/Tech: SoC (Seasons of Code), WnCC, coding competitions, CTFs, tech talks
- Clubs/Events: Mood Indigo, Techfest, E-Cell, literary/dance/music clubs, fest registrations
- Hostel: Room allocation, mess menu, maintenance, warden notices, night canteen
- Administrative: ID cards, bonafide certificates, NOC, semester registration, transcripts
- Research: Conference papers, lab schedules, thesis deadlines, RA positions
- Networking: LinkedIn connections, alumni messages, professional invitations

EXAMPLES:
- "show me placement mails from last week" → studentLifeCategory: "placement", timeHint: "last week"
- "any hackathon deadlines coming up?" → studentLifeCategory: "hackathon", deadlineFocus: true
- "scholarship stuff from admin" → studentLifeCategory: "scholarship", senderHints: ["admin", "academic office"]
- "urgent hostel maintenance notices" → studentLifeCategory: "hostel", urgencyBias: "urgent-only"

OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "parsedQuery": "Clean 1-2 sentence version of what they want",
  "topics": ["topic1", "topic2"],
  "senderHints": ["professor", "admin@iitb.ac.in"],
  "timeHint": "last week",
  "dateRange": { "after": "2025-01-01", "before": "2025-06-30" },
  "timeOfDay": null,
  "urgencyBias": "any",
  "studentLifeCategory": "academic",
  "deadlineFocus": false,
  "intentType": "search",
  "includeKeywords": ["scholarship", "funding"],
  "excludeKeywords": ["newsletter"],
  "parseConfidence": 0.85,
  "sentimentBias": null
}

RULES:
- topics: 1-5 SPECIFIC topics directly related to the query. Be precise!
- senderHints: Names, email patterns, org types
- timeHint: Relative time expressions (null if no temporal constraint)
- dateRange: Specific date bounds if user mentions dates (null if unspecified)
- timeOfDay: If user says "morning mails" etc. (null if unspecified)
- studentLifeCategory: Most fitting category from the list above (null if ambiguous)
- deadlineFocus: true if the user cares about deadlines/due dates
- intentType: What they want to DO — "search" (find), "review" (read), "action-needed" (respond/act), "archive", "delete"
- includeKeywords: Specific words that MUST appear — be precise
- excludeKeywords: Things to EXCLUDE
- sentimentBias: Filter by tone (null if not specified)
- parseConfidence: Your confidence in understanding the intent (0-1)

CRITICAL: Output ONLY the JSON object. No markdown, no explanation.`;

    try {
        console.log(`[FILTER] Pass 1 (Intent) → ${engine}`);

        const raw = await filterChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Parse this student's email filter request:\n\n"${rawPrompt}"` },
            ],
            {
                engine,
                temperature: 0.1,
                max_tokens: 1024,
                json_mode: true,
                preferredRole: "intent",
            },
        );

        const parsed = extractJson<FilterIntent>(raw);
        return {
            parsedQuery: parsed.parsedQuery || rawPrompt,
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            senderHints: Array.isArray(parsed.senderHints) ? parsed.senderHints : [],
            timeHint: parsed.timeHint || null,
            dateRange: parsed.dateRange && typeof parsed.dateRange === "object"
                ? { after: parsed.dateRange.after || null, before: parsed.dateRange.before || null }
                : null,
            timeOfDay: parsed.timeOfDay || null,
            urgencyBias: parsed.urgencyBias || null,
            studentLifeCategory: parsed.studentLifeCategory || null,
            deadlineFocus: !!parsed.deadlineFocus,
            intentType: parsed.intentType || null,
            includeKeywords: Array.isArray(parsed.includeKeywords) ? parsed.includeKeywords : [],
            excludeKeywords: Array.isArray(parsed.excludeKeywords) ? parsed.excludeKeywords : [],
            parseConfidence: typeof parsed.parseConfidence === "number" ? parsed.parseConfidence : 0.5,
            sentimentBias: parsed.sentimentBias || null,
        };
    } catch (err) {
        console.error("[FILTER INTENT] Parse failed, using raw prompt:", err);
        // Graceful fallback — extract what we can locally
        const lower = rawPrompt.toLowerCase();
        const categoryHints: Record<string, StudentLifeCategory> = {
            placement: "placement", internship: "placement", ppo: "placement", job: "placement",
            exam: "academic", assignment: "academic", grade: "academic", course: "academic", midsem: "academic", endsem: "academic",
            scholarship: "scholarship", stipend: "scholarship", grant: "scholarship", mcm: "scholarship",
            hackathon: "hackathon", ctf: "hackathon", coding: "hackathon",
            club: "club-event", fest: "club-event", techfest: "club-event", mood: "club-event",
            hostel: "hostel", mess: "hostel", warden: "hostel", room: "hostel",
            certificate: "administrative", noc: "administrative", bonafide: "administrative",
            research: "research", paper: "research", conference: "research", thesis: "research",
            linkedin: "networking", connect: "networking", alumni: "networking",
            deadline: "deadline", due: "deadline", urgent: "deadline",
        };
        let category: StudentLifeCategory | null = null;
        for (const [kw, cat] of Object.entries(categoryHints)) {
            if (lower.includes(kw)) { category = cat; break; }
        }

        return {
            parsedQuery: rawPrompt,
            topics: [],
            senderHints: [],
            timeHint: null,
            dateRange: null,
            timeOfDay: null,
            urgencyBias: lower.includes("urgent") ? "urgent-only" : null,
            studentLifeCategory: category,
            deadlineFocus: lower.includes("deadline") || lower.includes("due"),
            intentType: null,
            includeKeywords: rawPrompt.split(/\s+/).filter(w => w.length > 3),
            excludeKeywords: [],
            parseConfidence: 0.3,
            sentimentBias: null,
        };
    }
}

// ─── Pass 2: Classification ───

async function classifyBatch(
    batch: MailInput[],
    intent: FilterIntent,
    rawPrompt: string,
    engine: FilterEngine,
): Promise<FilterResult[]> {
    const mailList = batch.map((m, i) => (
        `[${i}] UID:${m.uid}\n    FROM: ${m.from}\n    SUBJECT: ${m.subject}\n    SNIPPET: ${m.snippet.substring(0, 350)}`
    )).join("\n\n");

    const intentBlock = `PARSED INTENT:
- Query: ${intent.parsedQuery}
- Topics: ${intent.topics.join(", ") || "none specified"}
- Sender hints: ${intent.senderHints.join(", ") || "any"}
- Time constraint: ${intent.timeHint || "none"}
- Date range: ${intent.dateRange ? `after ${intent.dateRange.after || "any"}, before ${intent.dateRange.before || "any"}` : "none"}
- Urgency bias: ${intent.urgencyBias || "any"}
- Student-life category: ${intent.studentLifeCategory || "any"}
- Deadline focus: ${intent.deadlineFocus ? "YES — prioritise deadline-containing mails" : "no"}
- Intent type: ${intent.intentType || "search"}
- Sentiment bias: ${intent.sentimentBias || "any"}
- Must include: ${intent.includeKeywords.join(", ") || "none"}
- Must exclude: ${intent.excludeKeywords.join(", ") || "none"}`;

    const systemPrompt = `You are a STRICT precision email classification engine for an IIT Bombay student's NEXUS platform.

TASK: Given the user's filter intent and a list of emails, classify each email. Be STRICT — false positives are worse than false negatives.

${intentBlock}

STUDENT-LIFE CATEGORIES (classify each email into ONE):
- academic: Courses, grades, exams, assignments, lectures, TAs
- placement: Jobs, internships, PPOs, companies, shortlists, interviews
- scholarship: Financial aid, stipends, grants, fee waivers, MCM
- hackathon: Coding competitions, tech events, CTFs, dev challenges
- club-event: Student clubs, fests, cultural/sports events
- hostel: Room allocation, mess, maintenance, warden notices
- administrative: Registration, certificates, NOCs, ID cards
- research: Papers, conferences, lab work, thesis
- extracurricular: Sports, NCC, NSS, workshops
- networking: LinkedIn, alumni, professional connections
- newsletter: Periodic digests, announcements
- deadline: Time-sensitive items with clear due dates
- general: None of the above

CLASSIFICATION RULES:
1. STRICT TOPIC MATCHING: Relevant ONLY if content DIRECTLY matches the specific topics. Same sender domain is NOT enough.
2. CATEGORY MATCHING: If studentLifeCategory is set, strongly prefer mails in that category. Cross-category matches need high topic overlap.
3. DEADLINE EXTRACTION: If the email mentions a date/deadline, extract it as extractedDate (ISO format or descriptive).
4. URGENCY SCORING: Rate 0.0-1.0 based on time-sensitivity, explicit urgency markers, and deadline proximity.
5. CONFIDENCE: LOW (0.3-0.5) for tenuous matches, HIGH (0.8-1.0) for direct clear matches.
6. DEFAULT TO IRRELEVANT when in doubt.

OUTPUT FORMAT — respond with ONLY a valid JSON array:
[
  {
    "index": 0,
    "relevant": true,
    "reason": "Direct match — scholarship deadline from academic office",
    "confidence": 0.92,
    "matchedTopics": ["scholarship"],
    "category": "scholarship",
    "extractedDate": "2025-07-15",
    "urgencyScore": 0.8
  }
]

CRITICAL: Output ONLY the JSON array. No markdown, no explanation.`;

    const userPrompt = `ORIGINAL STUDENT REQUEST: "${rawPrompt}"

EMAILS TO CLASSIFY:
${mailList}

Classify each email. JSON array only:`;

    try {
        console.log(`[FILTER] Pass 2 (Classify batch of ${batch.length}) → ${engine}`);

        const raw = await filterChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                engine,
                temperature: 0.12,
                max_tokens: 2048,
                json_mode: true,
                preferredRole: "classify",
            },
        );

        const parsed = extractJson<{
            index: number; relevant: boolean; reason: string;
            confidence: number; matchedTopics?: string[];
            category?: string; extractedDate?: string; urgencyScore?: number;
        }[]>(raw);

        // Guard: if extractJson returned {} (empty object from empty LLM response), treat as empty array
        const parsedArr = Array.isArray(parsed) ? parsed : [];

        return batch.map((m, i) => {
            const match = parsedArr.find(p => p.index === i);
            const rawRelevant = match?.relevant ?? false;
            const confidence = match?.confidence ?? 0;
            const meetsThreshold = confidence >= CONFIDENCE_FLOOR;
            return {
                uid: m.uid,
                relevant: rawRelevant && meetsThreshold,
                reason: match?.reason ?? "Unclassified",
                confidence,
                matchedTopics: match?.matchedTopics ?? [],
                category: (match?.category as StudentLifeCategory) || "general",
                extractedDate: match?.extractedDate || null,
                urgencyScore: match?.urgencyScore ?? 0,
            };
        });
    } catch (err) {
        console.error("[MAIL FILTER] Classification error:", err);
        return batch.map(m => ({
            uid: m.uid,
            relevant: false,
            reason: "Classification error — excluded for safety",
            confidence: 0,
            matchedTopics: [],
            category: "general" as StudentLifeCategory,
            extractedDate: null,
            urgencyScore: 0,
        }));
    }
}

// ─── Pass 3: Deep Enrichment (optional — runs on borderline results) ───

async function enrichResults(
    mails: MailInput[],
    results: FilterResult[],
    intent: FilterIntent,
    engine: FilterEngine,
): Promise<FilterResult[]> {
    // Only enrich relevant mails with medium confidence
    const toEnrich = results.filter(r =>
        r.relevant && r.confidence >= 0.5 && r.confidence < 0.85
    );

    if (toEnrich.length === 0 || toEnrich.length > 15) {
        return results;
    }

    const enrichMails = toEnrich.map(r => mails.find(m => m.uid === r.uid)).filter(Boolean) as MailInput[];

    const mailList = enrichMails.map((m, i) => (
        `[${i}] UID:${m.uid} | FROM: ${m.from} | SUBJECT: ${m.subject} | SNIPPET: ${m.snippet.substring(0, 400)}`
    )).join("\n");

    const systemPrompt = `You are a deep email analysis engine for an IIT Bombay student. Re-evaluate these borderline emails with MORE careful analysis.

USER QUERY: "${intent.parsedQuery}"
CATEGORY FOCUS: ${intent.studentLifeCategory || "any"}

For each email, provide a refined classification:
- Re-check if the email truly matches the query's SPECIFIC intent
- Extract any dates, deadlines, or time references
- Assess urgency more carefully
- If the match is weak, mark as irrelevant

OUTPUT FORMAT — JSON array:
[{ "uid": 123, "relevant": true, "reason": "Refined: direct match", "confidence": 0.88, "category": "placement", "extractedDate": "2025-07-20", "urgencyScore": 0.7 }]

CRITICAL: Output ONLY the JSON array.`;

    try {
        console.log(`[FILTER] Pass 3 (Enrich ${enrichMails.length} borderline mails) → ${engine}`);

        const raw = await filterChat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: `EMAILS:\n${mailList}\n\nRe-evaluate. JSON array only:` },
            ],
            {
                engine,
                temperature: 0.1,
                max_tokens: 2048,
                json_mode: true,
                preferredRole: "enrich",
            },
        );

        const enrichedRaw = extractJson<{
            uid: number; relevant: boolean; reason: string;
            confidence: number; category?: string;
            extractedDate?: string; urgencyScore?: number;
        }[]>(raw);

        // Guard: if extractJson returned {} (empty LLM response), treat as empty array
        const enriched = Array.isArray(enrichedRaw) ? enrichedRaw : [];

        return results.map(r => {
            const e = enriched.find(x => x.uid === r.uid);
            if (!e) return r;
            return {
                ...r,
                relevant: e.relevant && (e.confidence >= CONFIDENCE_FLOOR),
                reason: e.reason || r.reason,
                confidence: e.confidence,
                category: (e.category as StudentLifeCategory) || r.category,
                extractedDate: e.extractedDate || r.extractedDate,
                urgencyScore: e.urgencyScore ?? r.urgencyScore,
            };
        });
    } catch (err) {
        console.error("[FILTER ENRICH] Enrichment pass failed (non-fatal):", err);
        return results;
    }
}

// ─── Date Filtering (Post-LLM) ───

function applyDateFilters(
    results: FilterResult[],
    _mails: MailInput[],
    intent: FilterIntent,
): FilterResult[] {
    if (!intent.dateRange && !intent.deadlineFocus) return results;

    return results.map(r => {
        if (!r.relevant) return r;

        if (intent.dateRange && r.extractedDate) {
            try {
                const extracted = new Date(r.extractedDate);
                if (intent.dateRange.after) {
                    const after = new Date(intent.dateRange.after);
                    if (extracted < after) {
                        return { ...r, relevant: false, reason: `Date ${r.extractedDate} is before filter range` };
                    }
                }
                if (intent.dateRange.before) {
                    const before = new Date(intent.dateRange.before);
                    if (extracted > before) {
                        return { ...r, relevant: false, reason: `Date ${r.extractedDate} is after filter range` };
                    }
                }
            } catch {
                // Date parse failed — keep the result as-is
            }
        }

        if (intent.deadlineFocus && r.extractedDate) {
            return { ...r, urgencyScore: Math.max(r.urgencyScore, 0.7) };
        }

        return r;
    });
}

// ─── Public API ───

/**
 * Advanced NL mail filter using Three-Body Nanobot architecture:
 * 1. Intent extraction (NANOBOT-MAIL-1): Parses messy NL into structured intent
 * 2. Classification (NANOBOT-MAIL-2): Classifies each mail against intent
 * 3. Enrichment (NANOBOT-MAIL-3): Deep analysis on borderline results
 *
 * Primary: Groq Mail Pool (3 dedicated keys). Fallback: LLMEngine cascade.
 */
export async function classifyMailsWithNL(
    mails: MailInput[],
    nlPrompt: string,
    onProgress?: (done: number, total: number, partialResults: FilterResult[]) => void,
    onIntentParsed?: (intent: FilterIntent) => void,
): Promise<{ results: FilterResult[]; intent: FilterIntent }> {
    if (!nlPrompt.trim() || mails.length === 0) {
        return { results: [], intent: emptyIntent() };
    }

    const engine = pickFilterEngine();
    console.log(`[FILTER] Engine selected: ${engine} | Mails: ${mails.length} | Prompt: "${nlPrompt.slice(0, 80)}"`);

    // ── Pass 1: Extract intent from raw NL ──
    const intent = await extractFilterIntent(nlPrompt, engine);
    onIntentParsed?.(intent);
    console.log(`[FILTER] Intent parsed (confidence: ${intent.parseConfidence}) — category: ${intent.studentLifeCategory || "any"}, topics: [${intent.topics.join(", ")}]`);

    // ── Pre-screen: Quick local keyword filter ──
    const candidates = localPreScreen(mails, intent, nlPrompt);
    const skipped = mails.filter(m => !candidates.find(c => c.uid === m.uid));
    console.log(`[FILTER] Pre-screen: ${candidates.length}/${mails.length} candidates, ${skipped.length} eliminated`);

    // Skipped mails are immediately marked irrelevant
    const results: FilterResult[] = skipped.map(m => ({
        uid: m.uid,
        relevant: false,
        reason: "Eliminated by local keyword pre-screen",
        confidence: 0,
        matchedTopics: [],
        category: "general" as StudentLifeCategory,
        extractedDate: null,
        urgencyScore: 0,
    }));

    // ── Pass 2: Classify remaining candidates via LLM ──
    // With 3 dedicated Groq mail keys we can push higher throughput
    const batchSize = engine === "groq-mail-pool" ? 12 : 6;
    const concurrency = engine === "groq-mail-pool" ? 6 : engine === "local" ? 1 : 2;

    const batches: typeof candidates[] = [];
    for (let i = 0; i < candidates.length; i += batchSize) {
        batches.push(candidates.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency);
        const batchPromises = chunk.map(async (batch) => {
            try {
                return await classifyBatch(batch, intent, nlPrompt, engine);
            } catch (err) {
                console.warn("[FILTER] Batch classify failed, retrying once...", err);
                try {
                    return await classifyBatch(batch, intent, nlPrompt, engine);
                } catch (retryErr) {
                    console.error("[FILTER] Batch classify retry failed", retryErr);
                    // Return unclassified fallback for the failed batch
                    return batch.map(m => ({
                        uid: m.uid,
                        relevant: false,
                        reason: "Classification failed — LLM error",
                        confidence: 0,
                        matchedTopics: [] as string[],
                        category: "general" as StudentLifeCategory,
                        extractedDate: null,
                        urgencyScore: 0,
                    }));
                }
            }
        });
        const chunkResults = await Promise.all(batchPromises);
        for (const batchResults of chunkResults) {
            results.push(...batchResults);
            const done = results.length;
            onProgress?.(Math.min(done, mails.length), mails.length, batchResults);
        }
    }

    // ── Pass 3: Enrichment on borderline results ──
    const enrichedResults = await enrichResults(mails, results, intent, engine);

    // ── Post-LLM: Apply date/time filters ──
    const finalResults = applyDateFilters(enrichedResults, mails, intent);

    // Sort by urgency (highest first) for deadline-focused queries
    if (intent.deadlineFocus) {
        finalResults.sort((a, b) => {
            if (a.relevant && !b.relevant) return -1;
            if (!a.relevant && b.relevant) return 1;
            return b.urgencyScore - a.urgencyScore;
        });
    }

    const relevantCount = finalResults.filter(r => r.relevant).length;
    console.log(`[FILTER] Complete: ${relevantCount}/${mails.length} relevant (${engine})`);

    return { results: finalResults, intent };
}

function emptyIntent(): FilterIntent {
    return {
        parsedQuery: "",
        topics: [],
        senderHints: [],
        timeHint: null,
        dateRange: null,
        timeOfDay: null,
        urgencyBias: null,
        studentLifeCategory: null,
        deadlineFocus: false,
        intentType: null,
        includeKeywords: [],
        excludeKeywords: [],
        parseConfidence: 0,
        sentimentBias: null,
    };
}
