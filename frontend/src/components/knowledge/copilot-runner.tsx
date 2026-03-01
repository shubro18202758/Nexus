"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { runCopilotCycle, createInitialState, type CopilotState, type CopilotStage, type CopilotEvent } from "@/lib/ai/copilot-orchestrator";
import { AuraCard } from "@/components/ui/aura-card";
import { ShinyButton } from "@/components/ui/shiny-button";
import {
    Brain, Map, Search, BookOpen, Route, Swords,
    BarChart3, Calendar, Unlock, CheckCircle, Loader2,
    AlertTriangle, Zap, Play, RotateCcw, Cpu, Terminal
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STAGE_CONFIG: Record<CopilotStage, { label: string; icon: any; color: string; step: number; description: string }> = {
    idle: { label: "STANDBY", icon: Play, color: "text-white/40", step: 0, description: "System ready for optimization cycle." },
    profiling: { label: "NEURAL PROFILING", icon: Brain, color: "text-violet-400", step: 1, description: "Scanning user knowledge patterns & learning velocity." },
    mapping: { label: "CONCEPT MAPPING", icon: Map, color: "text-blue-400", step: 2, description: "Constructing dependency graph for target domain." },
    analyzing: { label: "GAP ANALYSIS", icon: Search, color: "text-amber-400", step: 3, description: "Detecting cognitive bottlenecks and missing primitives." },
    curating: { label: "CONTENT CURATION", icon: BookOpen, color: "text-emerald-400", step: 4, description: "Retrieving high-signal resources from vector database." },
    building: { label: "ROADMAP BUILD", icon: Route, color: "text-cyan-400", step: 5, description: "Generating adaptive 4-week execution plan." },
    testing: { label: "CHALLENGE GEN", icon: Swords, color: "text-red-400", step: 6, description: "Synthesizing implementation tests & system design scenarios." },
    evaluating: { label: "EVALUATION", icon: BarChart3, color: "text-purple-400", step: 7, description: "Calculating career readiness score & mastery depth." },
    adapting: { label: "ADAPTIVE PLAN", icon: Calendar, color: "text-orange-400", step: 8, description: "Adjusting schedule based on predicted burnout risk." },
    unlocking: { label: "THRESHOLD CHECK", icon: Unlock, color: "text-yellow-400", step: 9, description: "Verifying criteria for Advanced Mode unlock." },
    complete: { label: "CYCLE COMPLETE", icon: CheckCircle, color: "text-emerald-400", step: 10, description: "Optimization finished. New protocols active." },
    error: { label: "SYSTEM ERROR", icon: AlertTriangle, color: "text-red-500", step: -1, description: "Process interrupted." },
};

const TOTAL_STAGES = 9;

interface CopilotRunnerProps {
    onCycleComplete?: (state: CopilotState) => void;
}

export function CopilotRunner({ onCycleComplete }: CopilotRunnerProps) {
    const [state, setState] = useState<CopilotState>(createInitialState);
    const [events, setEvents] = useState<CopilotEvent[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const stateRef = useRef(state);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [events]);

    const handleEvent = useCallback((event: CopilotEvent) => {
        setEvents(prev => [...prev, event]);
        if (event.type === "STAGE_START") {
            setState(prev => ({ ...prev, stage: event.stage }));
        }
        if (event.type === "STAGE_COMPLETE") {
            // Update with result data
            setState(prev => {
                const next = { ...prev };
                switch (event.stage) {
                    case "profiling": next.profile = event.data; break;
                    case "mapping": next.roadmapGraph = event.data; break;
                    case "analyzing": next.gapAnalysis = event.data; break;
                    case "curating": next.curatedPath = event.data; break;
                    case "building": next.adaptiveRoadmap = event.data; break;
                    case "testing": next.challenges = event.data; break;
                    case "evaluating":
                        next.progressEval = event.data.progressEval;
                        next.careerEval = event.data.careerEval;
                        break;
                    case "adapting": next.masteryPlan = event.data; break;
                    case "unlocking": next.threshold = event.data; break;
                }
                return next;
            });
        }
        if (event.type === "CYCLE_COMPLETE") {
            setState(prev => ({ ...prev, stage: "complete" }));
        }
        if (event.type === "STAGE_ERROR") {
            setState(prev => ({ ...prev, stage: "error", error: event.error }));
        }
    }, []);

    const runLoop = async () => {
        setIsRunning(true);
        setEvents([]);
        setState(createInitialState());

        const userHistory = "User has been studying distributed systems, completed basic React projects, interested in ML and backend engineering.";
        const domain = "Distributed Systems";

        const finalState = await runCopilotCycle(userHistory, domain, handleEvent, stateRef.current);
        setState(finalState);
        setIsRunning(false);
        onCycleComplete?.(finalState);
    };

    const currentStep = STAGE_CONFIG[state.stage]?.step || 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Circuit Board Visualization */}
            <div className="lg:col-span-2">
                <AuraCard className="space-y-6 relative overflow-hidden min-h-[600px] flex flex-col" withGlow={true}>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-violet-500/20 p-2 rounded-lg border border-violet-500/30">
                                <Cpu className="h-6 w-6 text-violet-400 animate-pulse" />
                            </div>
                            <div>
                                <h3 className="text-lg font-mono font-bold text-white tracking-tight">INTELLIGENCE MATRIX</h3>
                                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                                    <span className={isRunning ? "text-emerald-400 animate-pulse" : "text-white/30"}>
                                        {isRunning ? "● PROCESSING" : "○ IDLE"}
                                    </span>
                                    <span>// CYCLE_ID: {state.cycleCount.toString().padStart(4, '0')}</span>
                                </div>
                            </div>
                        </div>
                        <ShinyButton
                            onClick={runLoop}
                            disabled={isRunning}
                            icon={isRunning ? <Loader2 className="animate-spin h-4 w-4" /> : <Play className="h-4 w-4" />}
                            className="bg-violet-600 hover:bg-violet-500 text-xs py-2 px-4"
                        >
                            {isRunning ? "Running Cycle..." : state.stage === "complete" ? "Re-Optimize" : "Initialize Cycle"}
                        </ShinyButton>
                    </div>

                    {/* Circuit Board Layout */}
                    <div className="relative flex-1 py-4 px-2">
                        {/* Connecting Line */}
                        <div className="absolute left-[27px] top-6 bottom-6 w-0.5 bg-white/10 z-0" />

                        {/* Scanner Beam */}
                        {isRunning && (
                            <motion.div
                                className="absolute left-[27px] top-6 w-0.5 bg-cyan-400/80 z-10 shadow-[0_0_15px_cyan]"
                                style={{ height: `${(currentStep / TOTAL_STAGES) * 100}%` }}
                                layoutId="scanner-beam"
                            />
                        )}

                        <div className="space-y-4 relative z-20">
                            {(["profiling", "mapping", "analyzing", "curating", "building", "testing", "evaluating", "adapting", "unlocking"] as CopilotStage[]).map((stage, i) => {
                                const config = STAGE_CONFIG[stage];
                                const StageIcon = config.icon;
                                const isActive = state.stage === stage;
                                const isDone = currentStep > config.step;
                                const isPending = currentStep < config.step;

                                return (
                                    <motion.div
                                        key={stage}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={`flex items-start gap-4 group ${isActive ? "opacity-100" : isPending ? "opacity-40" : "opacity-80"}`}
                                    >
                                        {/* Status Node */}
                                        <div className={`
                                            relative h-14 w-14 shrink-0 rounded-xl border flex items-center justify-center transition-all duration-300
                                            ${isActive
                                                ? `bg-black border-${config.color.split('-')[1]}-500 shadow-[0_0_20px_rgba(139,92,246,0.3)] scale-110`
                                                : isDone
                                                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                                                    : "bg-black border-white/10 text-white/20"}
                                        `}>
                                            {isActive ? (
                                                <Loader2 className={`h-6 w-6 animate-spin ${config.color}`} />
                                            ) : isDone ? (
                                                <CheckCircle className="h-6 w-6" />
                                            ) : (
                                                <StageIcon className="h-6 w-6" />
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className="pt-1.5">
                                            <h4 className={`text-sm font-mono font-bold tracking-wider uppercase ${isActive ? config.color : isDone ? "text-emerald-400" : "text-white/40"}`}>
                                                {config.label}
                                            </h4>
                                            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                                                {config.description}
                                            </p>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </AuraCard>
            </div>

            {/* Right Col: Live Logs & Results */}
            <div className="space-y-6">
                <AuraCard className="bg-black/80 font-mono text-xs p-0 flex flex-col h-[300px]" transparency="solid">
                    <div className="p-3 border-b border-white/10 bg-white/5 text-muted-foreground uppercase tracking-widest text-[10px] flex items-center gap-2">
                        <Terminal className="h-3 w-3" /> System Terminal
                    </div>
                    <div ref={logContainerRef} className="p-4 space-y-2 overflow-y-auto flex-1 font-mono">
                        {events.length === 0 && <span className="text-white/20">Waiting for input...</span>}
                        {events.map((e, i) => (
                            <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                                <span className="text-white/30">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                                {e.type === "STAGE_START" && <span className="text-cyan-400">STARTING PROCESS: {e.stage.toUpperCase()}...</span>}
                                {e.type === "STAGE_COMPLETE" && <span className="text-emerald-400">✓ {e.stage.toUpperCase()} COMPLETE</span>}
                                {e.type === "STAGE_ERROR" && <span className="text-red-400">✕ ERROR: {e.error}</span>}
                                {e.type === "CYCLE_COMPLETE" && <span className="text-neon-purple font-bold">&gt;&gt;&gt; OPTIMIZATION CYCLE FINISHED</span>}
                            </div>
                        ))}
                    </div>
                </AuraCard>

                {/* Results Summary Card */}
                <AnimatePresence>
                    {state.stage === "complete" && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <AuraCard className="border-emerald-500/30 bg-emerald-950/10">
                                <div className="flex items-center gap-2 mb-4 text-emerald-400">
                                    <Unlock className="h-5 w-5" />
                                    <h3 className="font-mono font-bold">UNLOCK STATUS</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="space-y-1">
                                        <p className="text-white/40 text-[10px] uppercase">Career Readiness</p>
                                        <div className="text-xl font-bold font-mono text-white">
                                            {state.careerEval?.overall.internship_readiness_score ?? 0}%
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-white/40 text-[10px] uppercase">Advanced Tier</p>
                                        <div className="text-xl font-bold font-mono text-emerald-300">
                                            {state.threshold?.advanced_unlocked ? "UNLOCKED" : "LOCKED"}
                                        </div>
                                    </div>
                                </div>
                            </AuraCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
