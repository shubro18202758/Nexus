import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import path from "path";
import { vector } from "@electric-sql/pglite/vector";

const globalForDb = globalThis as unknown as {
  conn: PGlite | undefined;
  nexusTablesReady: boolean;
};

const dbPath = path.resolve(process.cwd(), "nexus-server-db");

export const client = globalForDb.conn ?? new PGlite(dbPath, {
  extensions: { vector },
});

if (process.env.NODE_ENV !== "production") globalForDb.conn = client;

export const serverDb = drizzle(client, { schema });

// Create Nexus tables if they don't exist yet
if (!globalForDb.nexusTablesReady) {
  globalForDb.nexusTablesReady = true;
  client.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;

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
      UNIQUE(name, iit_id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
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
  `).catch(console.error);
}
export async function ensureTablesExist() {
  await client.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;

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
      confidence TEXT DEFAULT '0.7',
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
  `);
}
