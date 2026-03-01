"use server";

import { serverDb } from "@/lib/server-db";
import { events } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { fillForm } from "@/lib/agent/auto-filler";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Helper to parse natural language command into specific instructions
async function parseCommandIntent(command: string): Promise<string> {
    if (!command.trim()) return "";

    try {
        const prompt = `
    You are an intent parser. The user gave this command for filling forms: "${command}".
    Extract any specific instructions about:
    1. Which team or teammates to use.
    2. Any specific role or email to use.
    3. Any other constraints.
    
    Return a concise summary of these instructions to be appended to a system prompt.
    `;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("Intent Parsing Error:", error);
        return command; // Fallback to raw command
    }
}

export async function processBatch(eventIds: string[], command: string) {
    if (!eventIds.length) return { success: false, error: "No events selected" };

    console.log(`📦 Processing Batch of ${eventIds.length} events. Command: "${command}"`);

    // 1. Parse Intent
    const context = await parseCommandIntent(command);
    console.log("🧠 Parsed Context:", context);

    // 2. Update Status to Processing
    await serverDb
        .update(events)
        .set({ status: "Processing" } as any) // Type assertion due to schema update lag
        .where(inArray(events.id, eventIds));

    // 3. Process in Background (Fire and Forget pattern for Server Actions is tricky, 
    // we will await for this prototype to ensure completion before returning, 
    // or use setImmediate to unblock response if it was a real long-running job.
    // Given user wants "Real-time progress bar", we should probably return a stream or 
    // just let the client poll. We will just run it.

    // validation: We need to loop.
    // We'll run them sequentially to avoid opening 10 browsers at once.

    // NOTE: In a real Next.js server capability, we might hit timeout. 
    // For 'local', we are fine.

    (async () => {
        for (const id of eventIds) {
            try {
                const [event] = await serverDb.select().from(events).where(eq(events.id, id));
                if (!event || !event.url) continue;

                console.log(`▶️ Agent Starting for Event: ${event.id}`);

                // Execute Agent
                await fillForm(event.url, { dryRun: false, additionalInstructions: context });

                // Update to Applied
                await serverDb
                    .update(events)
                    .set({ status: "Applied" } as any)
                    .where(eq(events.id, id));

            } catch (error) {
                console.error(`❌ Agent Failed for Event ${id}:`, error);
                await serverDb
                    .update(events)
                    .set({ status: "Failed" } as any)
                    .where(eq(events.id, id));
            }
        }
    })();

    return { success: true, message: "Batch processing started" };
}
