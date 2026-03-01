"use client";

import { useMemo } from "react";
import { BookOpen, Clock, Type, Hash } from "lucide-react";

interface DocAnalyticsProps {
    content: string;
}

function stripHtml(html: string): string {
    const tmp = typeof document !== "undefined"
        ? (() => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent || d.innerText || ""; })()
        : html.replace(/<[^>]*>/g, "");
    return tmp;
}

export function DocAnalytics({ content }: DocAnalyticsProps) {
    const stats = useMemo(() => {
        const plainText = stripHtml(content);
        const words = plainText.trim().split(/\s+/).filter(Boolean).length;
        const chars = plainText.length;
        const sentences = plainText.split(/[.!?]+/).filter(Boolean).length;
        const readingTimeMin = Math.max(1, Math.ceil(words / 200));

        // Flesch-Kincaid approximation
        const syllables = plainText.toLowerCase().replace(/[^a-z]/g, " ").split(/\s+/).reduce((total, word) => {
            let count = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g)?.length || 1;
            return total + count;
        }, 0);
        const fk = words > 0 && sentences > 0
            ? Math.round(206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words))
            : 0;
        const complexity = fk > 70 ? "Easy" : fk > 50 ? "Moderate" : fk > 30 ? "Advanced" : "Complex";

        return { words, chars, sentences, readingTimeMin, complexity };
    }, [content]);

    const items = [
        { icon: Type, label: "Words", value: stats.words.toLocaleString() },
        { icon: Hash, label: "Characters", value: stats.chars.toLocaleString() },
        { icon: Clock, label: "Read time", value: `${stats.readingTimeMin} min` },
        { icon: BookOpen, label: "Complexity", value: stats.complexity },
    ];

    return (
        <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground backdrop-blur-sm">
            {items.map((item, i) => (
                <div key={item.label} className="flex items-center gap-1.5">
                    <item.icon className="h-3 w-3 text-purple-400/60" />
                    <span className="font-medium text-foreground/80">{item.value}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                    {i < items.length - 1 && <span className="ml-2 text-white/10">|</span>}
                </div>
            ))}
        </div>
    );
}
