"use client";

import { useState } from "react";
import { LLMEngine } from "@/lib/ai/llm-engine";

export function useEditorAi() {
    const [isGenerating, setIsGenerating] = useState(false);

    const generateText = async (
        instruction: string,
        context: string
    ): Promise<string | null> => {
        setIsGenerating(true);
        try {
            const engine = LLMEngine.getInstance();

            // Ensure initialized (usually done by chat interface, but good to check)
            if (!engine.isReady()) {
                // In a real app, we might need to trigger init here, 
                // but for this prototype we assume the user might have "warmed up" the model 
                // or we simply try to auto-init if lightweight.
                // For now, let's assume it's loaded or throw a friendly error.
                await engine.initialize((progress) => {
                    console.log("Initializing LLM for Editor:", progress);
                });
            }

            const prompt = `
You are an AI writing assistant. 
Your task is to follow the user's instruction to modify or generate text based on the provided context.
Output ONLY the resulting text. Do not output conversational filler like "Here is the summary:".
      
Context: "${context}"

Instruction: ${instruction}
`;

            const messages = [
                { role: "system" as const, content: "You are a helpful AI writing assistant. Output only the requested text." },
                { role: "user" as const, content: prompt }
            ];

            const response = await engine.chat(messages);
            return response;

        } catch (error) {
            console.error("Editor AI Error:", error);
            return null;
        } finally {
            setIsGenerating(false);
        }
    };

    return {
        generateText,
        isGenerating,
    };
}
