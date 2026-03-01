"use client";

import { useState, useEffect } from "react";
import { useDb } from "@/components/providers/db-provider";
import { students, projects, experience, teammates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Save, User, BookOpen, Code, Briefcase, ExternalLink, GraduationCap } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ProfileForm() {
    const { db } = useDb();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Data State
    const [studentId, setStudentId] = useState<string | null>(null);
    const [identity, setIdentity] = useState({
        name: "",
        email: "",
        phone: "",
        bio: "", // Note: Schema doesn't have Bio yet, we might need to add it or store in basics. Let's stick to schema: Name, Email, Phone.
        // Wait, schema has check: name, email, phone, links (json), demographics (json).
        linkedin: "",
        github: "",
        portfolio: "",
    });

    const [education, setEducation] = useState({
        university: "",
        major: "",
        gpa: "",
        studentId: "",
        transcript: "",
    });

    const [projectList, setProjectList] = useState<any[]>([]);
    const [experienceList, setExperienceList] = useState<any[]>([]);

    // Modal States
    const [isProjectOpen, setIsProjectOpen] = useState(false);
    const [newProject, setNewProject] = useState({ title: "", description: "", role: "", url: "", skills: "" });

    const [isExpOpen, setIsExpOpen] = useState(false);
    const [newExp, setNewExp] = useState({ company: "", role: "", duration: "", description: "" });

    useEffect(() => {
        if (!db) return;
        fetchData();
    }, [db]);

    const fetchData = async () => {
        if (!db) return;
        setLoading(true);
        try {
            const [student] = await db.select().from(students).limit(1);
            if (student) {
                setStudentId(student.id);
                const links = (student.links as any) || {};
                setIdentity({
                    name: student.name,
                    email: student.email,
                    phone: student.phone || "",
                    bio: "",
                    linkedin: links.linkedin || "",
                    github: links.github || "",
                    portfolio: links.portfolio || "",
                });
                setEducation({
                    university: student.university || "",
                    major: student.major || "",
                    gpa: student.gpa || "",
                    studentId: student.studentId || "",
                    transcript: student.transcript || "",
                });

                const projs = await db.select().from(projects).where(eq(projects.studentId, student.id));
                setProjectList(projs);

                const exps = await db.select().from(experience).where(eq(experience.studentId, student.id));
                setExperienceList(exps);
            }
        } catch (e) {
            console.error("Failed to fetch profile", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveIdentity = async () => {
        if (!db) return;
        setSaving(true);
        try {
            const links = {
                linkedin: identity.linkedin,
                github: identity.github,
                portfolio: identity.portfolio,
            };

            const data = {
                name: identity.name,
                email: identity.email,
                phone: identity.phone,
                links: links,
                ...education, // Save education together since it's same table
            };

            if (studentId) {
                await db.update(students).set(data).where(eq(students.id, studentId));
            } else {
                const [newStudent] = await db.insert(students).values(data as any).returning();
                setStudentId(newStudent.id);
            }
            alert("Profile saved successfully!");
        } catch (e) {
            console.error(e);
            alert("Failed to save.");
        } finally {
            setSaving(false);
        }
    };

    const handleAddProject = async () => {
        if (!db || !studentId) {
            alert("Please save your Identity first to create a student profile.");
            return;
        }
        try {
            const skillsArray = newProject.skills.split(",").map(s => s.trim()).filter(Boolean);
            await db.insert(projects).values({
                studentId,
                title: newProject.title,
                description: newProject.description,
                role: newProject.role,
                url: newProject.url,
                skills: skillsArray,
                // embedding: null // Let's leave null for now, or we could generate random if we wanted to mock
            });
            setIsProjectOpen(false);
            setNewProject({ title: "", description: "", role: "", url: "", skills: "" });
            fetchData(); // Refresh list
        } catch (e) {
            console.error(e);
            alert("Failed to add project");
        }
    };

    const handleDeleteProject = async (id: string) => {
        if (!db) return;
        await db.delete(projects).where(eq(projects.id, id));
        fetchData();
    };

    const handleAddExp = async () => {
        if (!db || !studentId) {
            alert("Please save your Identity first to create a student profile.");
            return;
        }
        try {
            await db.insert(experience).values({
                studentId,
                company: newExp.company,
                role: newExp.role,
                duration: newExp.duration,
                description: newExp.description,
            });
            setIsExpOpen(false);
            setNewExp({ company: "", role: "", duration: "", description: "" });
            fetchData();
        } catch (e) {
            console.error(e);
            alert("Failed to add experience");
        }
    };

    const handleDeleteExp = async (id: string) => {
        if (!db) return;
        await db.delete(experience).where(eq(experience.id, id));
        fetchData();
    };

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Student Profile</h2>
                    <p className="text-muted-foreground">Manage your Student OS Core identity and portfolio.</p>
                </div>
                <Button onClick={handleSaveIdentity} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>

            <Tabs defaultValue="identity" className="space-y-4">
                <TabsList className="bg-white/5 border border-white/10">
                    <TabsTrigger value="identity" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                        <User className="mr-2 h-4 w-4" /> Identity
                    </TabsTrigger>
                    <TabsTrigger value="education" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                        <GraduationCap className="mr-2 h-4 w-4" /> Education
                    </TabsTrigger>
                    <TabsTrigger value="projects" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                        <Code className="mr-2 h-4 w-4" /> Projects
                    </TabsTrigger>
                    <TabsTrigger value="experience" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                        <Briefcase className="mr-2 h-4 w-4" /> Experience
                    </TabsTrigger>
                </TabsList>

                {/* === Identity Tab === */}
                <TabsContent value="identity">
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                            <CardTitle>Personal Details</CardTitle>
                            <CardDescription>Your contact information and public links.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input value={identity.name} onChange={e => setIdentity({ ...identity, name: e.target.value })} placeholder="Alex Mercer" className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input value={identity.email} onChange={e => setIdentity({ ...identity, email: e.target.value })} placeholder="alex@mit.edu" className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input value={identity.phone} onChange={e => setIdentity({ ...identity, phone: e.target.value })} placeholder="+1 555 000 0000" className="bg-white/5 border-white/10" />
                                </div>
                            </div>
                            <Separator className="bg-white/10" />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>LinkedIn URL</Label>
                                    <Input value={identity.linkedin} onChange={e => setIdentity({ ...identity, linkedin: e.target.value })} placeholder="linkedin.com/in/..." className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>GitHub URL</Label>
                                    <Input value={identity.github} onChange={e => setIdentity({ ...identity, github: e.target.value })} placeholder="github.com/..." className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Portfolio URL</Label>
                                    <Input value={identity.portfolio} onChange={e => setIdentity({ ...identity, portfolio: e.target.value })} placeholder="myportfolio.com" className="bg-white/5 border-white/10" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* === Education Tab === */}
                <TabsContent value="education">
                    <Card className="bg-white/5 border-white/10">
                        <CardHeader>
                            <CardTitle>Academic Records</CardTitle>
                            <CardDescription>Your current educational status.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>University / School</Label>
                                    <Input value={education.university} onChange={e => setEducation({ ...education, university: e.target.value })} placeholder="MIT" className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Major / Degree</Label>
                                    <Input value={education.major} onChange={e => setEducation({ ...education, major: e.target.value })} placeholder="Computer Science" className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>GPA</Label>
                                    <Input value={education.gpa} onChange={e => setEducation({ ...education, gpa: e.target.value })} placeholder="4.0" className="bg-white/5 border-white/10" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Student ID</Label>
                                    <Input value={education.studentId} onChange={e => setEducation({ ...education, studentId: e.target.value })} placeholder="ID-123456" className="bg-white/5 border-white/10" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Transcript / Relevant Courses</Label>
                                <Textarea value={education.transcript} onChange={e => setEducation({ ...education, transcript: e.target.value })} placeholder="Data Structures, Algorithms, AI..." className="bg-white/5 border-white/10 h-32" />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* === Projects Tab === */}
                <TabsContent value="projects">
                    <div className="flex justify-end mb-4">
                        <Dialog open={isProjectOpen} onOpenChange={setIsProjectOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" /> Add Project</Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#1a1b26] border-white/10 text-white">
                                <DialogHeader>
                                    <DialogTitle>Add New Project</DialogTitle>
                                    <DialogDescription>Add a project to your portfolio. It will be vectorized for semantic search.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Project Title</Label>
                                        <Input value={newProject.title} onChange={e => setNewProject({ ...newProject, title: e.target.value })} className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Role</Label>
                                        <Input value={newProject.role} onChange={e => setNewProject({ ...newProject, role: e.target.value })} placeholder="Lead Developer" className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Skills (comma separated)</Label>
                                        <Input value={newProject.skills} onChange={e => setNewProject({ ...newProject, skills: e.target.value })} placeholder="React, Python, AWS" className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>URL</Label>
                                        <Input value={newProject.url} onChange={e => setNewProject({ ...newProject, url: e.target.value })} placeholder="https://..." className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Description</Label>
                                        <Textarea value={newProject.description} onChange={e => setNewProject({ ...newProject, description: e.target.value })} className="bg-white/5 border-white/10" />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleAddProject} className="bg-emerald-600">Add Project</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {projectList.map(project => (
                            <Card key={project.id} className="bg-white/5 border-white/10 hover:border-emerald-500/30 transition-all">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base text-emerald-300">{project.title}</CardTitle>
                                            <CardDescription>{project.role}</CardDescription>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteProject(project.id)} className="h-6 w-6 text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="text-sm text-muted-foreground line-clamp-3">{project.description}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(project.skills as string[] || []).map((skill: string, i: number) => (
                                            <Badge key={i} variant="secondary" className="text-[10px] bg-white/10 hover:bg-white/20">{skill}</Badge>
                                        ))}
                                    </div>
                                </CardContent>
                                {project.url && (
                                    <CardFooter className="pt-0 pb-3">
                                        <a href={project.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 flex items-center hover:underline">
                                            <ExternalLink className="mr-1 h-3 w-3" /> Link
                                        </a>
                                    </CardFooter>
                                )}
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* === Experience Tab === */}
                <TabsContent value="experience">
                    <div className="flex justify-end mb-4">
                        <Dialog open={isExpOpen} onOpenChange={setIsExpOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-amber-600 hover:bg-amber-700"><Plus className="mr-2 h-4 w-4" /> Add Experience</Button>
                            </DialogTrigger>
                            <DialogContent className="bg-[#1a1b26] border-white/10 text-white">
                                <DialogHeader>
                                    <DialogTitle>Add Work Experience</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Company</Label>
                                        <Input value={newExp.company} onChange={e => setNewExp({ ...newExp, company: e.target.value })} className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Role</Label>
                                        <Input value={newExp.role} onChange={e => setNewExp({ ...newExp, role: e.target.value })} className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Duration</Label>
                                        <Input value={newExp.duration} onChange={e => setNewExp({ ...newExp, duration: e.target.value })} placeholder="Jan 2024 - Present" className="bg-white/5 border-white/10" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Description</Label>
                                        <Textarea value={newExp.description} onChange={e => setNewExp({ ...newExp, description: e.target.value })} className="bg-white/5 border-white/10" />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button onClick={handleAddExp} className="bg-amber-600">Add Experience</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-4">
                        {experienceList.map(exp => (
                            <Card key={exp.id} className="bg-white/5 border-white/10 hover:border-amber-500/30 transition-all">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-base text-amber-300">{exp.company}</CardTitle>
                                            <CardDescription>{exp.role} • {exp.duration}</CardDescription>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteExp(exp.id)} className="h-6 w-6 text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{exp.description}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
