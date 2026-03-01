import { PGlite } from "@electric-sql/pglite";

async function createTable() {
    const client = new PGlite("./nexus-server-db");
    console.log("🛠️ Manually creating events table...");
    try {
        await client.exec(`
            CREATE TYPE "source" AS ENUM ('WhatsApp', 'Telegram');
            CREATE TYPE "event_status" AS ENUM ('Detected', 'Queued', 'Applied', 'Processing', 'Failed');

            CREATE TABLE IF NOT EXISTS "events" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
              "source" "source" NOT NULL,
              "url" text UNIQUE,
              "raw_context" text NOT NULL,
              "status" "event_status" DEFAULT 'Detected' NOT NULL,
              "priority" integer,
              "created_at" timestamp DEFAULT now() NOT NULL
            );
        `);
        console.log("✅ Table 'events' created successfully!");
    } catch (e) {
        console.error("❌ Error creating table:", e);
    } finally {
        await client.close();
    }
}

createTable();
