import { PGlite } from "@electric-sql/pglite";
import path from "path";

async function createTable() {
    const dbPath = path.resolve(process.cwd(), "nexus-server-db");
    const client = new PGlite(dbPath);
    console.log("🛠️ Manually creating opportunities table...");
    try {
        await client.exec(`
            DO $$ BEGIN
                CREATE TYPE "opportunity_status" AS ENUM ('pending', 'applied', 'rejected');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;

            CREATE TABLE IF NOT EXISTS "opportunities" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
              "url" text NOT NULL,
              "source" text NOT NULL,
              "content" text,
              "ai_summary" text,
              "relevance_score" integer,
              "event_type" text,
              "status" "opportunity_status" DEFAULT 'pending' NOT NULL,
              "created_at" timestamp DEFAULT now() NOT NULL
            );
        `);
        console.log("✅ Table 'opportunities' created successfully!");
    } catch (e) {
        console.error("❌ Error creating table:", e);
    } finally {
        await client.close();
    }
}

createTable();
