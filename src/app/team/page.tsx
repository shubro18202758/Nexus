"use client";

import { Users, Bot, Cpu, Zap, Brain, Radio, Shield, Sparkles } from "lucide-react";
import { AuraCard } from "@/components/ui/aura-card";
import { Badge } from "@/components/ui/badge";

const AGENTS = [
    {
        name: "CEO — DeepSeek R1 8B",
        role: "Orchestrator",
        desc: "Local LLM running on Ollama. Routes, reasons, and coordinates the entire Three-Body system.",
        icon: Brain,
        color: "from-violet-400 to-purple-500",
        badge: "LOCAL",
        badgeColor: "border-violet-500/30 text-violet-400 bg-violet-500/10",
    },
    {
        name: "Alpha — Llama 3.1 8B",
        role: "Fast Ingestion Engine",
        desc: "Groq cloud. Handles quick classification, scanning, parsing, and real-time response generation.",
        icon: Zap,
        color: "from-cyan-400 to-blue-500",
        badge: "GROQ",
        badgeColor: "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
    },
    {
        name: "Beta — Llama 3.3 70B",
        role: "Deep Reasoning Engine",
        desc: "Groq cloud. Handles complex analysis, code generation, strategy planning, and advanced reasoning.",
        icon: Cpu,
        color: "from-emerald-400 to-teal-500",
        badge: "GROQ",
        badgeColor: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    },
];

const SKILLS = [
    { name: "Planner", desc: "Agentic event planning & urgency tracking", icon: "📋" },
    { name: "Calendar", desc: "Smart calendar with adaptive replanning", icon: "📅" },
    { name: "Email", desc: "Inbox scanning & auto-classification", icon: "📧" },
    { name: "Reminder", desc: "Context-aware reminders & alerts", icon: "🔔" },
    { name: "Web Research", desc: "Autonomous web research agent", icon: "🌐" },
    { name: "Notes", desc: "Intelligent note capture & retrieval", icon: "📝" },
    { name: "WhatsApp", desc: "Message monitoring & smart replies", icon: "💬" },
    { name: "Form Filler", desc: "Auto-fill forms using knowledge base", icon: "📄" },
];

export default function TeamPage() {
    return (
        <div className="flex flex-col min-h-screen p-6 md:p-8">
            <div className="max-w-5xl mx-auto w-full space-y-8">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 p-3 rounded-xl border border-violet-500/10">
                        <Users className="h-6 w-6 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight font-[family-name:var(--font-space)] bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Three-Body Team
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            The agentic engine trio powering NEXUS — CEO + Alpha + Beta
                        </p>
                    </div>
                </div>

                {/* Agent Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {AGENTS.map((agent) => {
                        const Icon = agent.icon;
                        return (
                            <AuraCard key={agent.name} className="relative overflow-visible">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div className={`bg-gradient-to-br ${agent.color} p-2.5 rounded-lg`}>
                                            <Icon className="h-5 w-5 text-white" />
                                        </div>
                                        <Badge variant="outline" className={`text-[10px] ${agent.badgeColor}`}>
                                            {agent.badge}
                                        </Badge>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-sm font-[family-name:var(--font-space)]">{agent.name}</h3>
                                        <p className="text-xs text-muted-foreground">{agent.role}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground/80 leading-relaxed">
                                        {agent.desc}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
                                        <span className="text-[10px] text-emerald-400 font-mono">ONLINE</span>
                                    </div>
                                </div>
                            </AuraCard>
                        );
                    })}
                </div>

                {/* Skills Grid */}
                <div>
                    <h2 className="text-lg font-semibold font-[family-name:var(--font-space)] flex items-center gap-2 mb-4">
                        <Shield className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]" />
                        <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Skill Modules</span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {SKILLS.map((skill) => (
                            <AuraCard key={skill.name} withGlow={false} className="!p-3">
                                <div className="flex items-start gap-2">
                                    <span className="text-lg">{skill.icon}</span>
                                    <div>
                                        <p className="text-xs font-semibold">{skill.name}</p>
                                        <p className="text-[10px] text-muted-foreground">{skill.desc}</p>
                                    </div>
                                </div>
                            </AuraCard>
                        ))}
                    </div>
                </div>

                {/* Architecture Note */}
                <AuraCard transparency="solid" withGlow={false}>
                    <div className="flex items-start gap-3">
                        <Sparkles className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-semibold font-[family-name:var(--font-space)] text-amber-400">Three-Body Architecture</h3>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Inspired by the Three-Body Problem. The CEO orchestrates locally (privacy-first),
                                Alpha handles fast ingestion via Groq, and Beta powers deep reasoning with 70B parameters.
                                Skills are auto-discovered at startup and routed via keyword + LLM classification.
                            </p>
                        </div>
                    </div>
                </AuraCard>
            </div>
        </div>
    );
}
