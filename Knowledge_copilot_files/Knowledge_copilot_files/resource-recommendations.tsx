"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    type LevelBasedRecommendations,
    type ResourceRecommendation,
    type RecommendationRequest,
    generateResourceRecommendations,
    quickRecommend,
    suggestProjects
} from "@/lib/ai/resource-recommender";
import { getLearningProfile } from "@/app/actions/profile-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
    Loader2,
    Sparkles,
    BookOpen,
    Youtube,
    FileText,
    Code,
    ExternalLink,
    Clock,
    Target,
    TrendingUp,
    Lightbulb,
    Layers,
    GraduationCap,
    Rocket,
    Search,
    RefreshCw,
    CheckCircle2,
    AlertCircle
} from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
    article: FileText,
    video: Youtube,
    tutorial: Code,
    documentation: BookOpen,
    project: Rocket,
    course: GraduationCap,
    github: Code,
};

const DIFFICULTY_COLORS: Record<string, string> = {
    beginner: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    intermediate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    advanced: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface ResourceRecommendationsProps {
    initialTopic?: string;
}

export function ResourceRecommendations({ initialTopic }: ResourceRecommendationsProps) {
    const [topic, setTopic] = useState(initialTopic || "");
    const [isLoading, setIsLoading] = useState(false);
    const [recommendations, setRecommendations] = useState<LevelBasedRecommendations | null>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [userLevel, setUserLevel] = useState<"Beginner" | "Intermediate" | "Advanced">("Intermediate");
    const [activeTab, setActiveTab] = useState("for-you");

    // Fetch user's level from profile on mount
    useEffect(() => {
        async function loadProfile() {
            const profile = await getLearningProfile();
            if (profile?.level) {
                setUserLevel(profile.level as any);
            }
        }
        loadProfile();
    }, []);

    const handleSearch = async () => {
        if (!topic.trim()) {
            toast.error("Please enter a topic to search");
            return;
        }

        setIsLoading(true);
        try {
            toast.info(`Finding ${userLevel.toLowerCase()}-level resources for ${topic}...`);

            const profile = await getLearningProfile();

            const request: RecommendationRequest = {
                topic: topic.trim(),
                currentLevel: userLevel,
                learningStyle: profile?.learningStyle || undefined,
                goalType: profile?.goalType || undefined,
                weakConcepts: Array.isArray(profile?.weakConcepts) ? profile.weakConcepts as string[] : undefined,
                strongConcepts: Array.isArray(profile?.strongConcepts) ? profile.strongConcepts as string[] : undefined,
            };

            const [recs, projs] = await Promise.all([
                generateResourceRecommendations(request),
                suggestProjects(topic.trim(), userLevel, request.strongConcepts || [])
            ]);

            setRecommendations(recs);
            setProjects(projs);
            toast.success("Personalized recommendations ready!");

        } catch (error) {
            console.error(error);
            toast.error("Failed to generate recommendations. Is the AI model running?");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="bg-black/40 border-purple-500/20 backdrop-blur-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-purple-400">
                    <Sparkles className="h-5 w-5" />
                    Personalized Learning Resources
                </CardTitle>
                <CardDescription>
                    AI-curated articles, tutorials, and projects matched to your {userLevel.toLowerCase()} level
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Search Bar + Level Selector */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="What do you want to learn? (e.g., React Hooks, System Design)"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="pl-10 bg-black/50 border-purple-500/30 text-white placeholder:text-white/40"
                        />
                    </div>
                    <div className="flex gap-1 bg-black/40 border border-white/10 rounded-md p-1">
                        {(["Beginner", "Intermediate", "Advanced"] as const).map((level) => (
                            <Button
                                key={level}
                                size="sm"
                                variant="ghost"
                                className={`h-8 text-xs ${userLevel === level
                                    ? "bg-purple-500/20 text-purple-300"
                                    : "text-muted-foreground hover:text-white"
                                    }`}
                                onClick={() => setUserLevel(level)}
                            >
                                {level}
                            </Button>
                        ))}
                    </div>
                    <Button
                        onClick={handleSearch}
                        disabled={isLoading || !topic.trim()}
                        className="bg-purple-600 hover:bg-purple-500 text-white"
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Results */}
                <AnimatePresence mode="wait">
                    {recommendations && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-4"
                        >
                            {/* Learning Strategy Banner */}
                            <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <Lightbulb className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-amber-400 mb-1">Your Learning Path</h4>
                                        <p className="text-xs text-white/70">{recommendations.curated_sequence}</p>
                                        <p className="text-xs text-purple-300/70 mt-2 italic">{recommendations.learning_strategy}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs */}
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="grid w-full grid-cols-4 bg-black/40 border border-white/10">
                                    <TabsTrigger value="for-you" className="text-xs data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                                        <Target className="h-3 w-3 mr-1" /> For You
                                    </TabsTrigger>
                                    <TabsTrigger value="stretch" className="text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
                                        <TrendingUp className="h-3 w-3 mr-1" /> Stretch
                                    </TabsTrigger>
                                    <TabsTrigger value="gaps" className="text-xs data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300">
                                        <AlertCircle className="h-3 w-3 mr-1" /> Fill Gaps
                                    </TabsTrigger>
                                    <TabsTrigger value="projects" className="text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
                                        <Rocket className="h-3 w-3 mr-1" /> Build
                                    </TabsTrigger>
                                </TabsList>

                                <div className="mt-3">
                                    <TabsContent value="for-you" className="mt-0">
                                        <ResourceList resources={recommendations.for_your_level} />
                                    </TabsContent>
                                    <TabsContent value="stretch" className="mt-0">
                                        <ResourceList resources={recommendations.stretch_goals} />
                                    </TabsContent>
                                    <TabsContent value="gaps" className="mt-0">
                                        <ResourceList resources={recommendations.foundational_gaps} />
                                    </TabsContent>
                                    <TabsContent value="projects" className="mt-0">
                                        <ProjectList projects={projects} implementationResources={recommendations.implementation_projects} />
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Empty State */}
                {!recommendations && !isLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Enter a topic to get personalized resource recommendations</p>
                        <p className="text-xs mt-1 opacity-70">The AI will match resources to your {userLevel.toLowerCase()} skill level</p>
                    </div>
                )}

                {isLoading && (
                    <div className="text-center py-8">
                        <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-purple-400" />
                        <p className="text-sm text-muted-foreground">Curating {userLevel.toLowerCase()}-level resources...</p>
                        <Progress value={33} className="w-48 mx-auto mt-3 h-1" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ResourceList({ resources }: { resources: ResourceRecommendation[] }) {
    if (!resources || resources.length === 0) {
        return (
            <div className="text-center py-4 text-muted-foreground text-sm">
                No resources in this category
            </div>
        );
    }

    return (
        <ScrollArea className="h-[300px] pr-2">
            <div className="space-y-3">
                {resources.map((resource, idx) => (
                    <ResourceCard key={idx} resource={resource} index={idx} />
                ))}
            </div>
        </ScrollArea>
    );
}

function ResourceCard({ resource, index }: { resource: ResourceRecommendation; index: number }) {
    const Icon = TYPE_ICONS[resource.type] || FileText;
    const difficultyClass = DIFFICULTY_COLORS[resource.difficulty] || DIFFICULTY_COLORS.intermediate;

    return (
        <motion.a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="block p-3 rounded-lg bg-black/40 hover:bg-black/60 border border-white/5 hover:border-purple-500/30 transition-all group"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-purple-500/10 text-purple-400 shrink-0">
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-white group-hover:text-purple-300 truncate">
                            {resource.title}
                        </h4>
                        <ExternalLink className="h-3 w-3 text-white/30 group-hover:text-purple-400 shrink-0" />
                    </div>
                    <p className="text-xs text-white/60 line-clamp-2 mb-2">
                        {resource.why_recommended}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] h-5 ${difficultyClass}`}>
                            {resource.difficulty}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-5 border-white/10 text-white/50">
                            <Clock className="h-2.5 w-2.5 mr-1" />
                            {resource.estimated_time}
                        </Badge>
                        {resource.implementation_focus && (
                            <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/30 text-emerald-400">
                                <Code className="h-2.5 w-2.5 mr-1" />
                                Hands-on
                            </Badge>
                        )}
                        {resource.tags?.slice(0, 2).map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] h-5 bg-white/5 text-white/40">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>
        </motion.a>
    );
}

function ProjectList({ projects, implementationResources }: { projects: any[]; implementationResources: ResourceRecommendation[] }) {
    return (
        <ScrollArea className="h-[300px] pr-2">
            <div className="space-y-4">
                {/* Implementation Resources */}
                {implementationResources && implementationResources.length > 0 && (
                    <div className="space-y-2">
                        <h5 className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <Code className="h-3 w-3" /> Implementation Tutorials
                        </h5>
                        <div className="space-y-2">
                            {implementationResources.map((res, idx) => (
                                <ResourceCard key={idx} resource={res} index={idx} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Project Ideas */}
                {projects && projects.length > 0 && (
                    <div className="space-y-2">
                        <h5 className="text-xs font-semibold text-purple-400 flex items-center gap-1 mt-4">
                            <Rocket className="h-3 w-3" /> Project Ideas
                        </h5>
                        <div className="space-y-3">
                            {projects.map((project, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="p-3 rounded-lg bg-gradient-to-br from-purple-900/10 to-blue-900/10 border border-purple-500/20"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <h4 className="text-sm font-semibold text-purple-300">{project.project_name}</h4>
                                        <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">
                                            ~{project.estimated_hours}h
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-white/60 mb-2">{project.description}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {project.skills_practiced?.map((skill: string, i: number) => (
                                            <Badge key={i} variant="secondary" className="text-[10px] h-4 bg-purple-500/10 text-purple-300">
                                                {skill}
                                            </Badge>
                                        ))}
                                    </div>
                                    {(project.starter_repo || project.tutorial_url) && (
                                        <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                                            {project.starter_repo && (
                                                <a
                                                    href={project.starter_repo}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                                                >
                                                    <Code className="h-2.5 w-2.5" /> Starter Repo
                                                </a>
                                            )}
                                            {project.tutorial_url && (
                                                <a
                                                    href={project.tutorial_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                                                >
                                                    <BookOpen className="h-2.5 w-2.5" /> Tutorial
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {(!projects || projects.length === 0) && (!implementationResources || implementationResources.length === 0) && (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                        No projects available
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}
