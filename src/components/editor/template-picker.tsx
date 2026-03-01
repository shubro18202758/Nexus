"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDb } from "@/components/providers/db-provider";
import { documents } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
    FileText, BookOpen, ListChecks, Lightbulb,
    Presentation, Code, X, Sparkles, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Template {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    color: string;
    content: string;
}

const TEMPLATES: Template[] = [
    {
        id: "blank",
        name: "Blank Document",
        description: "Start from scratch",
        icon: FileText,
        color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
        content: "<h1>Untitled</h1><p></p>",
    },
    {
        id: "meeting-notes",
        name: "Meeting Notes",
        description: "Structured meeting notes with agenda and action items",
        icon: ListChecks,
        color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
        content: `<h1>Meeting Notes</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<p><strong>Attendees:</strong> </p>
<h2>📋 Agenda</h2>
<ul><li>Item 1</li><li>Item 2</li></ul>
<h2>📝 Notes</h2>
<p></p>
<h2>✅ Action Items</h2>
<ul><li><strong>[Owner]</strong> — Task description — <em>Due: </em></li></ul>
<h2>🔄 Follow-up</h2>
<p>Next meeting: </p>`,
    },
    {
        id: "research",
        name: "Research Brief",
        description: "Structured research with sources and findings",
        icon: BookOpen,
        color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        content: `<h1>Research Brief</h1>
<p><strong>Topic:</strong> </p>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<h2>🔍 Research Question</h2>
<p></p>
<h2>📖 Key Findings</h2>
<h3>Finding 1</h3>
<p></p>
<h3>Finding 2</h3>
<p></p>
<h2>📚 Sources</h2>
<ol><li></li></ol>
<h2>💡 Conclusions</h2>
<p></p>`,
    },
    {
        id: "brainstorm",
        name: "Brainstorm",
        description: "Idea generation canvas",
        icon: Lightbulb,
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        content: `<h1>💡 Brainstorm Session</h1>
<p><strong>Topic:</strong> </p>
<h2>🌟 Ideas</h2>
<ul><li>Idea 1</li><li>Idea 2</li><li>Idea 3</li></ul>
<h2>🎯 Top Picks</h2>
<ol><li></li></ol>
<h2>🚀 Next Steps</h2>
<p></p>`,
    },
    {
        id: "project-plan",
        name: "Project Plan",
        description: "Goals, milestones, and timelines",
        icon: Presentation,
        color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
        content: `<h1>Project Plan</h1>
<p><strong>Project:</strong> </p>
<p><strong>Owner:</strong> </p>
<p><strong>Timeline:</strong> </p>
<h2>🎯 Objectives</h2>
<ul><li></li></ul>
<h2>📅 Milestones</h2>
<table><thead><tr><th>Milestone</th><th>Date</th><th>Status</th></tr></thead><tbody><tr><td></td><td></td><td>🔴 Not started</td></tr></tbody></table>
<h2>⚠️ Risks</h2>
<ul><li></li></ul>`,
    },
    {
        id: "technical-spec",
        name: "Technical Spec",
        description: "Architecture and implementation notes",
        icon: Code,
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        content: `<h1>Technical Specification</h1>
<p><strong>Feature:</strong> </p>
<p><strong>Author:</strong> </p>
<h2>📖 Overview</h2>
<p></p>
<h2>🏗️ Architecture</h2>
<p></p>
<h2>🔧 Implementation</h2>
<h3>Components</h3>
<ul><li></li></ul>
<h3>Data Model</h3>
<p></p>
<h2>🧪 Testing Strategy</h2>
<p></p>`,
    },
];

interface TemplatePickerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TemplatePicker({ isOpen, onClose }: TemplatePickerProps) {
    const router = useRouter();
    const { db } = useDb();
    const [isCreating, setIsCreating] = useState<string | null>(null);

    const handleSelect = async (template: Template) => {
        if (!db) return;
        setIsCreating(template.id);
        try {
            const [doc] = await db.insert(documents).values({
                workspaceId: "default",
                title: template.name === "Blank Document" ? "Untitled" : template.name,
                content: template.content,
            }).returning();
            onClose();
            router.push(`/documents/${doc.id}`);
        } catch (e) {
            console.error("Failed to create document:", e);
        } finally {
            setIsCreating(null);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-[0_0_50px_-10px_purple] overflow-hidden mx-4"
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-fuchsia-400 animate-pulse" />
                            <h2 className="text-lg font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                                INITIALIZE PROTOCOL
                            </h2>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10 hover:text-red-400 transition-colors" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-auto custom-scrollbar">
                        {TEMPLATES.map((tpl, i) => (
                            <motion.button
                                key={tpl.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => handleSelect(tpl)}
                                disabled={isCreating !== null}
                                className={cn(
                                    "group flex flex-col items-start gap-3 p-4 rounded-xl border border-white/5 transition-all text-left relative overflow-hidden",
                                    "hover:scale-[1.02] hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] bg-white/5",
                                    isCreating === tpl.id ? "opacity-50" : "opacity-90 hover:opacity-100",
                                )}
                            >
                                <div className={cn("p-2 rounded-lg bg-black/40 border border-white/5 group-hover:border-cyan-500/30 transition-colors", tpl.color.split(' ')[0])}>
                                    <tpl.icon className="h-5 w-5" />
                                </div>
                                <div className="relative z-10">
                                    <p className="text-sm font-bold text-slate-200 group-hover:text-cyan-300 transition-colors font-mono">{tpl.name.toUpperCase()}</p>
                                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 group-hover:text-slate-400">{tpl.description}</p>
                                </div>
                                {/* Hover Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
