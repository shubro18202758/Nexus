"use client";

import { useEffect, useState, useRef } from "react";
import { useRag } from "@/hooks/use-rag";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RelatedChunk {
    id: string;
    content: string;
    similarity: number;
    rerank_score?: number;
}

export function RelatedContext({ editorContent }: { editorContent: string }) {
    const { searchWithRerank, isReady } = useRag();
    const [results, setResults] = useState<RelatedChunk[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isReady || !editorContent || editorContent.length < 30) {
            setResults([]);
            return;
        }

        // Debounce — wait 1.5s after user stops typing
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                // Extract meaningful query from editor content (last ~100 chars)
                const query = editorContent
                    .replace(/<[^>]*>/g, "")
                    .trim()
                    .slice(-200);

                if (query.length < 20) {
                    setResults([]);
                    return;
                }

                const searchResults = await searchWithRerank(query);
                setResults(searchResults);
            } catch (e) {
                console.error("Related context search failed:", e);
            } finally {
                setIsSearching(false);
            }
        }, 1500);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [editorContent, searchWithRerank, isReady]);

    if (!isReady) return null;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30">
                <div className="relative">
                    <span className="text-sm">🧠</span>
                    {isSearching && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                    )}
                </div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Related Context
                </h3>
                {isSearching && (
                    <span className="text-[10px] text-indigo-500 font-medium ml-auto animate-pulse">
                        Re-ranking...
                    </span>
                )}
            </div>
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                    {results.length === 0 && !isSearching && (
                        <p className="text-xs text-slate-400 italic p-2 text-center">
                            Start typing to discover related knowledge...
                        </p>
                    )}
                    {results.map((result, idx) => {
                        const confidence = result.rerank_score ?? result.similarity;
                        const confidencePercent = Math.round(confidence * 100);
                        const barColor =
                            confidencePercent >= 70 ? "bg-green-500" :
                                confidencePercent >= 40 ? "bg-yellow-500" :
                                    "bg-red-400";
                        return (
                            <div
                                key={`${result.id}-${idx}`}
                                className="group p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all hover:shadow-sm"
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-mono text-slate-400">
                                        #{idx + 1}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${barColor} transition-all`}
                                                style={{ width: `${confidencePercent}%` }}
                                            />
                                        </div>
                                        <span className={`text-[10px] font-bold ${confidencePercent >= 70 ? "text-green-600 dark:text-green-400" :
                                                confidencePercent >= 40 ? "text-yellow-600 dark:text-yellow-400" :
                                                    "text-red-500"
                                            }`}>
                                            {confidencePercent}%
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-4">
                                    {result.content}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}
