"use server";

import { serverDb } from "@/lib/server-db";
import { events, students } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fillForm, type FormContext } from "@/lib/agent/auto-filler";

export async function updateEventStatus(eventId: string, status: "Detected" | "Queued" | "Applied" | "Processing" | "Failed") {
    try {
        await serverDb.update(events)
            .set({ status: status })
            .where(eq(events.id, eventId));
        return { success: true };
    } catch (error) {
        console.error("❌ Failed to update status:", error);
        return { success: false, message: String(error) };
    }
}


export async function registerForEvent(eventId: string, instructions?: string, mode: 'submit' | 'review' = 'submit') {
    console.log(`🚀 Starting Auto-Registration for Event ID: ${eventId} (Mode: ${mode})`);

    try {
        // 1. Fetch Event
        const event = await serverDb.query.events.findFirst({
            where: eq(events.id, eventId),
        });

        if (!event || !event.url) {
            throw new Error("Event not found or missing URL.");
        }

        // 2. Fetch User Profile
        const student = await serverDb.query.students.findFirst();
        if (!student) {
            throw new Error("Student profile not found. Please seed the database.");
        }

        // Update Status to Processing (unless review, maybe keep it as is or show visual indicator?)
        // Let's keep it optimistic but maybe not persist if just review?
        // Actually, for better UX, let's NOT update status in DB for review mode, just return result.

        if (mode === 'submit') {
            await serverDb.update(events)
                .set({ status: "Processing" })
                .where(eq(events.id, eventId));
        }

        // 3. Prepare Context for Stagehand
        const defaultInstructions = "Look for a 'Register', 'Get Tickets', or 'Sign Up' button. Select the free ticket option if available.";
        const context: FormContext = {
            student: student,
            additionalInstructions: instructions || defaultInstructions,
            dryRun: mode === 'review' // Pass dryRun based on mode
        };

        // 4. Run Stagehand Agent
        console.log(`🤖 Stagehand navigating to: ${event.url}`);
        const result = await fillForm(event.url, context);

        // 5. Handle Result based on Mode
        if (mode === 'review') {
            // In review mode, we return success if it ran without crashing, regardless of "submission" since it's dry run.
            // But fillForm returns success=true for dry run usually.
            // We need to pass the screenshot back.
            return {
                success: result.success,
                message: result.summary || "Review completed.",
                screenshot: result.screenshotBase64
            };
        }

        // --- SUBMIT MODE ONLY BELOW ---

        // 5. Build Result Message
        let resultMessage = "";
        let newStatus: "Applied" | "Failed" = "Failed";

        if (result.success) {
            newStatus = "Applied";
            resultMessage = `Success! ${result.summary || "Registration completed."}`;
        } else {
            resultMessage = `Failed: ${result.error || "Unknown error."}`;
        }

        // 6. Update DB
        await serverDb.update(events)
            .set({ status: newStatus })
            .where(eq(events.id, eventId));

        return { success: result.success, message: resultMessage };

    } catch (error) {
        console.error("❌ Registration Error:", error);

        if (mode === 'submit') {
            // Update DB to Failed
            await serverDb.update(events)
                .set({ status: "Failed" })
                .where(eq(events.id, eventId));
        }

        return { success: false, message: String(error) };
    }
}
