"use server";

import { analyzeForm as analyze } from "@/lib/agent/form-analyzer";
import { Stagehand } from "@/lib/agent/simple-stagehand";

export async function analyzeForm(url: string) {
    const stagehand = new Stagehand({
        env: "LOCAL",
        enableVision: true,
        verbose: 1,
    });

    try {
        await stagehand.init();
        const result = await analyze(stagehand, url);
        return { success: true, data: result };
    } catch (error) {
        console.error("Server Action Error:", error);
        return { success: false, error: String(error) };
    } finally {
        await stagehand.close();
    }
}
