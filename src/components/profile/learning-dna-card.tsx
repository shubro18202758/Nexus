"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, BrainCircuit, Zap, Target, BookOpen } from "lucide-react";
import { analyzeUserProfile, type LearningProfileAnalysis } from "@/lib/ai/learning-diagnostician";
import { getLearningProfile, saveLearningProfile, getUserContext } from "@/app/actions/profile-actions";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export function LearningDNACard() {
    const [profile, setProfile] = useState<LearningProfileAnalysis | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        setIsLoading(true);
        const data = await getLearningProfile();
        if (data) {
            // Map DB snake_case to frontend interface if needed, or consistent
            // DB has snake_case columns but Drizzle returns camelCase if configured?
            // Drizzle returns camelCase keys matching schema definitions usually if they are defined that way.
            // My schema has `primaryDomains: jsonb("primary_domains")`. So it returns `primaryDomains`.
            // My interface `LearningProfileAnalysis` uses snake_case keys `primary_domains`.
            // I should map them.
            setProfile({
                level: data.level as any,
                primary_domains: (data.primaryDomains as string[]) || [],
                secondary_domains: (data.secondaryDomains as string[]) || [],
                weak_concepts: (data.weakConcepts as string[]) || [],
                strong_concepts: (data.strongConcepts as string[]) || [],
                learning_style: data.learningStyle || "",
                goal_type: (data.goalType as any) || "exploration",
                confidence_score: (data.confidenceScore || 0) / 100,
            });
        }
        setIsLoading(false);
    };

    const handleRunDiagnostics = async () => {
        setIsAnalyzing(true);
        try {
            toast.info("🧠 Extracting Neural Context...");
            const context = await getUserContext();

            toast.info("🤖 DeepSeek R1 Analyzing Learning Patterns...");
            const analysis = await analyzeUserProfile(context || "User has no history yet.");

            toast.info("💾 Saving Learning DNA...");
            await saveLearningProfile(analysis);

            setProfile(analysis);
            toast.success("Learning DNA Updated!");
        } catch (error) {
            toast.error("Diagnosis Failed: " + String(error));
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (isLoading) {
        return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-cyan-500" /></div>;
    }

    return (
        <Card className="bg-black/40 border-cyan-500/30 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <BrainCircuit className="h-5 w-5 text-cyan-400" />
                        Learning DNA
                    </CardTitle>
                    <CardDescription>
                        AI-generated cognitive profile based on your interactions.
                    </CardDescription>
                </div>
                <Button
                    onClick={handleRunDiagnostics}
                    disabled={isAnalyzing}
                    variant="outline"
                    className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-950"
                >
                    {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    {isAnalyzing ? "Analyzing..." : "Run Diagnostics"}
                </Button>
            </CardHeader>

            <CardContent>
                <AnimatePresence mode="wait">
                    {profile ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-6"
                        >
                            {/* Level & Confidence */}
                            <div className="flex items-center gap-6">
                                <div className="relative h-24 w-24 flex items-center justify-center rounded-full border-4 border-cyan-500/20 bg-black/50">
                                    <div className="absolute inset-0 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin-slow" style={{ animationDuration: '3s' }} />
                                    <div className="text-center">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Level</div>
                                        <div className="font-bold text-cyan-300">{profile.level}</div>
                                    </div>
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">AI Confidence Score</span>
                                        <span className="text-cyan-400">{Math.round(profile.confidence_score * 100)}%</span>
                                    </div>
                                    <Progress value={profile.confidence_score * 100} className="h-2 bg-white/10" />
                                    <div className="flex gap-2 mt-2">
                                        <Badge variant="outline" className="border-purple-500/50 text-purple-300">
                                            {profile.learning_style}
                                        </Badge>
                                        <Badge variant="outline" className="border-green-500/50 text-green-300">
                                            {profile.goal_type}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Skills Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/5">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-green-400">
                                        <Target className="h-4 w-4" /> Strong Concepts
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {profile.strong_concepts.map(c => (
                                            <Badge key={c} className="bg-green-500/10 text-green-300 hover:bg-green-500/20 border-0">
                                                {c}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/5">
                                    <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                                        <BookOpen className="h-4 w-4" /> Weak Areas
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {profile.weak_concepts.map(c => (
                                            <Badge key={c} className="bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border-0">
                                                {c}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>

                        </motion.div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <BrainCircuit className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>No learning profile yet. Run diagnostics to generate your Learning DNA.</p>
                        </div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    );
}
