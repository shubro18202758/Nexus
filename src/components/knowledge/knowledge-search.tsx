"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
    { label: "All", value: "all" },
    { label: "PDF", value: "pdf" },
    { label: "Markdown", value: "md" },
    { label: "Text", value: "txt" },
];

interface KnowledgeSearchProps {
    onFilterChange: (filter: { query: string; category: string }) => void;
}

export function KnowledgeSearch({ onFilterChange }: KnowledgeSearchProps) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");

    const handleQueryChange = (val: string) => {
        setQuery(val);
        onFilterChange({ query: val, category });
    };

    const handleCategoryChange = (cat: string) => {
        setCategory(cat);
        onFilterChange({ query, category: cat });
    };

    return (
        <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Search knowledge base..."
                    className="pl-10 bg-white/5 border-white/10 focus:border-purple-500/50"
                />
                {query && (
                    <button
                        onClick={() => handleQueryChange("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Category Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.value}
                        onClick={() => handleCategoryChange(cat.value)}
                        className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                            category === cat.value
                                ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                                : "bg-white/5 text-muted-foreground border-white/10 hover:border-white/20"
                        )}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
