// ===================================================================
// Life Ops Ingestion Pipeline — The Sentinel & The Clerk
//
// ██  SENTINEL: Fast classifier (Groq llama-3.1-8b-instant ~200ms) ██
// ██  CLERK:    Precise extractor (Groq llama-3.3-70b-versatile)   ██
//
// Pipeline: Raw message → Sentinel (filter) → Clerk (extract) → DB
//
// Both agents are server-side only (called from /api/ingest).
// They use Groq directly (no client LLMEngine proxy needed).
// ===================================================================

import { extractJson } from "@/lib/ai/llm-engine";
import { serverDb } from "@/lib/server-db";
import { channelSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Groq Config ─────────────────────────────────────────────────
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Sentinel: 8B model — ultra-fast binary classification (<300ms)
const SENTINEL_MODEL = "llama-3.1-8b-instant";

// Clerk: 70B model — precise structured extraction (1-2s)
const CLERK_MODEL = "llama-3.3-70b-versatile";

// ─── Three-Body Key Mapping ──────────────────────────────────────
// Alpha (GROQ_API_KEY / NANOBOT1): Fast 8B → Sentinel
// Beta  (GROQ_NANOBOT_KEY / NANOBOT2): Powerful 70B → Clerk

function getAlphaKey(): string {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("No GROQ_API_KEY (Alpha/NANOBOT1) for Sentinel agent");
    return key;
}

function getBetaKey(): string {
    const key = process.env.GROQ_NANOBOT_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("No GROQ_NANOBOT_KEY (Beta/NANOBOT2) for Clerk agent");
    return key;
}

// ─── Server-side Groq Chat (direct API, no client proxy) ────────

async function groqChat(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    opts: { model: string; temperature?: number; max_tokens?: number }
): Promise<string> {
    // Use the right key based on model size: 8B → Alpha key, 70B → Beta key
    const apiKey = opts.model === SENTINEL_MODEL ? getAlphaKey() : getBetaKey();

    const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: opts.model,
            messages,
            temperature: opts.temperature ?? 0.1,
            max_tokens: opts.max_tokens ?? 2048,
            response_format: { type: "json_object" },
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq ${opts.model} error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
}

// ─── Types ───────────────────────────────────────────────────────

export interface ClassificationResult {
    isRelevant: boolean;
    category:
        | "exam"
        | "assignment"
        | "hackathon"
        | "workshop"
        | "contest"
        | "internship"
        | "social"
        | "noise";
    confidence: number; // 0-100
    reasoning: string;
}

export interface ExtractionResult {
    title: string;
    description: string;
    eventDate: string | null; // ISO 8601
    deadline: string | null; // ISO 8601
    location: string | null;
    url: string | null;
    priority: number; // 1-5
    tags: string[];
}

// ─── The Sentinel (Classification Agent) ─────────────────────────
//
// A fast agent that scans every incoming message and decides:
//   • Is this noise?
//   • Is it an official academic notice?
//   • Is it a hackathon / internship / workshop?
//
// Channel-aware thresholds:
//   • academic_official → low bar (capture everything academic)
//   • career           → capture opportunities only
//   • social/unknown   → high bar (only explicit events with links)
// ─────────────────────────────────────────────────────────────────

export async function classifyMessage(
    text: string,
    channelType?: string | null,
    channelName?: string | null
): Promise<ClassificationResult> {
    const isOfficial = channelType === "academic_official";
    const isCareer = channelType === "career";
    const isAcademic = channelType === "academic_unofficial";

    let thresholdGuidance: string;
    if (isOfficial) {
        thresholdGuidance =
            "This message is from an OFFICIAL academic channel. " +
            "Treat EVERYTHING as relevant — exams, assignments, admin notices, schedule changes. " +
            "Only mark pure social chatter (food plans, jokes) as noise. " +
            "Set confidence >= 60 for any academic content.";
    } else if (isCareer) {
        thresholdGuidance =
            "This is a CAREER-focused channel. " +
            "Capture: hackathons, internships, job posts, workshops, coding contests, career fairs. " +
            "Ignore: casual conversation, memes, off-topic messages.";
    } else if (isAcademic) {
        thresholdGuidance =
            "This is an unofficial academic/study group. " +
            "Capture: study sessions, exam reminders, assignment deadlines, group project meetings. " +
            "Ignore: casual chatter, memes, food plans.";
    } else {
        thresholdGuidance =
            "This is a general/uncategorized group. Apply STRICT filtering. " +
            "ONLY capture highly specific, actionable opportunities: " +
            "hackathons with registration links, internship postings with deadlines, " +
            "contest announcements, workshop signups. " +
            "Ignore: casual messages, questions, memes, food plans, general discussion.";
    }

    const raw = await groqChat(
        [
            {
                role: "system",
                content: `You are The Sentinel — a fast message classifier for a student life management system.
Your job: determine if an incoming message contains an actionable event or opportunity.

Channel: ${channelName ? `"${channelName}"` : "Unknown group"} (type: ${channelType || "uncategorized"})

${thresholdGuidance}

Respond with ONLY valid JSON:
{
  "isRelevant": boolean,
  "category": "exam" | "assignment" | "hackathon" | "workshop" | "contest" | "internship" | "social" | "noise",
  "confidence": 0-100,
  "reasoning": "one sentence why"
}`,
            },
            { role: "user", content: text },
        ],
        { model: SENTINEL_MODEL, temperature: 0.05, max_tokens: 256 }
    );

    try {
        return extractJson<ClassificationResult>(raw);
    } catch {
        // Fail-safe: JSON parse failure → mark as noise (don't pollute calendar)
        console.warn("[Sentinel] JSON parse failed, defaulting to noise:", raw.substring(0, 200));
        return {
            isRelevant: false,
            category: "noise",
            confidence: 0,
            reasoning: "Sentinel JSON parse failure — treated as noise",
        };
    }
}

// ─── The Clerk (Extraction Agent) ────────────────────────────────
//
// A precise agent that takes a RELEVANT message and extracts:
//   • Title, Description
//   • Event Date (ISO 8601, resolved from relative dates)
//   • Registration Deadline
//   • Location / URL
//   • Priority (1-5)
//   • Tags for filtering
// ─────────────────────────────────────────────────────────────────

export async function extractEventDetails(
    text: string,
    category: string,
    referenceDate?: string
): Promise<ExtractionResult> {
    const today = referenceDate || new Date().toISOString().split("T")[0];

    const raw = await groqChat(
        [
            {
                role: "system",
                content: `You are The Clerk — a precise data extraction agent for a student life management system.
Given a message classified as "${category}", extract ALL structured event details.

Today's date: ${today}. Use this to resolve relative dates ("next Saturday", "this Friday", "in 2 weeks").

Rules:
- Dates MUST be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS). NEVER return "Saturday" or "next week".
- If no specific date can be determined, return null.
- Priority scale: 1 (low/optional) → 3 (normal) → 5 (urgent/deadline-within-48h).
- Extract ALL URLs from the text.
- Tags: relevant keywords for filtering (e.g. ["AI", "hackathon", "beginner-friendly", "free"]).

Respond with ONLY valid JSON:
{
  "title": "short event title (max 80 chars)",
  "description": "1-2 sentence summary",
  "eventDate": "YYYY-MM-DD" or null,
  "deadline": "YYYY-MM-DD" or null,
  "location": "venue or Virtual" or null,
  "url": "primary registration/info link" or null,
  "priority": 1-5,
  "tags": ["tag1", "tag2"]
}`,
            },
            { role: "user", content: text },
        ],
        { model: CLERK_MODEL, temperature: 0.1, max_tokens: 512 }
    );

    try {
        return extractJson<ExtractionResult>(raw);
    } catch {
        // Graceful fallback: extract what we can manually
        console.warn("[Clerk] JSON parse failed, using manual fallback:", raw.substring(0, 200));
        const urlMatch = text.match(/(https?:\/\/[^\s<>"')\]]+)/i);
        return {
            title: text.substring(0, 80).replace(/\n/g, " ").trim() + (text.length > 80 ? "…" : ""),
            description: text.substring(0, 200).replace(/\n/g, " ").trim(),
            eventDate: null,
            deadline: null,
            location: null,
            url: urlMatch?.[0] || null,
            priority: 3,
            tags: [],
        };
    }
}

// ─── Channel Resolution ──────────────────────────────────────────
//
// Looks up a group name in channel_settings.
// If it doesn't exist, auto-creates it as 'uncategorized'.
// If the channel is paused (is_active = false), returns null.
// ─────────────────────────────────────────────────────────────────

export async function resolveChannel(
    groupName: string | null,
    platform: string
): Promise<{ id: string; type: string; name: string } | null> {
    if (!groupName) return null;

    const sourceId = `${platform}:${groupName}`;

    // Lookup existing channel
    const existing = await serverDb
        .select()
        .from(channelSettings)
        .where(eq(channelSettings.sourceId, sourceId))
        .limit(1);

    if (existing.length > 0) {
        const ch = existing[0];
        if (!ch.isActive) return null; // Channel is paused by user
        return { id: ch.id, type: ch.type, name: ch.name };
    }

    // Auto-create as uncategorized (user can retag via UI later)
    const [created] = await serverDb
        .insert(channelSettings)
        .values({
            sourceId,
            name: groupName,
            type: "uncategorized",
            platform,
            isActive: true,
        })
        .returning();

    console.log(`[Channel] Auto-created "${groupName}" as uncategorized (${sourceId})`);
    return { id: created.id, type: created.type, name: created.name };
}
