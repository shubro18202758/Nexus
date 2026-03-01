"use client";

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import * as schema from "@/db/schema";
import { vector } from "@electric-sql/pglite/vector";
import { electricSync } from "@electric-sql/pglite-sync";

interface ElectricExtension {
  syncShapeToTable: (options: {
    url: string;
    params?: Record<string, string>;
    table: string;
    primaryKey: string[];
  }) => Promise<{
    subscribe: () => Promise<{ unsubscribe: () => void }>;
  }>;
}

type PGliteWithSync = PGlite & {
  electric: ElectricExtension;
};

// Default workspace ID — used across the app
export const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

type DatabaseContextType = {
  db: PgliteDatabase<typeof schema> | null;
  pg: PGliteWithSync | null;
  isLoading: boolean;
  error: Error | null;
  workspaceId: string;
};

const DatabaseContext = createContext<DatabaseContextType>({
  db: null,
  pg: null,
  isLoading: true,
  error: null,
  workspaceId: DEFAULT_WORKSPACE_ID,
});

export function useDb() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDb must be used within a DatabaseProvider");
  }
  return context;
}

interface DatabaseProviderProps {
  children: ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [db, setDb] = useState<PgliteDatabase<typeof schema> | null>(null);
  const [pg, setPg] = useState<PGliteWithSync | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initDb = async () => {
      try {
        const pgInstance = await PGlite.create({
          dataDir: "idb://nexus-db",
          extensions: {
            vector,
            electric: electricSync(),
          },
        });

        // Manual Migration Runner
        // 1. Enable Vector Extension (handled by PGlite extensions config, but good to ensure)
        await pgInstance.exec(`CREATE EXTENSION IF NOT EXISTS vector;`);

        // 2. Create Enums
        // Check if enum exists to avoid error on retry
        const enumCheck = await pgInstance.query(`SELECT 1 FROM pg_type WHERE typname = 'status'`);
        if (enumCheck.rows.length === 0) {
          await pgInstance.exec(`CREATE TYPE status AS ENUM ('todo', 'in-progress', 'done');`);
        }

        // Check if priority enum exists
        const priorityEnumCheck = await pgInstance.query(`SELECT 1 FROM pg_type WHERE typname = 'priority'`);
        if (priorityEnumCheck.rows.length === 0) {
          await pgInstance.exec(`CREATE TYPE priority AS ENUM ('low', 'medium', 'high');`);
        }

        // 3. Create Tables
        await pgInstance.exec(`
          CREATE TABLE IF NOT EXISTS workspaces (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            icon TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            status status NOT NULL DEFAULT 'todo',
            priority priority NOT NULL DEFAULT 'medium',
            due_date TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT,
            embedding vector(1536),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS knowledge_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            knowledge_item_id UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            embedding vector(1536),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          -- Student OS Core Tables
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

          CREATE TABLE IF NOT EXISTS teammates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT,
            role TEXT,
            relation TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            role TEXT,
            url TEXT,
            skills JSONB,
            embedding vector(384),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS experience (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            company TEXT NOT NULL,
            role TEXT NOT NULL,
            duration TEXT,
            description TEXT NOT NULL,
            embedding vector(384),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        `);

        // Seed default workspace if none exists
        const wsCheck = await pgInstance.query(`SELECT id FROM workspaces LIMIT 1`);
        if (wsCheck.rows.length === 0) {
          await pgInstance.exec(`
            INSERT INTO workspaces (id, name, icon)
            VALUES ('${DEFAULT_WORKSPACE_ID}', 'My Workspace', '🧠');
          `);
          console.log('✅ Default workspace created');
        }

        const drizzleDb = drizzle(pgInstance, { schema });
        setDb(drizzleDb);
        setPg(pgInstance as any as PGliteWithSync);
      } catch (err) {
        console.error("Failed to initialize database:", err);
        setError(err instanceof Error ? err : new Error("Unknown database error"));
      } finally {
        setIsLoading(false);
      }
    };

    initDb();
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-red-50 text-red-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Database Error</h1>
          <p className="mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <DatabaseContext.Provider value={{ db, pg, isLoading, error, workspaceId: DEFAULT_WORKSPACE_ID }}>
      {children}
    </DatabaseContext.Provider>
  );
}
