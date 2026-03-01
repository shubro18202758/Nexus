"use client";

import { useState } from "react";
import { type FullCareerEvaluation } from "@/lib/ai/career-evaluator";
import { getLearningProfile } from "@/app/actions/profile-actions";
import { checkCareerReadiness } from "@/app/actions/plan-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, GraduationCap, Brain, Server, Bot, BarChart3, AlertTriangle, Trophy, Clock, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface CareerModalProps {
    isOpen: boolean;
    onClose: () => void;
    goalType?: string;
}

const TRACK_CONFIG = [
    { key: "ml_competitions", label: "ML Competitions", icon: Trophy, color: "text-amber-400", bg: "bg-amber-500" },
    { key: "research_internships", label: "Research", icon: Brain, color: "text-purple-400", bg: "bg-purple-500" },
    { key: "backend_internships", label: "Backend SWE", icon: Server, color: "text-blue-400", bg: "bg-blue-500" },
    { key: "llm_engineering", label: "LLM Engineering", icon: Bot, color: "text-cyan-400", bg: "bg-cyan-500" },
    { key: "data_science", label: "Data Science", icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500" },
] as const;

export function CareerModal({ isOpen, onClose, goalType = "Full Stack" }: CareerModalProps) {
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [result, setResult] = useState<FullCareerEvaluation | null>(null);

    const handleEvaluate = async () => {
        setIsEvaluating(true);
        try {
            toast.info("Analyzing your career trajectory...");
            const profile = await getLearningProfile();

            const evaluator = await import("@/lib/ai/career-evaluator");
            const evaluation = await evaluator.evaluateCareerReadiness(profile, goalType);

            setResult(evaluation);
            await checkCareerReadiness(goalType);
            toast.success("Career Forecast Complete!");

        } catch (error) {
            console.error(error);
            toast.error("Failed to evaluate career readiness");
        } finally {
            setIsEvaluating(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 75) return "text-emerald-400";
        if (score >= 50) return "text-amber-400";
        if (score >= 25) return "text-orange-400";
        return "text-red-400";
    };

    const getProgressColor = (score: number) => {
        if (score >= 75) return "[&>div]:bg-emerald-500";
        if (score >= 50) return "[&>div]:bg-amber-500";
        if (score >= 25) return "[&>div]:bg-orange-500";
        return "[&>div]:bg-red-500";
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-black/95 border-violet-900/40 text-white max-w-2xl h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-violet-400 flex items-center gap-2 text-xl font-bold tracking-tight">
                        <GraduationCap className="h-6 w-6" /> Career Readiness Forecast
                    </DialogTitle>
                    <DialogDescription className="text-violet-200/50">
                        AI-powered evaluation of your competition & internship readiness.
                    </DialogDescription>
                </DialogHeader>

                {!result ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                        <div className="text-center space-y-2">
                            <h3 className="text-lg font-medium text-white/80">Where do you stand?</h3>
                            <p className="text-sm text-white/50 max-w-md">
                                The AI will evaluate your readiness across 5 career tracks based on your profile, knowledge graph, and challenge performance.
                            </p>
                        </div>
                        <Button
                            size="lg"
                            className="bg-violet-900/20 hover:bg-violet-900/40 text-violet-400 border border-violet-500/30"
                            onClick={handleEvaluate}
                            disabled={isEvaluating}
                        >
                            {isEvaluating ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Evaluating Trajectory...
                                </>
                            ) : (
                                <>
                                    <Target className="h-5 w-5 mr-2" /> Run Career Forecast
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 space-y-4 animate-in fade-in slide-in-from-bottom-4 overflow-y-auto pr-1">
                        {/* Overall Scores */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-violet-950/20 border border-violet-500/20 rounded-lg p-4 text-center">
                                <div className={`text-3xl font-black ${getScoreColor(result.overall.competition_readiness_score)}`}>
                                    {result.overall.competition_readiness_score}
                                </div>
                                <div className="text-xs text-white/50 mt-1">Competition Readiness</div>
                            </div>
                            <div className="bg-violet-950/20 border border-violet-500/20 rounded-lg p-4 text-center">
                                <div className={`text-3xl font-black ${getScoreColor(result.overall.internship_readiness_score)}`}>
                                    {result.overall.internship_readiness_score}
                                </div>
                                <div className="text-xs text-white/50 mt-1">Internship Readiness</div>
                            </div>
                        </div>

                        {/* Track Breakdown */}
                        <div className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-white/80">Track Breakdown</h4>
                            {TRACK_CONFIG.map(({ key, label, icon: Icon, color, bg }) => {
                                const score = result.breakdown[key as keyof typeof result.breakdown];
                                return (
                                    <div key={key} className="flex items-center gap-3">
                                        <Icon className={`h-4 w-4 ${color} shrink-0`} />
                                        <div className="flex-1">
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-white/70">{label}</span>
                                                <span className={`font-bold ${getScoreColor(score)}`}>{score}/100</span>
                                            </div>
                                            <Progress value={score} className={`h-1.5 bg-white/5 ${getProgressColor(score)}`} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Weakest Areas & Gaps */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-red-950/10 border border-red-500/20 rounded-lg p-3">
                                <h5 className="text-xs font-semibold text-red-400 flex items-center gap-1 mb-2">
                                    <AlertTriangle className="h-3 w-3" /> Weakest Interview Areas
                                </h5>
                                <div className="space-y-1">
                                    {result.overall.weakest_interview_areas.map((area, i) => (
                                        <Badge key={i} variant="outline" className="text-[10px] border-red-500/20 text-red-300/70 block w-fit">
                                            {area}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-amber-950/10 border border-amber-500/20 rounded-lg p-3">
                                <h5 className="text-xs font-semibold text-amber-400 flex items-center gap-1 mb-2">
                                    <Trophy className="h-3 w-3" /> Portfolio Gaps
                                </h5>
                                <div className="space-y-1">
                                    {result.overall.project_portfolio_gap.map((gap, i) => (
                                        <Badge key={i} variant="outline" className="text-[10px] border-amber-500/20 text-amber-300/70 block w-fit">
                                            {gap}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Next Milestone & ETA */}
                        <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h5 className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
                                    <Target className="h-4 w-4" /> Recommended Next Milestone
                                </h5>
                                <Badge variant="outline" className="border-emerald-500/20 text-emerald-300 text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {result.overall.estimated_weeks_to_ready}
                                </Badge>
                            </div>
                            <p className="text-sm text-emerald-100/70">{result.overall.recommended_next_milestone}</p>
                        </div>

                        <Button variant="outline" className="w-full border-white/10 hover:bg-white/5 shrink-0" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
