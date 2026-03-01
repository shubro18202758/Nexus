import { PGlite } from "@electric-sql/pglite";

async function listTables() {
    const client = new PGlite("./nexus-server-db");
    try {
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log("📂 Existing Tables:", res.rows.map((r: any) => r.table_name));

        const enums = await client.query(`
             SELECT t.typname
             FROM pg_type t
             JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public';
        `);
        console.log("🔠 Existing Types:", enums.rows.map((r: any) => r.typname));

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.close();
    }
}

listTables();
