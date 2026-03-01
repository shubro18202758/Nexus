"use client";

import { useEffect, useState } from "react";
import { File, MoreVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDb } from "@/components/providers/db-provider";
import { documents } from "@/db/schema";
import { desc } from "drizzle-orm";

export function RecentFiles() {
    const { db } = useDb();
    const [recentDocs, setRecentDocs] = useState<any[]>([]);

    useEffect(() => {
        const fetchDocs = async () => {
            if (!db) return;
            try {
                const res = await db.select().from(documents).orderBy(desc(documents.createdAt)).limit(4);
                setRecentDocs(res);
            } catch (e) {
                console.error("Failed to fetch recent docs", e);
            }
        };
        fetchDocs();
    }, [db]);

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold tracking-tight">Recent Files</h2>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                    View all
                </Button>
            </div>

            {recentDocs.length === 0 ? (
                <div className="flex h-[150px] w-full items-center justify-center rounded-lg border border-dashed bg-slate-50 dark:bg-slate-900/50">
                    <div className="text-center text-sm text-muted-foreground">
                        No recent files found. Create a new document to get started.
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {recentDocs.map((doc) => (
                        <Card key={doc.id} className="group cursor-pointer transition-all hover:shadow-md hover:border-purple-200 dark:hover:border-purple-900">
                            <CardContent className="p-4 flex flex-col h-[160px] justify-between">
                                <div className="flex items-start justify-between">
                                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                                        <File className="h-8 w-8" />
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div>
                                    <h3 className="font-semibold truncate pr-2">{doc.title}</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Edited {new Date(doc.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
