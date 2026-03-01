"use client";

import { useState } from "react";
import { CornerDownLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LLMEngine } from "@/lib/ai/llm-engine";
import { useDb } from "@/components/providers/db-provider";
import { tasks } from "@/db/schema";
// import { toast } from "sonner"; // Assuming sonner or similar is available, or use alert for now

export function SmartInput({ onSuccess }: { onSuccess?: () => void }) {
    const [input, setInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const { db } = useDb();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !db) return;

        setIsProcessing(true);
        try {
            // 1. Parse with LLM
            const prompt = `
            You are a task parsers. Extract task details from the user's input.
            Current Date: ${new Date().toISOString()}
            
            Input: "${input}"
            
            Output ONLY valid JSON with:
            - title: string (concise)
            - due_date: string (ISO 8601 YYYY-MM-DD) or null
            - priority: "low" | "medium" | "high"
            - description: string (context) or null
            
            JSON:
            `;

            const engine = LLMEngine.getInstance();
            if (!engine.isReady()) {
                await engine.initialize();
            }

            const response = await engine.chat([
                { role: "system", content: "You are a JSON task parser." },
                { role: "user", content: prompt }
            ]);

            // Attempt to clean JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Failed to parse AI response");

            const taskData = JSON.parse(jsonMatch[0]);

            // 2. Save to DB
            await db.insert(tasks).values({
                workspaceId: "default", // simplified for now
                title: taskData.title,
                dueDate: taskData.due_date ? new Date(taskData.due_date) : null,
                priority: taskData.priority || "medium",
                description: taskData.description,
                status: "todo",
            });

            setInput("");
            if (onSuccess) onSuccess();
            // toast.success("Task created!"); 
        } catch (error) {
            console.error("Smart Input Error:", error);
            // toast.error("Failed to create task");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="relative group">
            <div className="relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Add a task... (e.g., 'Review biology notes by Friday high priority')"
                    className="w-full h-14 pl-12 pr-14 rounded-xl border border-slate-200 bg-white/50 backdrop-blur-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg placeholder:text-slate-400"
                    disabled={isProcessing}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    {isProcessing ? (
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    ) : (
                        <Sparkles className="h-5 w-5 group-focus-within:text-blue-500 transition-colors" />
                    )}
                </div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0 rounded-lg"
                        disabled={!input.trim() || isProcessing}
                    >
                        <CornerDownLeft className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="absolute -bottom-6 left-4 text-xs text-slate-400 opacity-0 group-focus-within:opacity-100 transition-opacity">
                Type naturally • AI auto-tags priority & dates
            </div>
        </form>
    );
}
