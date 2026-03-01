
"use server";

import { exec } from "child_process";
import path from "path";
import util from "util";

const execPromise = util.promisify(exec);

export async function ingestHistory(startDate: Date, endDate: Date) {
    try {
        const scriptPath = path.resolve(process.cwd(), "src/scripts/import-whatsapp-history.ts");
        // We use npx tsx to run the typescript script directly
        const command = `npx tsx "${scriptPath}" --start "${startDate.toISOString()}" --end "${endDate.toISOString()}"`;

        console.log(`🚀 Spawning Import Command: ${command}`);

        // We actully don't want to await the whole thing if it takes long, OR we want to stream output.
        // But for this prototype, let's await it to verify completion.
        // It enters an event loop, so it might not "exit" unless we force it or it finishes.
        // The script DOES process.exit(0) when done.

        const { stdout, stderr } = await execPromise(command, {
            cwd: process.cwd(),
            // env: { ...process.env, ... }
        });

        console.log("📜 Script Output:", stdout);
        if (stderr) console.error("⚠️ Script Errors:", stderr);

        return { success: true, stdout };
    } catch (error) {
        console.error("❌ Failed to spawn import script:", error);
        return { success: false, error: String(error) };
    }
}
