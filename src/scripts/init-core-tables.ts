import { PGlite } from "@electric-sql/pglite";
import path from "path";

async function initCore() {
    const dbPath = path.resolve(process.cwd(), "nexus-server-db");
    const client = new PGlite(dbPath);
    console.log("🛠️ Initializing Core Tables...");

    try {
        await client.exec(`
            CREATE TABLE IF NOT EXISTS "workspaces" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "name" text NOT NULL,
                "icon" text,
                "created_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "learning_profiles" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
                "level" text,
                "primary_domains" jsonb,
                "secondary_domains" jsonb,
                "weak_concepts" jsonb,
                "strong_concepts" jsonb,
                "learning_style" text,
                "goal_type" text,
                "confidence_score" integer,
                "last_analyzed" timestamp DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS "learning_roadmaps" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
                "domain" text NOT NULL,
                "roadmap_data" jsonb NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL
            );

            CREATE TABLE IF NOT EXISTS "students" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                "name" text NOT NULL,
                "email" text NOT NULL,
                "phone" text,
                "links" jsonb,
                "university" text,
                "major" text,
                "gpa" text,
                "student_id" text,
                "transcript" text,
                "demographics" jsonb,
                "created_at" timestamp DEFAULT now() NOT NULL
            );

            -- Seed Workspace
            INSERT INTO "workspaces" ("id", "name") 
            VALUES ('00000000-0000-0000-0000-000000000000', 'Default Workspace')
            ON CONFLICT ("id") DO NOTHING;

            -- Seed Student
            INSERT INTO "students" ("name", "email", "university", "major", "gpa", "transcript", "links")
            VALUES (
                'Alex Chen', 
                'alex@stanford.edu', 
                'Stanford University', 
                'Computer Science', 
                '3.9', 
                'Completed CS106A, CS106B, CS107. Interested in AI and Distributed Systems.',
                '{"github": "https://github.com/alexc", "linkedin": "https://linkedin.com/in/alexc"}'
            );
            
        `);
        console.log("✅ Core Tables created and seeded!");
        console.log("✅ Initialization complete.");
    } catch (e) {
        // console.error("Error:", e); 
        // Ignore "relation already exists" errors if handled by IF NOT EXISTS, 
        // but PGlite might throw on other things.
        if (String(e).includes("already exists")) {
            console.log("⚠️ Tables might already exist, proceeding...");
        } else {
            console.error("❌ Error initializing core:", e);
        }
    } finally {
        await client.close();
    }
}

initCore();
