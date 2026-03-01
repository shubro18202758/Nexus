// ===================================================================
// WhatsApp NanoClaw Filter API — AI-powered message classification
//
// POST /api/whatsapp/filter → Run NanoClaw 5-pass filter on messages
//
// Pipeline: Intent → Classify → Detect Events → Enrich → Plan
// Uses the dedicated MSG 6-key Groq pool (groq-msg-pool.ts)
// ===================================================================

import { NextResponse } from "next/server";
import { getWASession } from "@/lib/msg/wa-session";
import {
    classifyMessagesWithNL,
    type MsgFilterResult,
} from "@/lib/msg/msg-filter-engine";

export const dynamic = "force-dynamic";

/** POST — Run NanoClaw AI filter on WhatsApp messages */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { prompt, chatId, since, limit, messages: externalMessages } = body;

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json(
                { error: "Provide a 'prompt' string for NL filtering" },
                { status: 400 },
            );
        }

        // Get messages from session buffer or use externally provided ones
        let messages;
        if (externalMessages && Array.isArray(externalMessages)) {
            messages = externalMessages;
        } else {
            const session = getWASession();
            // 24h threshold is enforced automatically by getMessages()
            messages = session.getMessages({
                chatId: chatId || undefined,
                since: since ? Number(since) : undefined,
                limit: limit ? Number(limit) : 200,
            });
        }

        if (messages.length === 0) {
            return NextResponse.json({
                results: [],
                intent: null,
                detectedEvents: [],
                info: "No messages to filter. Connect WhatsApp and wait for messages.",
            });
        }

        // Run NanoClaw 5-pass filter
        const { results, intent, detectedEvents } =
            await classifyMessagesWithNL(messages, prompt);

        return NextResponse.json({
            results,
            intent,
            detectedEvents,
            totalProcessed: messages.length,
            relevantCount: results.filter((r: MsgFilterResult) => r.relevant).length,
            eventsDetected: detectedEvents.length,
            // Return source messages so client can display them even if it hasn't fetched
            sourceMessages: messages,
        });
    } catch (error) {
        console.error("[NanoClaw Filter] Error:", error);
        return NextResponse.json(
            { error: "NanoClaw filter failed", details: String(error) },
            { status: 500 },
        );
    }
}
