"use client";

import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { FileText, BarChart3, Hash } from "lucide-react";
import type { CitationDetail } from "@/types/research";

interface CitationModalProps {
    citation: CitationDetail | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Spec §8 — Citation Viewer Modal.
 * Opens a side sheet showing the full chunk, scores, and source metadata.
 */
export function CitationModal({ citation, open, onOpenChange }: CitationModalProps) {
    if (!citation) return null;

    const similarityPct = (citation.similarity * 100).toFixed(1);
    const rerankPct = citation.rerank_score != null
        ? (citation.rerank_score * 100).toFixed(1)
        : null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[460px] sm:w-[520px] bg-background/95 backdrop-blur-md border-white/10 overflow-y-auto">
                <SheetHeader className="pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-400 text-xs font-mono"
                        >
                            [{citation.index}]
                        </Badge>
                        <SheetTitle className="text-base text-foreground/90 truncate">
                            {citation.source_title}
                        </SheetTitle>
                    </div>
                    <SheetDescription className="text-xs text-muted-foreground/60 font-mono">
                        {citation.source_id}
                    </SheetDescription>
                </SheetHeader>

                {/* Score Metrics */}
                <div className="grid grid-cols-2 gap-3 mt-5">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/15">
                        <BarChart3 className="h-4 w-4 text-cyan-400 shrink-0" />
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                Vector Similarity
                            </p>
                            <p className="text-sm font-semibold text-cyan-300">
                                {similarityPct}%
                            </p>
                        </div>
                    </div>
                    {rerankPct && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/15">
                            <Hash className="h-4 w-4 text-violet-400 shrink-0" />
                            <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                    Rerank Score
                                </p>
                                <p className="text-sm font-semibold text-violet-300">
                                    {rerankPct}%
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Chunk Content */}
                <div className="mt-5">
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground/70" />
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                            Chunk Content
                        </h4>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10 max-h-[60vh] overflow-y-auto">
                        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                            {citation.content}
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
