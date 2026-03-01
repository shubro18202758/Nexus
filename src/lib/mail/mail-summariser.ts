// ===================================================================
// Mail Summariser v2 — Deep Email Intelligence via LOCAL DeepSeek R1 8B
//
// Routes through LLMEngine CEO (DeepSeek R1 8B) on user's GPU.
// NO API LIMITS — unlimited, deep, context-aware summarisation.
//
// Designed for SELECTIVE summarisation:
//   - User picks N mails → each gets a thorough, grounded summary
//   - Anti-hallucination enforcement: ONLY states facts from the email
//   - Student-context-aware: Understands university/academic relevance
//   - Rich structured output with categories, sentiment, follow-ups
// ===================================================================

import { LLMEngine, extractJson } from "@/lib/ai/llm-engine";

export interface MailSummary {
    uid: number;
    title: string;
    oneLiner: string;
    keyPoints: string[];
    actionRequired: boolean;
    priority: "low" | "medium" | "high";
    deadline?: string;
    senderContext?: string;
    /** Category for visual grouping */
    category: "academic" | "administrative" | "opportunity" | "social" | "financial" | "technical" | "newsletter" | "personal" | "other";
    /** Suggested follow-up actions */
    followUps: string[];
    /** Key entities extracted (names, dates, links, org names) */
    entities: string[];
    /** Sentiment of the email */
    sentiment: "positive" | "neutral" | "negative" | "urgent";
}

/**
 * Summarise a set of mails using the local DeepSeek R1 8B model.
 *
 * @param mails - Array of mails to summarise (can be all or selective)
 * @param onProgress - Progress callback with done/total + partial results
 *
 * Runs entirely on GPU — no API limits. Processes in batches of 2
 * for the deepest, most thorough analysis per mail.
 */
export async function summariseMails(
    mails: { uid: number; from: string; subject: string; body: string; date: string }[],
    onProgress?: (done: number, total: number, partialResults?: MailSummary[]) => void,
    /** Cancellation signal — set .cancelled = true to stop between batches */
    cancelSignal?: { cancelled: boolean },
): Promise<MailSummary[]> {
    if (mails.length === 0) return [];

    const engine = LLMEngine.getInstance();
    const results: MailSummary[] = [];
    // Batch of 2 for maximum depth — local model has unlimited calls
    const batchSize = 2;

    for (let i = 0; i < mails.length; i += batchSize) {
        // Check cancellation between batches (e.g., user started NL filter)
        if (cancelSignal?.cancelled) {
            console.log(`[SUMMARISER] Cancelled after ${results.length} mails — yielding to higher-priority task`);
            break;
        }
        const batch = mails.slice(i, i + batchSize);
        const batchResults = await summariseBatch(engine, batch);
        results.push(...batchResults);
        onProgress?.(Math.min(i + batchSize, mails.length), mails.length, batchResults);
    }

    return results;
}

