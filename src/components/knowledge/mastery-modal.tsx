"use client";

import { useState } from "react";
import { type MasteryPlan, type MasteryWeek } from "@/lib/ai/mastery-planner";
import { getLearningProfile } from "@/app/actions/profile-actions";
import { createMasteryPlan } from "@/app/actions/plan-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Calendar, BookOpen, Code, Lightbulb, AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";

import { type CareerReadiness } from "@/lib/ai/career-evaluator";

interface MasteryModalProps {
    isOpen: boolean;
    onClose: () => void;
    careerEval?: CareerReadiness | null;
    velocityMetrics?: { trend: string } | null;
    bottlenecks?: string[];
}

export function MasteryModal({ isOpen, onClose, careerEval, velocityMetrics, bottlenecks }: MasteryModalProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [plan, setPlan] = useState<MasteryPlan | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            toast.info("Designing your 3-week mastery schedule...");
            const profile = await getLearningProfile();

            // Dynamic import
            const planner = await import("@/lib/ai/mastery-planner");
            // Use real copilot state data when available, fallback to reasonable defaults
            const generatedPlan = await planner.generateMasteryPlan(
                profile,
                careerEval ?? null,
                velocityMetrics ?? { velocity: "Unknown" },
                bottlenecks ?? (Array.isArray(profile?.weakConcepts) ? profile.weakConcepts as string[] : ["General mastery"])
            );

            setPlan(generatedPlan);
            await createMasteryPlan("Mastery");
            toast.success("Schedule Ready!");

        } catch (error) {
            console.error(error);
            toast.error("Failed to generate mastery plan");
        } finally {
            setIsGenerating(false);
        }
    };

    const renderWeek = (weekData: MasteryWeek) => (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-cyan-400">Focus: {weekData.focus}</h4>
                <div className="flex gap-2">
                    {weekData.deliverables.map((d, i) => (
                        <Badge key={i} variant="outline" className="border-cyan-500/20 text-cyan-300 text-[10px]">
                            {d}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {weekData.schedule.map((day, i) => (
                    <Card key={i} className="bg-black/40 border-white/5 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary" className="bg-white/10 text-white/80 w-20 justify-center">
                                {day.day}
                            </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div className="space-y-1">
                                <span className="text-amber-400/70 font-medium flex items-center gap-1">
                                    <BookOpen className="h-3 w-3" /> Morning (Theory)
                                </span>
                                <p className="text-white/60">{day.morning_theory}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-cyan-400/70 font-medium flex items-center gap-1">
                                    <Code className="h-3 w-3" /> Afternoon (Build)
                                </span>
                                <p className="text-white/60">{day.afternoon_implementation}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-purple-400/70 font-medium flex items-center gap-1">
                                    <Lightbulb className="h-3 w-3" /> Evening (Review)
                                </span>
                                <p className="text-white/60">{day.evening_review}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-black/95 border-cyan-900/40 text-white max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-cyan-400 flex items-center gap-2 text-xl font-bold tracking-tight">
                        <Calendar className="h-6 w-6" /> Adaptive Mastery Planner
                    </DialogTitle>
                    <DialogDescription className="text-cyan-200/50">
                        High-intensity 3-week schedule adjusted to your velocity.
                    </DialogDescription>
                </DialogHeader>

                {!plan ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                        <div className="text-center space-y-2">
                            <h3 className="text-lg font-medium text-white/80">Ready to commit?</h3>
                            <p className="text-sm text-white/50 max-w-md">
                                The AI will generate a day-by-day schedule combining theory, coding, and review.
                            </p>
                        </div>
                        <Button
                            size="lg"
                            className="bg-cyan-900/20 hover:bg-cyan-900/40 text-cyan-400 border border-cyan-500/30"
                            onClick={handleGenerate}
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> optimizing Schedule...
                                </>
                            ) : (
                                <>
                                    <TrendingUp className="h-5 w-5 mr-2" /> Generate 3-Week Plan
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        {/* Metrics Bar */}
                        <div className="flex items-center justify-between bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-3">
                            <div className="flex items-center gap-4">
                                <div>
                                    <div className="text-xs text-white/50">Expected Gain</div>
                                    <div className="text-lg font-bold text-emerald-400">+{plan.expected_readiness_gain}</div>
                                </div>
                                <div className="h-8 w-px bg-white/10" />
                                <div>
                                    <div className="text-xs text-white/50">Burnout Risk</div>
                                    <Badge
                                        variant="outline"
                                        className={`mt-0.5 ${plan.risk_of_burnout === 'high' ? 'border-red-500 text-red-400' :
                                                plan.risk_of_burnout === 'medium' ? 'border-amber-500 text-amber-400' :
                                                    'border-emerald-500 text-emerald-400'
                                            }`}
                                    >
                                        {plan.risk_of_burnout.toUpperCase()}
                                    </Badge>
                                </div>
                            </div>
                            {plan.burnout_reasoning && (
                                <div className="text-xs text-white/40 max-w-xs text-right hidden md:block">
                                    <AlertTriangle className="h-3 w-3 inline mr-1 text-amber-500" />
                                    {plan.burnout_reasoning}
                                </div>
                            )}
                        </div>

                        {/* Weeks Tabs */}
                        <Tabs defaultValue="week1" className="flex-1 flex flex-col min-h-0">
                            <TabsList className="grid w-full grid-cols-3 bg-cyan-950/20 border border-cyan-900/30">
                                <TabsTrigger value="week1" className="data-[state=active]:bg-cyan-900/40 data-[state=active]:text-cyan-200">
                                    Week 1
                                </TabsTrigger>
                                <TabsTrigger value="week2" className="data-[state=active]:bg-cyan-900/40 data-[state=active]:text-cyan-200">
                                    Week 2
                                </TabsTrigger>
                                <TabsTrigger value="week3" className="data-[state=active]:bg-cyan-900/40 data-[state=active]:text-cyan-200">
                                    Week 3
                                </TabsTrigger>
                            </TabsList>

                            <div className="flex-1 overflow-hidden mt-4 bg-black/40 rounded-lg border border-white/5 p-4">
                                <ScrollArea className="h-full pr-4">
                                    <TabsContent value="week1" className="mt-0">
                                        {renderWeek(plan.week_1)}
                                    </TabsContent>
                                    <TabsContent value="week2" className="mt-0">
                                        {renderWeek(plan.week_2)}
                                    </TabsContent>
                                    <TabsContent value="week3" className="mt-0">
                                        {renderWeek(plan.week_3)}
                                    </TabsContent>
                                </ScrollArea>
                            </div>
                        </Tabs>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
