import "dotenv/config"; // Must be first!

import { serverDb } from "@/lib/server-db";
import { events } from "@/db/schema";
import { processBatch } from "@/app/actions/process-batch";
import { eq } from "drizzle-orm";

async function runTest() {
    console.log("🧪 Testing Batch Processor (Simplified)...");

    // 1. Fetch Events
    const detectedEvents = await serverDb.select().from(events);
    const target = detectedEvents.slice(0, 1); // Just 1

    if (target.length === 0) {
        console.log("❌ No events.");
        return;
    }
    const id = target[0].id;
    console.log("Target Event:", id);

    // 2. Process
    try {
        console.log("🚀 Calling processBatch...");
        const res = await processBatch([id], "Use my team.");
        console.log("Result:", res);
    } catch (e) {
        console.error("❌ processBatch threw:", e);
        process.exit(1);
    }

    // 3. Wait 5s for background worker
    console.log("⏳ Waiting 5s for worker...");
    await new Promise(r => setTimeout(r, 5000));

    // 4. Check Status
    const [fresh] = await serverDb.select().from(events).where(eq(events.id, id));
    console.log("Final Status:", fresh.status);

    if (fresh.status === "Applied" || fresh.status === "Failed") {
        console.log("✅ Success (Status Changed)");
    } else {
        console.log("⚠️ Status did not change (Processing took too long?)");
        // Check logs for worker errors
    }
}

runTest();