async function summariseBatch(
    engine: LLMEngine,
    batch: { uid: number; from: string; subject: string; body: string; date: string }[]
): Promise<MailSummary[]> {
    const mailList = batch.map((m, i) => {
        // Send generous body text — local model has no token cost
        const body = m.body.substring(0, 3000).replace(/\n{3,}/g, "\n\n");
        return `=== EMAIL ${i} (UID:${m.uid}) ===
FROM: ${m.from}
SUBJECT: ${m.subject}
DATE: ${m.date}
BODY:
${body}
=== END EMAIL ${i} ===`;
    }).join("\n\n");

    const systemPrompt = `You are a meticulous email intelligence analyst for a university student. Your job is to create precise, deeply grounded summaries that extract MAXIMUM intelligence from each email.

████ STRICT GROUNDING RULES (CRITICAL — ZERO TOLERANCE) ████
- ONLY include information EXPLICITLY stated in the email text
- NEVER fabricate, infer, or assume information not present
- If no deadline is mentioned, set deadline to null
- If the purpose is unclear, say "Purpose unclear from email content"
- Use EXACT names, dates, numbers, and links from the email
- If you are unsure about something, DO NOT include it
- Never add details that "seem likely" — only state what IS written

OUTPUT FORMAT — respond with ONLY a valid JSON array:
[
  {
    "index": 0,
    "title": "Short descriptive title (<8 words)",
    "oneLiner": "One sentence: what this email says and why it matters to the student",
    "keyPoints": [
      "Specific detail 1 — exact info from email (names, dates, numbers)",
      "Specific detail 2 — what is being asked or announced",
      "Specific detail 3 — action needed with deadline if stated",
      "Specific detail 4 — important links, attachments, or references mentioned"
    ],
    "actionRequired": true,
    "priority": "high",
    "deadline": "March 15, 2026" or null,
    "senderContext": "Who sent this and their role/relevance to the student",
    "category": "academic",
    "followUps": ["Reply by March 10", "Fill out attached form"],
    "entities": ["Prof. Smith", "CS301", "March 15", "registration-form.pdf"],
    "sentiment": "urgent"
  }
]

PRIORITY GUIDELINES:
- "high": Deadlines ≤ 7 days, financial/grade matters, urgent action, exam-related
- "medium": Important but not urgent — course updates, events, opportunities with distant deadlines
- "low": Newsletters, marketing, routine notifications, informational only

CATEGORY GUIDELINES:
- "academic": Courses, grades, exams, assignments, professors, TAs
- "administrative": Registration, ID cards, hostel, official notices
- "opportunity": Internships, hackathons, competitions, scholarships, jobs
- "financial": Fees, scholarships, stipends, payments, refunds
- "social": Club events, social gatherings, personal invitations
- "technical": IT support, system access, software, lab resources
- "newsletter": Regular bulletins, digests, marketing blasts
- "personal": Direct personal correspondence
- "other": Anything that doesn't fit above

SENTIMENT:
- "urgent": Contains time pressure, warning language, or immediate action needed
- "negative": Bad news, rejections, warnings, complaints
- "positive": Good news, acceptances, congratulations, opportunities
- "neutral": Informational, routine, no strong sentiment

QUALITY STANDARDS:
- keyPoints: 2-5 bullets with SPECIFIC extracted information (not generic)
- oneLiner: Must convey WHY this matters to the student, not just paraphrase the subject
- title: Must be unique and descriptive (never generic like "Email Update")
- followUps: Concrete actions the student should take (empty array if none)
- entities: Key names, dates, course codes, file names mentioned (empty array if none)
- senderContext: Help the student understand who this person/org is

CRITICAL: Output ONLY the JSON array. No markdown, no explanation, no preamble.`;

    const userPrompt = `Analyse each email thoroughly. Extract ALL intelligence for the student. Be factual — no hallucinations.

${mailList}

Provide deeply grounded, comprehensive summaries. JSON array only:`;

    try {
        const raw = await engine.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                mode: "local",
                temperature: 0.1, // Lowest viable temp for maximum factual grounding
                max_tokens: 4096,
                json_mode: true,
            }
        );

        const parsed = extractJson<{
            index: number; title: string; oneLiner: string;
            keyPoints: string[]; actionRequired: boolean;
            priority: "low" | "medium" | "high";
            deadline?: string | null; senderContext?: string;
            category?: string; followUps?: string[];
            entities?: string[]; sentiment?: string;
        }[]>(raw);

        return batch.map((m, i) => {
            const match = parsed.find(p => p.index === i);
            if (!match) return fallbackSummary(m);

            const validCategories = ["academic", "administrative", "opportunity", "social", "financial", "technical", "newsletter", "personal", "other"] as const;
            const validSentiments = ["positive", "neutral", "negative", "urgent"] as const;

            return {
                uid: m.uid,
                title: match.title || m.subject.substring(0, 50),
                oneLiner: match.oneLiner || "Summary unavailable",
                keyPoints: (match.keyPoints || []).filter(Boolean).slice(0, 5),
                actionRequired: match.actionRequired || false,
                priority: match.priority || "low",
                deadline: match.deadline || undefined,
                senderContext: match.senderContext || undefined,
                category: (validCategories.includes(match.category as any) ? match.category : "other") as MailSummary["category"],
                followUps: Array.isArray(match.followUps) ? match.followUps.filter(Boolean) : [],
                entities: Array.isArray(match.entities) ? match.entities.filter(Boolean) : [],
                sentiment: (validSentiments.includes(match.sentiment as any) ? match.sentiment : "neutral") as MailSummary["sentiment"],
            };
        });
    } catch (err) {
        console.error("[MAIL SUMMARISER] Local LLM error:", err);
        return batch.map(m => fallbackSummary(m));
    }
}

function fallbackSummary(m: { uid: number; subject: string; body: string }): MailSummary {
    return {
        uid: m.uid,
        title: m.subject.substring(0, 50) || "Untitled Email",
        oneLiner: m.body.substring(0, 200).replace(/\s+/g, " ").trim() || "No content available",
        keyPoints: [],
        actionRequired: false,
        priority: "low",
        category: "other",
        followUps: [],
        entities: [],
        sentiment: "neutral",
    };
}
