import { NextResponse } from "next/server";
import { client } from "@/lib/server-db";

// Allow both GET (broiiwser) and POST (curl/code) to trigger init
export async function GET() {
    return initDatabase();
}

export async function POST() {
    return initDatabase();
}

async function initDatabase() {
    try {
        // Create enums
        const enums = [
            ["status", "'todo', 'in-progress', 'done'"],
            ["priority", "'low', 'medium', 'high'"],
            ["source", "'WhatsApp', 'Telegram'"],
            ["event_status", "'Detected', 'Queued', 'Applied', 'Processing', 'Failed'"],
            ["opportunity_status", "'pending', 'applied', 'rejected'"],
            ["channel_type", "'academic_official', 'academic_unofficial', 'career', 'social', 'uncategorized'"],
            ["event_category", "'exam', 'assignment', 'hackathon', 'workshop', 'contest', 'internship', 'social', 'noise'"],
        ];

        for (const [name, vals] of enums) {
            await client.query(
                `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN CREATE TYPE ${name} AS ENUM (${vals}); END IF; END $$;`
            );
        }

        // Create all tables
        await client.exec(`
            CREATE TABLE IF NOT EXISTS workspaces (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                icon TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                status status DEFAULT 'todo' NOT NULL,
                priority priority DEFAULT 'medium' NOT NULL,
                due_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS knowledge_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
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
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS teammates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                email TEXT,
                role TEXT,
                relation TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                role TEXT,
                url TEXT,
                skills JSONB,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS experience (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                company TEXT NOT NULL,
                role TEXT NOT NULL,
                duration TEXT,
                description TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS channel_settings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                type channel_type NOT NULL,
                platform TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source source NOT NULL,
                channel_id UUID REFERENCES channel_settings(id) ON DELETE SET NULL,
                category event_category,
                title TEXT,
                description TEXT,
                event_date TIMESTAMP,
                deadline TIMESTAMP,
                location TEXT,
                url TEXT,
                raw_context TEXT NOT NULL,
                metadata JSONB,
                status event_status DEFAULT 'Detected' NOT NULL,
                priority INTEGER,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS opportunities (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                url TEXT NOT NULL,
                source TEXT NOT NULL,
                content TEXT,
                ai_summary TEXT,
                relevance_score INTEGER,
                event_type TEXT,
                status opportunity_status DEFAULT 'pending' NOT NULL,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
        `);

        // Event Plans table (depends on events)
        await client.exec(`
            CREATE TABLE IF NOT EXISTS event_plans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
                generated_plan JSONB NOT NULL,
                student_feedback TEXT,
                progress INTEGER DEFAULT 0 NOT NULL,
                is_locked BOOLEAN DEFAULT FALSE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
        `);

        // Knowledge Copilot tables (depends on students)
        await client.exec(`
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
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS copilot_cycles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                cycle_number INTEGER NOT NULL,
                profile_level TEXT,
                bottlenecks JSONB,
                career_score INTEGER,
                advanced_unlocked TEXT,
                tier TEXT,
                full_state JSONB,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS career_evaluations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                goal_type TEXT NOT NULL,
                competition_score INTEGER,
                internship_score INTEGER,
                weakest_areas JSONB,
                portfolio_gaps JSONB,
                full_evaluation JSONB,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress_reflections (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                roadmap_id UUID,
                week_number INTEGER NOT NULL,
                reflection TEXT NOT NULL,
                difficulty_adjustment TEXT,
                updated_level TEXT,
                full_evaluation JSONB,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            );
        `);

        // Add missing columns that Drizzle schema expects but CREATE TABLE IF NOT EXISTS won't add
        const alterStatements = [
            "ALTER TABLE documents ADD COLUMN embedding TEXT",
            "ALTER TABLE knowledge_chunks ADD COLUMN embedding TEXT",
            "ALTER TABLE projects ADD COLUMN embedding TEXT",
            "ALTER TABLE experience ADD COLUMN embedding TEXT",
            // Life Ops columns on events (for upgrades from old schema)
            "ALTER TABLE events ADD COLUMN channel_id UUID REFERENCES channel_settings(id) ON DELETE SET NULL",
            "ALTER TABLE events ADD COLUMN category event_category",
            "ALTER TABLE events ADD COLUMN title TEXT",
            "ALTER TABLE events ADD COLUMN description TEXT",
            "ALTER TABLE events ADD COLUMN event_date TIMESTAMP",
            "ALTER TABLE events ADD COLUMN deadline TIMESTAMP",
            "ALTER TABLE events ADD COLUMN location TEXT",
            "ALTER TABLE events ADD COLUMN metadata JSONB",
        ];
        for (const stmt of alterStatements) {
            try { await client.query(stmt); } catch (_e) { /* column already exists */ }
        }

        // Seed minimal student profile if none exists
        const existing = await client.query("SELECT id FROM students LIMIT 1");
        let seeded = false;
        if (existing.rows.length === 0) {
            await client.query(`
                INSERT INTO students (name, email, phone, university, major, gpa, links, transcript)
                VALUES (
                    'Sayan',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '{}'::jsonb,
                    ''
                );
            `);
            seeded = true;
        }

        // List tables
        const tables = await client.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
        );

        return NextResponse.json({
            success: true,
            tables: tables.rows.map((r: any) => r.table_name),
            studentSeeded: seeded,
        });
    } catch (error: any) {
        console.error("DB Init Error:", error);
        const message = error?.message || error?.detail || JSON.stringify(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
