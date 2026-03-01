
import { serverDb } from "@/lib/server-db";
import { events } from "@/db/schema";

async function main() {
    const result = await serverDb.select().from(events);
    console.log(`📊 Total Events in DB: ${result.length}`);
    if (result.length > 0) {
        console.log("Last Event:", result[result.length - 1]);
    }
}

main();
