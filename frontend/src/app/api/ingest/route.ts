// ===================================================================
// /api/ingest — Life Ops Multi-Agent Ingestion Pipeline
//
// Flow: Raw Message → Channel Resolution → Sentinel → Clerk → DB
//
// The Sentinel (fast 8B) decides if a message matters.
// The Clerk (precise 70B) extracts structured data from what matters.
// Everything else is discarded as noise.
// ===================================================================

import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";
import { events, opportunities } from "@/db/schema";
import {
    classifyMessage,
    extractEventDetails,
    resolveChannel,
} from "@/lib/agents/ingestion-agent";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { content, text, url, source, metadata } = body;
        const messageContent = content || text || "";
        const groupName = metadata?.groupName || null;
        const platform = source || "WhatsApp";

        console.log(
            `\n📥 [Ingest] Received from ${platform}${groupName ? ` / ${groupName}` : ""}`
        );
        console.log(
            `   Content: ${messageContent.substring(0, 120)}${messageContent.length > 120 ? "…" : ""}`
        );

        if (!messageContent.trim()) {
            return NextResponse.json({
                status: "discarded",
                reason: "empty message",
            });
        }

        // ── Step 1: Resolve channel ──────────────────────────────
        const channel = await resolveChannel(groupName, platform);
        if (channel === null && groupName) {
            // Channel exists but user has paused it
            console.log(`   ⏸️ Channel "${groupName}" is paused, skipping`);
            return NextResponse.json({
                status: "skipped",
                reason: "channel paused",
            });
        }
        console.log(
            `   📡 Channel: ${channel?.name || "Direct message"} (${channel?.type || "none"})`
        );

        // ── Step 2: The Sentinel — classify ──────────────────────
        const classification = await classifyMessage(
            messageContent,
            channel?.type,
            channel?.name
        );

        console.log(
            `   🛡️ Sentinel: ${classification.category} ` +
                `(confidence: ${classification.confidence}, relevant: ${classification.isRelevant})`
        );
        console.log(`   💭 ${classification.reasoning}`);

        if (!classification.isRelevant) {
            console.log(`   🗑️ Discarded as ${classification.category}`);
            return NextResponse.json({
                status: "discarded",
                category: classification.category,
                confidence: classification.confidence,
                reasoning: classification.reasoning,
            });
        }

        // ── Step 3: The Clerk — extract ──────────────────────────
        const referenceDate = metadata?.timestamp
            ? new Date(metadata.timestamp).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

        const details = await extractEventDetails(
            messageContent,
            classification.category,
            referenceDate
        );

        console.log(
            `   📋 Clerk: "${details.title}" | Date: ${details.eventDate || "TBD"} | Priority: ${details.priority}`
        );

        // ── Step 4: Save to events table ─────────────────────────
        const safeDate = (d: string | null): Date | null => {
            if (!d) return null;
            const parsed = new Date(d);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const [saved] = await serverDb
            .insert(events)
            .values({
                source: platform as "WhatsApp" | "Telegram",
                channelId: channel?.id || null,
                category: classification.category as
                    | "exam"
                    | "assignment"
                    | "hackathon"
                    | "workshop"
                    | "contest"
                    | "internship"
                    | "social"
                    | "noise",
                title: details.title || "Untitled Event",
                description: details.description,
                eventDate: safeDate(details.eventDate),
                deadline: safeDate(details.deadline),
                location: details.location,
                url: details.url || url || null,
                rawContext: messageContent,
                metadata: {
                    ...metadata,
                    tags: details.tags,
                    sentinelConfidence: classification.confidence,
                    sentinelReasoning: classification.reasoning,
                },
                status: "Detected",
                priority: details.priority,
            })
            .returning();

        // ── Backward compat: also save to opportunities table ────
        const eventUrl = details.url || url;
        if (eventUrl) {
            try {
                await serverDb
                    .insert(opportunities)
                    .values({
                        url: eventUrl,
                        source: platform,
                        content: messageContent,
                        aiSummary: `${details.title}: ${details.description}`,
                        relevanceScore: classification.confidence,
                        eventType: classification.category,
                        status: "pending",
                    })
                    .onConflictDoNothing();
            } catch {
                // Non-critical — don't fail the pipeline for legacy table
            }
        }

        console.log(`   ✅ Event saved: ${saved.id} (${classification.category})`);

        return NextResponse.json({
            status: "saved",
            eventId: saved.id,
            category: classification.category,
            confidence: classification.confidence,
            title: details.title,
            priority: details.priority,
        });
    } catch (error) {
        console.error("❌ [Ingest] Pipeline error:", error);
        return NextResponse.json(
            { error: "Ingestion pipeline failed", details: String(error) },
            { status: 500 }
        );
    }
}
