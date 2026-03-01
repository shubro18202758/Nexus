"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { type AdaptiveRoadmap, type WeeklyPlan } from "@/lib/ai/roadmap-planner";
import { type ProgressEvaluation } from "@/lib/ai/progress-evaluator";
import { type CopilotState } from "@/lib/ai/copilot-orchestrator";
import { ProgressModal } from "./progress-modal";
import { ChallengeModal } from "./challenge-modal";
import { CareerModal } from "./career-modal";
import { MasteryModal } from "./mastery-modal";
import { ThresholdStatus } from "./threshold-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Trophy, BookOpen, Code, Lightbulb, PenTool, Target, RefreshCw, Swords, GraduationCap, Calendar } from "lucide-react";
import { toast } from "sonner";

interface AdaptiveTimelineProps {
    roadmap: AdaptiveRoadmap;
    copilotState?: CopilotState | null;
}

export function AdaptiveTimeline({ roadmap: initialRoadmap, copilotState }: AdaptiveTimelineProps) {
    const [roadmap, setRoadmap] = useState(initialRoadmap);
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
    const [showChallenge, setShowChallenge] = useState(false);
    const [showCareer, setShowCareer] = useState(false);
    const [showMastery, setShowMastery] = useState(false);

    const handleEvaluation = (result: ProgressEvaluation) => {
        toast.success(result.feedback_message);

        // Actually apply difficulty adjustment to the roadmap
        if (result.difficulty_adjustment !== 'maintain') {
            toast.info(`Roadmap Difficulty Adjusted: ${result.difficulty_adjustment.toUpperCase()}`);
            setRoadmap(prev => {
                const updated = structuredClone(prev);
                const weeks = [updated.week_1, updated.week_2, updated.week_3, updated.week_4];
                for (const week of weeks) {
                    if (result.difficulty_adjustment === 'increase') {
                        // Intensify: add depth note to theory items
                        week.theory = week.theory.map(t => t.includes("[Advanced]") ? t : `[Advanced] ${t}`);
                        week.milestones = [...week.milestones, "Stretch: exceed baseline expectations"];
                    } else if (result.difficulty_adjustment === 'reduce') {
                        // Ease: add consolidation note and simplify labels
                        week.theory = week.theory.map(t => t.replace("[Advanced] ", ""));
                        week.milestones = week.milestones.filter(m => !m.includes("Stretch"));
                    }
                    // 'pivot' — the roadmap focus itself may need replacing; surface via toast for now
                }
                return updated;
            });
        }

        setSelectedWeek(null);
    };

    // Derive dynamic data from copilot state for child components
    const careerEvalOverall = copilotState?.careerEval?.overall ?? null;
    const velocityLog = copilotState?.velocityLog ?? [];
    const bottlenecks = copilotState?.gapAnalysis?.bottleneck_concepts.map(b => b.concept) ?? [];
    const masteryDepth = copilotState?.careerEval?.overall?.competition_readiness_score ?? 0;
    const implScore = copilotState?.careerEval?.overall?.internship_readiness_score ?? 0;
    const velocityTrend = velocityLog.length >= 2 ? "stable" : "unknown";
    const depsSatisfied = (copilotState?.gapAnalysis?.bottleneck_concepts.length ?? 99) <= 2;

    return (
        <div className="space-y-6">
            <ProgressModal
                roadmap={roadmap}
                week={selectedWeek || 1}
                isOpen={!!selectedWeek}
                onClose={() => setSelectedWeek(null)}
                onEvaluation={handleEvaluation}
            />

            <ChallengeModal
                isOpen={showChallenge}
                onClose={() => setShowChallenge(false)}
                topic={roadmap.week_1.focus}
                level={roadmap.advanced_readiness_indicator.split(" ")[0] || "Advanced"}
            />

            <CareerModal
                isOpen={showCareer}
                onClose={() => setShowCareer(false)}
            />

            <MasteryModal
                isOpen={showMastery}
                onClose={() => setShowMastery(false)}
                careerEval={careerEvalOverall}
                velocityMetrics={copilotState ? { trend: velocityTrend } : undefined}
                bottlenecks={bottlenecks.length > 0 ? bottlenecks : undefined}
            />

            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Target className="h-5 w-5 text-emerald-400" />
                    4-Week Mastery Plan
                </h3>
                <div className="flex items-center gap-2">
                    <ThresholdStatus
                        masteryDepth={masteryDepth}
                        implementationScore={implScore}
                        velocityStatus={velocityTrend as "stable" | "volatile"}
                        dependenciesSatisfied={depsSatisfied}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        className="bg-cyan-950/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/30 text-xs h-7"
                        onClick={() => setShowMastery(true)}
                    >
                        <Calendar className="h-3 w-3 mr-1.5" /> Optimize Schedule
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="bg-violet-950/10 border-violet-500/30 text-violet-400 hover:bg-violet-950/30 text-xs h-7"
                        onClick={() => setShowCareer(true)}
                    >
                        <GraduationCap className="h-3 w-3 mr-1.5" /> Career Forecast
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="bg-red-950/10 border-red-500/30 text-red-400 hover:bg-red-950/30 text-xs h-7"
                        onClick={() => setShowChallenge(true)}
                    >
                        <Swords className="h-3 w-3 mr-1.5" /> Mentor Challenge
                    </Button>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                        Target: {roadmap.advanced_readiness_indicator}
                    </Badge>
                </div>
            </div>

            {/* Timeline */}
            <div className="relative pl-8 border-l border-emerald-500/20 space-y-8">
                <WeekNode
                    week={1}
                    data={roadmap.week_1}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                    border="border-blue-500/20"
                    onCheckIn={() => setSelectedWeek(1)}
                />
                <WeekNode
                    week={2}
                    data={roadmap.week_2}
                    color="text-purple-400"
                    bg="bg-purple-500/10"
                    border="border-purple-500/20"
                    onCheckIn={() => setSelectedWeek(2)}
                />
                <WeekNode
                    week={3}
                    data={roadmap.week_3}
                    color="text-orange-400"
                    bg="bg-orange-500/10"
                    border="border-orange-500/20"
                    onCheckIn={() => setSelectedWeek(3)}
                />
                <WeekNode
                    week={4}
                    data={roadmap.week_4}
                    color="text-red-400"
                    bg="bg-red-500/10"
                    border="border-red-500/20"
                    onCheckIn={() => setSelectedWeek(4)}
                />
            </div>

            {/* Success Metrics */}
            <div className="bg-black/40 border border-emerald-500/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                    <Trophy className="h-4 w-4" /> Success Metrics
                </h4>
                <div className="flex flex-wrap gap-2">
                    {roadmap.success_metrics.map((metric, i) => (
                        <Badge key={i} variant="secondary" className="bg-emerald-900/20 text-emerald-300 border border-emerald-500/10">
                            {metric}
                        </Badge>
                    ))}
                </div>
            </div>
        </div>
    );
}

