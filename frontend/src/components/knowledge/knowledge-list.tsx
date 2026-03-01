"use client";

import { useEffect, useState, useMemo } from "react";
import { FileText, Trash2, File as FileIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDb } from "@/components/providers/db-provider";
import { knowledgeItems, type KnowledgeItem } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { SummaryDialog } from "./summary-dialog";

interface KnowledgeListProps {
    filter?: { query: string; category: string };
}

export function KnowledgeList({ filter }: KnowledgeListProps) {
    const { db } = useDb();
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [summaryTarget, setSummaryTarget] = useState<{ id: string; title: string } | null>(null);

    const loadItems = async () => {
        if (!db) return;
        try {
            const res = await db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.createdAt));
            setItems(res);
        } catch (error) {
            console.error("Failed to load knowledge items", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadItems();
        // Poll at a reasonable interval to avoid excessive re-renders
        const interval = setInterval(loadItems, 15000);
        return () => clearInterval(interval);
    }, [db]);

    const filteredItems = useMemo(() => {
        if (!filter) return items;
        return items.filter((item) => {
            const matchesQuery = !filter.query ||
                item.title.toLowerCase().includes(filter.query.toLowerCase()) ||
                item.fileName.toLowerCase().includes(filter.query.toLowerCase());
            const matchesCategory = filter.category === "all" || item.type === filter.category;
            return matchesQuery && matchesCategory;
        });
    }, [items, filter]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!db) return;
        if (confirm("Are you sure? This will remove the file from the index.")) {
            await db.delete(knowledgeItems).where(eq(knowledgeItems.id, id));
            loadItems();
        }
    };

    if (isLoading) return <div>Loading...</div>;

    if (filteredItems.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/20">
                {filter?.query || filter?.category !== "all"
                    ? "No items match your search."
                    : "No documents found. Upload some to get started!"}
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredItems.map((item) => (
                    <div
                        key={item.id}
                        className="group border rounded-lg p-4 bg-card hover:shadow-md transition-all flex flex-col gap-3 relative"
                    >
                        <div className="flex items-start justify-between">
                            <div className="p-2 bg-primary/10 rounded-md text-primary">
                                {item.type === 'pdf' ? <FileText className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-purple-400"
                                    title="Summarize with AI"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSummaryTarget({ id: item.id, title: item.title });
                                    }}
                                >
                                    <Sparkles className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => handleDelete(item.id, e)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-medium truncate" title={item.title}>{item.title}</h4>
                            <p className="text-xs text-muted-foreground">{item.fileName} • {item.fileSize}</p>
                        </div>

                        <div className="mt-auto text-xs text-muted-foreground">
                            Indexed {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary Dialog */}
            {summaryTarget && (
                <SummaryDialog
                    isOpen={!!summaryTarget}
                    onClose={() => setSummaryTarget(null)}
                    knowledgeItemId={summaryTarget.id}
                    title={summaryTarget.title}
                />
            )}
        </>
    );
}
