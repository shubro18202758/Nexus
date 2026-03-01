"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function SourceBadge({ source, url, color }: { source: string; url: string; color: string }) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-mono tracking-wider",
                "bg-white/[0.03] border border-white/[0.06] hover:border-white/15 transition-all group/source"
            )}
        >
            <div className="w-3 h-3 rounded-sm overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
                <img
                    src={`https://www.google.com/s2/favicons?domain=${source}&sz=16`}
                    alt={source}
                    className="w-3 h-3"
                    loading="lazy"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                    }}
                />
            </div>
            <span className="text-white/40 group-hover/source:text-white/60 transition-colors truncate max-w-[100px]">
                {source}
            </span>
            <ExternalLink className="h-2 w-2 text-white/20 group-hover/source:text-white/40 transition-colors shrink-0" />
        </a>
    );
}
