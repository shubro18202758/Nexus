import "dotenv/config";
import { serverDb } from "@/lib/server-db";
import { students } from "@/db/schema";
import { processBatch } from "@/app/actions/process-batch"; // Import but don't use

async function run() {
    console.log("🔍 Debugging DB with processBatch import...");
    try {
        const res = await serverDb.select().from(students);
        console.log("✅ Success! Found students:", res.length);
    } catch (e) {
        console.error("❌ Failed:", e);
    }
}

run();
