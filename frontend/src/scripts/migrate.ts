
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import path from "path";

import { vector } from "@electric-sql/pglite/vector";

async function main() {
    console.log("🚀 Starting migration...");
    const dbPath = path.resolve(process.cwd(), "nexus-server-db");
    const client = new PGlite(dbPath, {
        extensions: { vector }
    });
    const db = drizzle(client);

    // Ensure pgvector extension is created
    console.log("🔌 Enabling pgvector extension...");
    await client.exec("CREATE EXTENSION IF NOT EXISTS vector;");

    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    console.log(`📂 Loading migrations from: ${migrationsFolder}`);

    try {
        await migrate(db, { migrationsFolder });
        console.log("✅ Migration completed successfully!");
    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await client.close();
    }
}

main();
