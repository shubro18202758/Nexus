"use server";

import { fillForm } from "@/lib/agent/auto-filler";

/**
 * Server Action to apply to an event (Stagehand + Human-in-the-Loop)
 * 
 * 1. Fetches detailed profile
 * 2. Uses Stagehand to navigate and fill form
 * 3. STOPS before submit
 * 4. Returns screenshot for user confirmation
 */
export async function applyToEvent(eventUrl: string, userIntent: string) {
    try {
        console.log("🤖 Auto-apply initiated for:", eventUrl);
        console.log("🎯 User Intent:", userIntent);

        // Call our Agent Logic
        // dryRun = true forces it to screenshot and create a 'fill plan' WITHOUT clicking submit
        const result = await fillForm(eventUrl, {
            dryRun: true,
            additionalInstructions: userIntent,
        });

        if (!result.success) {
            console.error("❌ Agent failed:", result.error);
            return { error: result.error };
        }

        return {
            success: true,
            message: "Form filled! Please review the screenshot.",
            screenshot: result.screenshotBase64, // Base64 image
            summary: result.summary
        };

    } catch (error) {
        console.error("❌ applyToEvent Error:", error);
        return { error: "Internal Server Error" };
    }
}
