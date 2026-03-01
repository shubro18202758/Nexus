"use client";

import { useDb } from "@/components/providers/db-provider";
import { students, projects, experience, teammates } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { Loader2, Database, User, Briefcase, Code, Users } from "lucide-react";

export default function TestDbPage() {
    const { db } = useDb();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);

    const fetchData = async () => {
        if (!db) return;
        setLoading(true);
        try {
            // Fetch Student (Limit 1)
            const [student] = await db.select().from(students).limit(1);

            if (student) {
                // Fetch Related Data
                const studentProjects = await db.select().from(projects).where(eq(projects.studentId, student.id));
                const studentExperience = await db.select().from(experience).where(eq(experience.studentId, student.id));
                const studentTeammates = await db.select().from(teammates).where(eq(teammates.studentId, student.id));

                setData({
                    student,
                    projects: studentProjects,
                    experience: studentExperience,
                    teammates: studentTeammates
                });
            } else {
                setData(null);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [db]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col h-screen items-center justify-center gap-4">
                <Database className="h-12 w-12 text-muted-foreground" />
                <h1 className="text-xl font-bold">No Data Found</h1>
                <p className="text-muted-foreground">Go to Settings and click "Seed Student DB"</p>
                <Button onClick={fetchData}>Refresh</Button>
            </div>
        );
    }

    const { student, projects: projs, experience: exps, teammates: mates } = data;

    return (
        <div className="min-h-screen p-8 max-w-5xl mx-auto space-y-8">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-purple-500/20 to-cyan-500/20 p-3 rounded-xl border border-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <Database className="h-6 w-6 text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-[family-name:var(--font-space)] bg-gradient-to-r from-purple-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                            Student OS Core
                        </h1>
                        <p className="text-muted-foreground">Database Verification Dashboard</p>
                    </div>
                </div>
                <Button variant="outline" onClick={fetchData} className="border-white/10 bg-black/40 backdrop-blur-md hover:bg-white/10 hover:border-purple-500/30 transition-all duration-300 gap-2">
                    <Database className="h-4 w-4 text-purple-400" /> Refresh Data
                </Button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Identity Card */}
                <Card className="md:col-span-2 border-purple-500/20 bg-black/40 backdrop-blur-md hover:border-purple-500/30 transition-all duration-300 shadow-[0_0_15px_rgba(168,85,247,0.05)]">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-space)]">
                            <User className="h-5 w-5 text-purple-400 drop-shadow-[0_0_4px_rgba(168,85,247,0.5)]" /> Identity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">{student.name}</h2>
                                <p className="text-muted-foreground">{student.email}</p>
                            </div>
                            <Badge variant="outline" className="h-fit px-3 py-1 border-purple-500/40 text-purple-300">
                                GPA: {student.gpa}
                            </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                            <div>
                                <p className="text-xs uppercase text-muted-foreground">University</p>
                                <p className="font-medium">{student.university}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase text-muted-foreground">Major</p>
                                <p className="font-medium">{student.major}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase text-muted-foreground">Student ID</p>
                                <p className="font-medium">{student.studentId}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase text-muted-foreground">Phone</p>
                                <p className="font-medium">{student.phone}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Team Card */}
                <Card className="border-cyan-500/20 bg-black/40 backdrop-blur-md hover:border-cyan-500/30 transition-all duration-300 shadow-[0_0_15px_rgba(34,211,238,0.05)]">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-space)]">
                            <Users className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]" /> Teammates
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {mates.map((mate: any) => (
                            <div key={mate.id} className="flex items-center gap-3 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/10">
                                <div className="h-8 w-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">
                                    {mate.name.charAt(0)}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="font-medium text-sm truncate">{mate.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{mate.role}</p>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Projects Section */}
                <div className="md:col-span-2 space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2 font-[family-name:var(--font-space)]">
                        <Code className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" /> Projects
                        <Badge variant="secondary" className="text-xs">Vector Search Ready</Badge>
                    </h3>
                    <div className="grid gap-4">
                        {projs.map((project: any) => (
                            <Card key={project.id} className="border-emerald-500/10 bg-black/40 backdrop-blur-md hover:border-emerald-500/30 hover:shadow-[0_0_15px_rgba(52,211,153,0.08)] transition-all duration-300">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base text-emerald-300">{project.title}</CardTitle>
                                            <CardDescription>{project.role}</CardDescription>
                                        </div>
                                        {project.url && (
                                            <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
                                                <a href={project.url} target="_blank" rel="noreferrer">View Code</a>
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <p className="text-sm text-muted-foreground">{project.description}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(project.skills as string[] || []).map((skill: string) => (
                                            <Badge key={skill} variant="outline" className="bg-emerald-500/5 border-emerald-500/20 text-[10px]">
                                                {skill}
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="text-[10px] font-mono text-muted-foreground/50">
                                        Embedding: Vector(384) • {project.embedding ? "Generated" : "Missing"}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Experience Section */}
                <div className="space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2 font-[family-name:var(--font-space)]">
                        <Briefcase className="h-5 w-5 text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]" /> Experience
                    </h3>
                    <div className="grid gap-4">
                        {exps.map((job: any) => (
                            <Card key={job.id} className="border-amber-500/10 bg-black/40 backdrop-blur-md hover:border-amber-500/30 transition-all duration-300">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-bold text-amber-300">{job.company}</CardTitle>
                                    <CardDescription className="text-xs">{job.role}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-xs text-muted-foreground mb-2">{job.duration}</p>
                                    <p className="text-xs line-clamp-3">{job.description}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
