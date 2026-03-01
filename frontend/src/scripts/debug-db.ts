import "dotenv/config";
import { serverDb } from "@/lib/server-db";
import { students } from "@/db/schema";

async function run() {
    console.log("🔍 Debugging DB Connection...");
    try {
        const res = await serverDb.select().from(students);
        console.log("✅ Success! Found students:", res.length);
        console.log(res);
    } catch (e) {
        console.error("❌ Failed:", e);
    }
}

run();
