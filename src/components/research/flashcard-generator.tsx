"use client";

import { useState } from "react";
import { LLMEngine } from "@/lib/ai/llm-engine";
import { buildFlashcardPrompt } from "@/lib/ai/agent";
import type { Flashcard, ResearchBrief } from "@/types/research";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Loader2,
    BookOpen,
    Download,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FlashcardGeneratorProps {
    brief: ResearchBrief;
}

/**
 * Spec §10 — Generate Flashcards from Research Output.
 * Uses DeepSeek to convert findings → Q/A cards with citations.
 * Supports CSV export.
 */
export function FlashcardGenerator({ brief }: FlashcardGeneratorProps) {
    const [cards, setCards] = useState<Flashcard[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);

    const generateFlashcards = async () => {
        setIsGenerating(true);
        setCards([]);
        setCurrentIndex(0);
        setFlipped(false);

        try {
            const llm = LLMEngine.getInstance();
            const prompt = buildFlashcardPrompt(JSON.stringify(brief));

            const response = await llm.chat([
                {
                    role: "system",
                    content:
                        "You generate study flashcards. Respond ONLY with a JSON array of objects with question, answer, citation fields.",
                },
                { role: "user", content: prompt },
            ]);

            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as Flashcard[];
                setCards(parsed.filter((c) => c.question && c.answer));
            }
        } catch (err) {
            console.error("Flashcard generation failed:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    const exportCsv = () => {
        if (cards.length === 0) return;
        const header = "Question,Answer,Citation\n";
        const rows = cards
            .map(
                (c) =>
                    `"${c.question.replace(/"/g, '""')}","${c.answer.replace(/"/g, '""')}","${c.citation}"`
            )
            .join("\n");
        const blob = new Blob([header + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `flashcards-${brief.title.slice(0, 30).replace(/\s+/g, "-")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const currentCard = cards[currentIndex];

    return (
        <div className="space-y-3">
            {/* Generate button */}
            {cards.length === 0 && (
                <Button
                    onClick={generateFlashcards}
                    disabled={isGenerating}
                    variant="outline"
                    className="w-full border-amber-500/30 text-amber-300 hover:bg-amber-500/10 gap-2"
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Generating Flashcards...
                        </>
                    ) : (
                        <>
                            <BookOpen className="h-4 w-4" /> Generate Flashcards
                        </>
                    )}
                </Button>
            )}

            {/* Flashcard viewer */}
            {cards.length > 0 && currentCard && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            Card {currentIndex + 1} / {cards.length}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={exportCsv}
                                title="Export CSV"
                            >
                                <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                    setCards([]);
                                    setCurrentIndex(0);
                                }}
                                title="Regenerate"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${currentIndex}-${flipped}`}
                            initial={{ rotateY: 90, opacity: 0 }}
                            animate={{ rotateY: 0, opacity: 1 }}
                            exit={{ rotateY: -90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Card
                                className="border-white/10 bg-white/5 cursor-pointer min-h-[140px] flex items-center"
                                onClick={() => setFlipped(!flipped)}
                            >
                                <CardContent className="p-5 w-full">
                                    {!flipped ? (
                                        <div>
                                            <Badge
                                                variant="outline"
                                                className="border-cyan-500/30 text-cyan-400 text-[10px] mb-2"
                                            >
                                                Question
                                            </Badge>
                                            <p className="text-sm font-medium">{currentCard.question}</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <Badge
                                                variant="outline"
                                                className="border-emerald-500/30 text-emerald-400 text-[10px] mb-2"
                                            >
                                                Answer {currentCard.citation}
                                            </Badge>
                                            <p className="text-sm text-muted-foreground">{currentCard.answer}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </AnimatePresence>

                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={currentIndex === 0}
                            onClick={() => {
                                setCurrentIndex(currentIndex - 1);
                                setFlipped(false);
                            }}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Tap card to flip
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={currentIndex >= cards.length - 1}
                            onClick={() => {
                                setCurrentIndex(currentIndex + 1);
                                setFlipped(false);
                            }}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
