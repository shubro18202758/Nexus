"use client";

import { useState } from "react";
import { type ChallengeSet } from "@/lib/ai/challenge-generator";
import { type AdaptiveRoadmap } from "@/lib/ai/roadmap-planner";
import { createChallenge } from "@/app/actions/plan-actions";
import { getLearningProfile } from "@/app/actions/profile-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Swords, Code, Server, AlertTriangle, Compass, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface ChallengeModalProps {
    isOpen: boolean;
    onClose: () => void;
    topic: string;
    level: string;
}

export function ChallengeModal({ isOpen, onClose, topic, level }: ChallengeModalProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [challenges, setChallenges] = useState<ChallengeSet | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            toast.info(`Designing challenges for ${topic}...`);
            const profile = await getLearningProfile();

            // Dynamic import for client-side execution if needed, or use server action wrapper
            const generator = await import("@/lib/ai/challenge-generator");
            const result = await generator.generateChallenges(profile, topic, level);

            setChallenges(result);
            // Log generation
            await createChallenge(topic, level);
            toast.success("Challenges Ready!");

        } catch (error) {
            console.error(error);
            toast.error("Failed to generate challenges");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-black/95 border-red-900/40 text-white max-w-3xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-red-500/90 flex items-center gap-2 text-xl font-bold tracking-tight">
                        <Swords className="h-6 w-6" /> Implementation Challenge
                    </DialogTitle>
                    <DialogDescription className="text-red-200/50">
                        Prove your mastery with these targeted scenarios.
                    </DialogDescription>
                </DialogHeader>

                {!challenges ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                        <div className="text-center space-y-2">
                            <h3 className="text-lg font-medium text-white/80">Ready to test your {topic} skills?</h3>
                            <p className="text-sm text-white/50 max-w-md">
                                The AI Mentor will generate 4 levels of challenges tailored to your current gaps.
                            </p>
                        </div>
                        <Button
                            size="lg"
                            className="bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/30"
                            onClick={handleGenerate}
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Designing Scenarios...
                                </>
                            ) : (
                                <>
                                    <Target className="h-5 w-5 mr-2" /> Generate Challenges
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center gap-2 mb-4">
                            {challenges.skills_tested.map((skill, i) => (
                                <Badge key={i} variant="outline" className="border-red-500/20 text-red-300/70 text-[10px]">
                                    {skill}
                                </Badge>
                            ))}
                        </div>

                        <Tabs defaultValue="micro" className="flex-1 flex flex-col min-h-0">
                            <TabsList className="grid w-full grid-cols-4 bg-red-950/20 border border-red-900/30">
                                <TabsTrigger value="micro" className="data-[state=active]:bg-red-900/40 data-[state=active]:text-red-200">Micro</TabsTrigger>
                                <TabsTrigger value="system" className="data-[state=active]:bg-red-900/40 data-[state=active]:text-red-200">System</TabsTrigger>
                                <TabsTrigger value="realworld" className="data-[state=active]:bg-red-900/40 data-[state=active]:text-red-200">Real World</TabsTrigger>
                                <TabsTrigger value="explore" className="data-[state=active]:bg-red-900/40 data-[state=active]:text-red-200">Explore</TabsTrigger>
                            </TabsList>

                            <div className="flex-1 overflow-hidden mt-4 bg-black/40 rounded-lg border border-white/5 p-4">
                                <ScrollArea className="h-full pr-4">
                                    <TabsContent value="micro" className="mt-0 space-y-4">
                                        <div className="flex items-center gap-2 text-cyan-400 font-bold">
                                            <Code className="h-5 w-5" /> Micro-Coding Task (1-2 Hrs)
                                        </div>
                                        <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                                            {challenges.micro_challenge}
                                        </p>
                                    </TabsContent>

                                    <TabsContent value="system" className="mt-0 space-y-4">
                                        <div className="flex items-center gap-2 text-purple-400 font-bold">
                                            <Server className="h-5 w-5" /> System Design (Half-Day)
                                        </div>
                                        <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                                            {challenges.system_challenge}
                                        </p>
                                    </TabsContent>

                                    <TabsContent value="realworld" className="mt-0 space-y-4">
                                        <div className="flex items-center gap-2 text-amber-400 font-bold">
                                            <AlertTriangle className="h-5 w-5" /> Production Simulation
                                        </div>
                                        <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                                            {challenges.real_world_challenge}
                                        </p>
                                    </TabsContent>

                                    <TabsContent value="explore" className="mt-0 space-y-4">
                                        <div className="flex items-center gap-2 text-emerald-400 font-bold">
                                            <Compass className="h-5 w-5" /> Open-Ended Exploration
                                        </div>
                                        <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                                            {challenges.exploration_challenge}
                                        </p>
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
