import { serverDb } from "@/lib/server-db";
import { events } from "@/db/schema";
import { desc } from "drizzle-orm";

async function checkEvents() {
    console.log("🔍 Checking Events Table...");
    try {
        const allEvents = await serverDb.select().from(events).orderBy(desc(events.createdAt)).limit(5);
        console.log(`Found ${allEvents.length} events:`);
        allEvents.forEach(e => {
            console.log(`- [${e.source}] ${e.status}: ${e.url ? e.url : "No URL"} (${e.rawContext.substring(0, 30)}...)`);
        });
    } catch (e) {
        console.error("Failed to query DB:", e);
    }
}

checkEvents();
