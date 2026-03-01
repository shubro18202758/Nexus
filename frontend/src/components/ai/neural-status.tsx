"use client";

import { useAi } from "@/hooks/use-ai";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { BrainCircuit, Loader2 } from "lucide-react";

export function NeuralStatus() {
    const { isModelLoading, progress, loadingText } = useAi();

    // If loading or just loaded (we might want a "Ready" state briefly?)
    // For now, if not loading, we assume "Active" or "Idle"

    if (isModelLoading) {
        return (
            <div className="flex items-center gap-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-in fade-in zoom-in duration-300">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                <div className="flex-1 min-w-[120px]">
                    <div className="flex justify-between mb-1">
                        <span className="font-medium">Loading Neural Engine</span>
                        <span className="text-xs">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5 bg-amber-200" />
                    <p className="text-[10px] mt-1 truncate max-w-[180px] opacity-70">
                        {loadingText || "Downloading model..."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 animate-in fade-in zoom-in duration-300">
            <BrainCircuit className="w-4 h-4 text-green-600" />
            <span className="font-medium">Neural Engine: Active</span>
            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse ml-1" />
        </div>
    );
}
