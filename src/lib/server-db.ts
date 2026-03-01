import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import path from "node:path";

// Singleton to prevent multiple instances in dev hot-reloading
const globalForDb = globalThis as unknown as {
    conn: PGlite | undefined;
};

// Use a file-based DB for the server functionality so it persists across restarts
// and can be shared between API routes.
const dbPath = path.resolve(process.cwd(), "nexus-server-db");

// NOTE: Vector extension is NOT loaded here.
// PGlite's vector binary bundle fails to resolve under Next.js Turbopack
// (produces `Extension bundle not found: /_next/static/media/vector.tar.*.gz`
//  and path TypeError at query time). No server-db tables use vector columns,
// so this is safe to omit. Re-enable when PGlite ships a Turbopack-compatible
// extension loader.

export const client = globalForDb.conn ?? new PGlite(dbPath);

if (process.env.NODE_ENV !== "production") globalForDb.conn = client;

export const serverDb = drizzle(client, { schema });

// Default student ID for singleton user (V1 local OS)
export const DEFAULT_STUDENT_ID = "10000000-0000-0000-0000-000000000001";

// Create Nexus club tables if they don't exist yet
const globalForNexus = globalThis as unknown as { nexusTablesReady?: boolean };
if (!globalForNexus.nexusTablesReady) {
  globalForNexus.nexusTablesReady = true;
  client.exec(`
    -- ==========================================
    -- Student OS Core Tables (required by server actions)
    -- ==========================================
    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      links JSONB,
      university TEXT,
      major TEXT,
      gpa TEXT,
      student_id TEXT,
      transcript TEXT,
      demographics JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS learning_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      level TEXT,
      primary_domains JSONB,
      secondary_domains JSONB,
      weak_concepts JSONB,
      strong_concepts JSONB,
      learning_style TEXT,
      goal_type TEXT,
      confidence_score INTEGER,
      last_analyzed TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS learning_roadmaps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      roadmap_data JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- Seed default student if none exists
    INSERT INTO students (id, name, email)
    SELECT '${DEFAULT_STUDENT_ID}', 'Nexus User', 'user@nexus.local'
    WHERE NOT EXISTS (SELECT 1 FROM students LIMIT 1);

    -- ==========================================
    -- Nexus Club Tables
    -- ==========================================
    CREATE TABLE IF NOT EXISTS iit_registry (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      city TEXT NOT NULL,
      club_directory_url TEXT,
      crawl_status TEXT DEFAULT 'pending',
      last_crawled_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clubs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      iit_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      category TEXT DEFAULT 'other',
      description TEXT,
      tagline TEXT,
      website_url TEXT,
      instagram_url TEXT,
      linkedin_url TEXT,
      github_url TEXT,
      email TEXT,
      logo_url TEXT,
      tags JSONB DEFAULT '[]',
      member_count INTEGER,
      founded_year INTEGER,
      is_recruiting TEXT DEFAULT 'false',
      crawl_status TEXT DEFAULT 'pending',
      last_crawled_at TIMESTAMP,
      crawl_source TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(name, iit_id)
    );
    CREATE TABLE IF NOT EXISTS club_knowledge (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
      knowledge_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_url TEXT,
      confidence TEXT DEFAULT '0.8',
      structured_data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS club_event_aggregates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT,
      start_date TEXT,
      registration_url TEXT,
      is_upcoming TEXT DEFAULT 'true',
      prize_pool TEXT,
      venue TEXT,
      source_url TEXT,
      raw_text TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crawl_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      iit_id TEXT,
      club_id UUID,
      stage TEXT,
      status TEXT DEFAULT 'pending',
      message TEXT,
      items_extracted INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Schema migration: add columns that may be missing from older tables
    ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
    ALTER TABLE clubs ADD COLUMN IF NOT EXISTS activity_score INTEGER DEFAULT 0;

    -- Opportunities table for intelligent ingestion (WhatsApp/Telegram feed)
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
  `).catch(console.error);
}

export async function ensureTablesExist() {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS iit_registry (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      city TEXT NOT NULL,
      club_directory_url TEXT,
      crawl_status TEXT DEFAULT 'pending',
      last_crawled_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clubs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      iit_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      category TEXT DEFAULT 'other',
      description TEXT,
      tagline TEXT,
      website_url TEXT,
      instagram_url TEXT,
      linkedin_url TEXT,
      github_url TEXT,
      email TEXT,
      logo_url TEXT,
      tags JSONB DEFAULT '[]',
      member_count INTEGER,
      founded_year INTEGER,
      is_recruiting TEXT DEFAULT 'false',
      crawl_status TEXT DEFAULT 'pending',
      last_crawled_at TIMESTAMP,
      crawl_source TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(name, iit_id)
    );
    CREATE TABLE IF NOT EXISTS club_knowledge (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
      knowledge_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_url TEXT,
      confidence TEXT DEFAULT '0.8',
      structured_data JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS club_event_aggregates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT,
      start_date TEXT,
      registration_url TEXT,
      is_upcoming TEXT DEFAULT 'true',
      prize_pool TEXT,
      venue TEXT,
      source_url TEXT,
      raw_text TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crawl_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      iit_id TEXT,
      club_id UUID,
      stage TEXT,
      status TEXT DEFAULT 'pending',
      message TEXT,
      items_extracted INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Schema migration: add columns that may be missing from older tables
    ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
    ALTER TABLE clubs ADD COLUMN IF NOT EXISTS activity_score INTEGER DEFAULT 0;

    -- Opportunities table for intelligent ingestion
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
}

// Force DB Refresh for Schema Updates
