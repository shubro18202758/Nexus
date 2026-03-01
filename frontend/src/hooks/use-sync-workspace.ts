"use client";

import { useEffect, useState } from "react";
import { useDb } from "@/components/providers/db-provider";

type SyncStatus = "connected" | "disconnected" | "syncing";

export function useSyncWorkspace(workspaceId: string) {
    const { pg } = useDb();
    const [status, setStatus] = useState<SyncStatus>("disconnected");

    useEffect(() => {
        if (!pg || !workspaceId) return;

        const sync = async () => {
            try {
                setStatus("syncing");

                // Sync Tasks
                const tasksShape = await pg.electric.syncShapeToTable({
                    url: "http://localhost:3000/v1/shape",
                    params: {
                        table: "tasks",
                        where: `workspace_id = '${workspaceId}'`,
                    },
                    table: "tasks",
                    primaryKey: ["id"],
                });

                const activeTasksTable = await tasksShape.subscribe();

                // Sync Documents
                const docsShape = await pg.electric.syncShapeToTable({
                    url: "http://localhost:3000/v1/shape",
                    params: {
                        table: "documents",
                        where: `workspace_id = '${workspaceId}'`,
                    },
                    table: "documents",
                    primaryKey: ["id"],
                });

                const activeDocsTable = await docsShape.subscribe();

                setStatus("connected");

                return () => {
                    activeTasksTable.unsubscribe();
                    activeDocsTable.unsubscribe();
                };
            } catch (error) {
                console.error("Sync failed:", error);
                setStatus("disconnected");
            }
        };

        sync();
    }, [pg, workspaceId]);

    return { status };
}
