"use client";

import { useState } from "react";
import { type AdaptiveRoadmap } from "@/lib/ai/roadmap-planner";
import { type ProgressEvaluation } from "@/lib/ai/progress-evaluator";
import { submitProgress } from "@/app/actions/plan-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProgressModalProps {
    roadmap: AdaptiveRoadmap;
    week: number;
    isOpen: boolean;
    onClose: () => void;
    onEvaluation: (evalResult: ProgressEvaluation) => void;
}

export function ProgressModal({ roadmap, week, isOpen, onClose, onEvaluation }: ProgressModalProps) {
    const [reflection, setReflection] = useState("");
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [result, setResult] = useState<ProgressEvaluation | null>(null);

    const handleSubmit = async () => {
        setIsEvaluating(true);
        try {
            // Dynamically import AI logic (client-side for now, or via server action)
            // Ideally should be a server action, but for now we import the logic like other components
            const evaluator = await import("@/lib/ai/progress-evaluator");
            const evaluation = await evaluator.evaluateProgress(roadmap, reflection, week);

            setResult(evaluation);
            onEvaluation(evaluation);

            // Also call server action to "save" it (logging for now)
            await submitProgress(roadmap, reflection, week);

        } catch (error) {
            console.error(error);
        } finally {
            setIsEvaluating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-black/90 border-emerald-500/30 text-white max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-emerald-400 flex items-center gap-2">
                        <RefreshCw className="h-5 w-5" /> Week {week} Check-in
                    </DialogTitle>
                    <DialogDescription className="text-white/60">
                        Reflect on your progress. How did the theory and implementation go?
                    </DialogDescription>
                </DialogHeader>

                {!result ? (
                    <div className="space-y-4">
                        <Textarea
                            placeholder="I understood the CAP theorem but struggled with the Node.js implementation..."
                            className="bg-black/50 border-white/10 text-white min-h-[100px]"
                            value={reflection}
                            onChange={(e) => setReflection(e.target.value)}
                        />
                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                            onClick={handleSubmit}
                            disabled={!reflection || isEvaluating}
                        >
                            {isEvaluating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Analyze Progress
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-emerald-950/30 p-4 rounded border border-emerald-500/20 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-emerald-200/80">Difficulty Adjustment</span>
                                <Badge variant="outline" className={`
                                    ${result.difficulty_adjustment === 'increase' ? 'border-red-500 text-red-400' :
                                        result.difficulty_adjustment === 'reduce' ? 'border-blue-500 text-blue-400' :
                                            'border-emerald-500 text-emerald-400'}
                                `}>
                                    {result.difficulty_adjustment === 'increase' && <TrendingUp className="h-3 w-3 mr-1" />}
                                    {result.difficulty_adjustment === 'reduce' && <TrendingDown className="h-3 w-3 mr-1" />}
                                    {result.difficulty_adjustment === 'maintain' && <Minus className="h-3 w-3 mr-1" />}
                                    {result.difficulty_adjustment.toUpperCase()}
                                </Badge>
                            </div>

                            <div>
                                <h5 className="text-sm font-semibold text-emerald-300 mb-1">Feedback</h5>
                                <p className="text-sm text-emerald-100/70 italic">"{result.feedback_message}"</p>
                            </div>

                            {/* Mastery Updates */}
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-500/10">
                                {Object.entries(result.concept_mastery_updates).map(([concept, status], i) => (
                                    <Badge key={i} className="bg-black/40 text-xs border-white/10 text-white/60">
                                        {concept}: <span className="text-emerald-400 ml-1">{status}</span>
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <Button variant="outline" className="w-full border-white/10 hover:bg-white/5" onClick={onClose}>
                            Close & Apply Updates
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
