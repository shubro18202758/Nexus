/**
 * Shared task creation utility (Spec §4).
 *
 * Both the ReAct agent (`use-agent.ts`) and the Research Copilot panel
 * invoke this function instead of inserting into the DB directly.
 * Duplicate checking is built-in: if a task with the exact same title
 * already exists in the workspace it is silently skipped.
 */

import { tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";

export interface CreateTaskParams {
    workspaceId: string;
    title: string;
    priority?: "low" | "medium" | "high";
    description?: string | null;
    dueDate?: Date | null;
}

/**
 * Create a task in the given workspace.
 *
 * @returns `true` if a new task was inserted, `false` if it already existed.
 * @throws  Re-throws DB errors (callers should handle gracefully).
 */
export async function createTaskInWorkspace(
    db: PgliteDatabase<any>,
    params: CreateTaskParams
): Promise<boolean> {
    const { workspaceId, title, priority = "medium", description = null, dueDate = null } = params;

    // Duplicate guard – check by title within workspace
    const existing = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.title, title), eq(tasks.workspaceId, workspaceId)));

    if (existing.length > 0) return false;

    await db.insert(tasks).values({
        workspaceId,
        title,
        priority,
        description,
        dueDate,
        status: "todo",
    });

    return true;
}