function WeekNode({ week, data, color, bg, border, onCheckIn }: { week: number, data: WeeklyPlan, color: string, bg: string, border: string, onCheckIn: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: week * 0.1 }}
            className="relative"
        >
            {/* Timeline Dot */}
            <div className={`absolute -left-[39px] top-0 h-5 w-5 rounded-full border-2 border-black ${bg.replace("/10", "")} ${color}`} />

            <div className={`p-4 rounded-lg border ${border} ${bg}`}>
                <div className="flex justify-between items-start mb-2">
                    <h4 className={`text-base font-bold ${color}`}>Week {week}: {data.focus}</h4>
                    <Button
                        size="sm"
                        variant="ghost"
                        className={`h-6 text-[10px] ${color} hover:bg-white/5 border border-white/5`}
                        onClick={onCheckIn}
                    >
                        <RefreshCw className="h-3 w-3 mr-1" /> Check-in
                    </Button>
                </div>

                <div className="space-y-4">
                    {/* Sections */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <BookOpen className="h-3 w-3" /> Theory
                            </span>
                            <ul className="text-xs text-white/80 list-disc list-inside space-y-0.5">
                                {data.theory.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Code className="h-3 w-3" /> Practice
                            </span>
                            <ul className="text-xs text-white/80 list-disc list-inside space-y-0.5">
                                {data.implementation.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                        </div>
                    </div>

                    {/* Milestones */}
                    <div className="bg-black/20 rounded p-2 border border-white/5">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                            <CheckCircle className="h-3 w-3" /> Milestones
                        </span>
                        <div className="flex flex-wrap gap-1">
                            {data.milestones.map((m, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] h-5 border-white/10 text-white/70">
                                    {m}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Mini Project */}
                    <div className="pt-2 border-t border-white/5">
                        <div className="flex items-start gap-2">
                            <Lightbulb className={`h-4 w-4 ${color} mt-0.5`} />
                            <div>
                                <h5 className={`text-sm font-medium ${color}`}>Capstone: {data.mini_project}</h5>
                                <p className="text-xs text-muted-foreground mt-0.5 italic">"{data.reflection_prompt}"</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
