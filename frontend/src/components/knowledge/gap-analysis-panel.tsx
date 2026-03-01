"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, BookOpen, ExternalLink, Loader2, Sparkles, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type RoadmapGraph } from "@/lib/ai/roadmap-architect";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { type GapAnalysisResult, analyzeGaps } from "@/lib/ai/cognitive-analyzer";
import { type CuratedLearningPath } from "@/lib/ai/content-curator";
import { type AdaptiveRoadmap } from "@/lib/ai/roadmap-planner";
import { AdaptiveTimeline } from "./adaptive-timeline";
import { searchForLearningResources } from "@/app/actions/analysis-actions";
import { getLearningProfile } from "@/app/actions/profile-actions";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Book, Code, Lightbulb, PlayCircle, Layers, Target, FileText } from "lucide-react";

interface GapAnalysisPanelProps {
    graph: RoadmapGraph | null;
}

export function GapAnalysisPanel({ graph }: GapAnalysisPanelProps) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<GapAnalysisResult | null>(null);
    const [curatedPaths, setCuratedPaths] = useState<Record<string, CuratedLearningPath>>({});
    const [plans, setPlans] = useState<Record<string, AdaptiveRoadmap>>({});
    const [loadingTopic, setLoadingTopic] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!graph) return;
        setIsAnalyzing(true);
        try {
            const profile = await getLearningProfile();
            // Dynamic import since cognitive-analyzer uses LLMEngine (Client)
            const analyzer = await import("@/lib/ai/cognitive-analyzer");
            const analysis = await analyzer.analyzeGaps(graph, profile || {});
            setResult(analysis);
            toast.success("Cognitive Analysis Complete");
        } catch (error) {
            console.error(error);
            toast.error("Analysis Failed");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCurate = async (topic: string, reason: string) => {
        if (curatedPaths[topic]) return;
        setLoadingTopic(topic);
        try {
            toast.info(`Curating high-signal content for: ${topic}...`);

            // 1. Fetch raw resources (broad search)
            const res = await searchForLearningResources(topic, 10);

            if (!res.success || !res.resources || res.resources.length === 0) {
                toast.error("No base resources found to curate.");
                return;
            }

            // 2. Curate using AI
            const profile = await getLearningProfile();
            const curator = await import("@/lib/ai/content-curator");
            const curated = await curator.curateResources(profile || {}, [reason], res.resources);

            setCuratedPaths(prev => ({ ...prev, [topic]: curated }));
            toast.success("Learning Path Curated!");

        } catch (error) {
            console.error(error);
            toast.error("Curation failed");
        } finally {
            setLoadingTopic(null);
        }
    };

    const handleGeneratePlan = async (topic: string) => {
        if (!curatedPaths[topic]) return;
        setLoadingTopic(topic);
        try {
            toast.info(`Generating 4-Week Plan for: ${topic}...`);
            const profile = await getLearningProfile();
            const planner = await import("@/lib/ai/roadmap-planner");
            // Call AI
            const plan = await planner.generateAdaptivePlan(
                profile || {},
                curatedPaths[topic],
                topic
            );

            // Store plan in state (extending curatedPaths or new state)
            // For simplicity, let's just update curatedPaths to include the plan?
            // Actually, `CuratedLearningPath` type doesn't have it.
            // Let's create a new state `plans`.
            setPlans(prev => ({ ...prev, [topic]: plan }));
            toast.success("Adaptive Roadmap Generated!");

        } catch (error) {
            console.error(error);
            toast.error("Planning failed");
        } finally {
            setLoadingTopic(null);
        }
    };

    if (!graph) return null;

    return (
        <Card className="bg-black/40 border-red-500/20 backdrop-blur-sm h-[600px] flex flex-col w-[350px]">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-red-400">
                    <Sparkles className="h-5 w-5" />
                    Cognitive Analyzer
                </CardTitle>
                <CardDescription>Why am I stuck? Identify gaps.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-4 pt-0 flex flex-col gap-4">
                {!result ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            Analyze your roadmap to find bottlenecks and missing conceptual bridges.
                        </p>
                        <Button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="bg-red-900/50 hover:bg-red-900 text-red-100 border border-red-500/50"
                        >
                            {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                            Run Deep Diagnosis
                        </Button>
                    </div>
                ) : (
                    <ScrollArea className="h-full pr-4">
                        <div className="space-y-6">
                            {/* Confidence */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>AI Confidence</span>
                                <Badge variant="outline" className="border-red-500/30 text-red-400">
                                    {Math.round(result.confidence * 100)}%
                                </Badge>
                            </div>

                            {/* Bottlenecks */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" /> Bottlenecks
                                </h4>
                                {result.bottleneck_concepts.map((item, i) => (
                                    <div key={i} className="bg-red-950/30 p-3 rounded-md border border-red-500/20 text-sm">
                                        <div className="font-medium text-red-200">{item.concept}</div>
                                        <div className="text-xs text-red-400/80 mt-1">{item.reason}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Bridge Topics */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                                    <BookOpen className="h-4 w-4" /> Missing Bridges
                                </h4>
                                {result.bridge_topics.map((item, i) => (
                                    <div key={i} className="bg-amber-950/30 p-3 rounded-md border border-amber-500/20 text-sm space-y-2">
                                        <div>
                                            <div className="font-medium text-amber-200">{item.topic}</div>
                                            <div className="text-xs text-amber-400/80 mt-1">{item.relevance}</div>
                                        </div>

                                        {/* Curated Content */}
                                        {curatedPaths[item.topic] ? (
                                            <div className="mt-3 space-y-4 animate-in fade-in slide-in-from-top-2">

                                                {/* Why This Sequence */}
                                                <div className="bg-blue-950/20 p-2 rounded text-xs text-blue-300 italic">
                                                    "{curatedPaths[item.topic].why_this_sequence}"
                                                </div>

                                                {/* Micro Learning */}
                                                <div className="space-y-2">
                                                    <h5 className="text-xs font-semibold text-green-400 flex items-center gap-1">
                                                        <PlayCircle className="h-3 w-3" /> Quick Wins (Micro-Learning)
                                                    </h5>
                                                    <div className="grid gap-2">
                                                        {curatedPaths[item.topic].micro_learning.map((res, idx) => (
                                                            <ResourceCard key={idx} res={res} />
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Deep Dive */}
                                                <div className="space-y-2">
                                                    <h5 className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                                                        <Book className="h-3 w-3" /> Deep Dive
                                                    </h5>
                                                    <div className="grid gap-2">
                                                        {curatedPaths[item.topic].deep_dive.map((res, idx) => (
                                                            <ResourceCard key={idx} res={res} />
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Implementation */}
                                                <div className="space-y-2">
                                                    <h5 className="text-xs font-semibold text-orange-400 flex items-center gap-1">
                                                        <Code className="h-3 w-3" /> Build It
                                                    </h5>
                                                    <div className="grid gap-2">
                                                        {curatedPaths[item.topic].implementation.map((res, idx) => (
                                                            <ResourceCard key={idx} res={res} />
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Project Idea */}
                                                <div className="bg-gradient-to-br from-pink-900/20 to-purple-900/20 p-3 rounded border border-pink-500/20">
                                                    <h5 className="text-xs font-bold text-pink-300 flex items-center gap-1 mb-1">
                                                        <Lightbulb className="h-3 w-3" /> Project Challenge
                                                    </h5>
                                                    <p className="text-xs text-pink-100/80">
                                                        {curatedPaths[item.topic].project_suggestion}
                                                    </p>
                                                </div>

                                                {/* Adaptive Plan Button */}
                                                {!plans[item.topic] ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full h-8 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                                                        onClick={() => handleGeneratePlan(item.topic)}
                                                        disabled={loadingTopic === item.topic}
                                                    >
                                                        {loadingTopic === item.topic ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Target className="h-3 w-3 mr-2" />}
                                                        Generate 4-Week Plan
                                                    </Button>
                                                ) : (
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button size="sm" className="w-full bg-emerald-600/80 hover:bg-emerald-600 text-white h-8 text-xs">
                                                                <FileText className="h-3 w-3 mr-2" /> View Adaptive Plan
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-black/90 border-emerald-500/30">
                                                            <AdaptiveTimeline roadmap={plans[item.topic]} />
                                                        </DialogContent>
                                                    </Dialog>
                                                )}
                                            </div>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="w-full h-7 text-xs border border-amber-500/30 hover:bg-amber-500/10 text-amber-300 mt-2"
                                                onClick={() => handleCurate(item.topic, item.relevance)}
                                                disabled={loadingTopic === item.topic}
                                            >
                                                {loadingTopic === item.topic ? (
                                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                ) : (
                                                    <Layers className="h-3 w-3 mr-1" />
                                                )}
                                                Curate Learning Path
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>

                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}

function ResourceCard({ res }: { res: { title: string, url: string, description: string } }) {
    return (
        <a
            href={res.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded bg-black/40 hover:bg-black/60 transition-colors group border border-white/5"
        >
            <div className="text-xs font-medium text-blue-400 flex items-center gap-1 group-hover:underline truncate">
                {res.title} <ExternalLink className="h-3 w-3 opacity-50" />
            </div>
            {res.description && (
                <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {res.description}
                </div>
            )}
        </a>
    );
}
