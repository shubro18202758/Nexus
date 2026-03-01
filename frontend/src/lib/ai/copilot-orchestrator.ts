"use client";

import { analyzeUserProfile, type LearningProfileAnalysis } from "./learning-diagnostician";
import { generateRoadmap, type RoadmapGraph } from "./roadmap-architect";
import { analyzeGaps, type GapAnalysisResult } from "./cognitive-analyzer";
import { curateResources, type CuratedLearningPath } from "./content-curator";
import { generateAdaptivePlan, type AdaptiveRoadmap } from "./roadmap-planner";
import { evaluateProgress, type ProgressEvaluation } from "./progress-evaluator";
import { generateChallenges, type ChallengeSet } from "./challenge-generator";
import { evaluateCareerReadiness, type FullCareerEvaluation } from "./career-evaluator";
import { generateMasteryPlan, type MasteryPlan } from "./mastery-planner";
import { detectThreshold, type ThresholdResult } from "./threshold-detector";

/**
 * The Iterative Intelligence Loop:
 * PROFILE → MAP → ANALYZE → CURATE → BUILD → TEST → EVALUATE → ADAPT → UNLOCK
 *
 * Each cycle updates learner state, refines difficulty, measures velocity,
 * and pushes toward advanced capability.
 */

export type CopilotStage =
    | "idle"
    | "profiling"       // Layer 1: Neural Profiling
    | "mapping"         // Layer 2: Concept Dependency Graph
    | "analyzing"       // Layer 3: Cognitive Gap Analyzer
    | "curating"        // Layer 4: High-Signal Content Engine
    | "building"        // Layer 5: 4-Week Adaptive Roadmap
    | "testing"         // Layer 7: Implementation Challenge Generator
    | "evaluating"      // Layer 6+8: Progress + Career Evaluation
    | "adapting"        // Layer 9: Adaptive Mastery Planner
    | "unlocking"       // Layer 10: Advanced Threshold Detector
    | "complete"
    | "error";

export interface CopilotState {
    stage: CopilotStage;
    profile: LearningProfileAnalysis | null;
    roadmapGraph: RoadmapGraph | null;
    gapAnalysis: GapAnalysisResult | null;
    curatedPath: CuratedLearningPath | null;
    adaptiveRoadmap: AdaptiveRoadmap | null;
    challenges: ChallengeSet | null;
    progressEval: ProgressEvaluation | null;
    careerEval: FullCareerEvaluation | null;
    masteryPlan: MasteryPlan | null;
    threshold: ThresholdResult | null;
    error: string | null;
    cycleCount: number;
    velocityLog: { timestamp: number; stage: CopilotStage }[];
}

export type CopilotEvent =
    | { type: "STAGE_START"; stage: CopilotStage }
    | { type: "STAGE_COMPLETE"; stage: CopilotStage; data: any }
    | { type: "STAGE_ERROR"; stage: CopilotStage; error: string }
    | { type: "CYCLE_COMPLETE"; cycleCount: number };

export function createInitialState(): CopilotState {
    return {
        stage: "idle",
        profile: null,
        roadmapGraph: null,
        gapAnalysis: null,
        curatedPath: null,
        adaptiveRoadmap: null,
        challenges: null,
        progressEval: null,
        careerEval: null,
        masteryPlan: null,
        threshold: null,
        error: null,
        cycleCount: 0,
        velocityLog: [],
    };
}

/**
 * Run the full copilot loop.
 * Each step feeds its output into the next step's input.
 * The `onEvent` callback provides real-time progress updates.
 */
export async function runCopilotCycle(
    userHistory: string,
    domain: string,
    onEvent: (event: CopilotEvent) => void,
    existingState?: Partial<CopilotState>
): Promise<CopilotState> {
    const state: CopilotState = {
        ...createInitialState(),
        ...existingState,
        cycleCount: (existingState?.cycleCount || 0) + 1,
        // Preserve velocity log across cycles for trend analysis
        velocityLog: existingState?.velocityLog || [],
    };

    const logVelocity = (stage: CopilotStage) => {
        state.velocityLog.push({ timestamp: Date.now(), stage });
    };

    try {
        // ─── Stage 1: PROFILE ───────────────────────────────
        state.stage = "profiling";
        onEvent({ type: "STAGE_START", stage: "profiling" });
        logVelocity("profiling");

        const profile = await analyzeUserProfile(userHistory);
        state.profile = profile;
        onEvent({ type: "STAGE_COMPLETE", stage: "profiling", data: profile });

        // ─── Stage 2: MAP ───────────────────────────────────
        state.stage = "mapping";
        onEvent({ type: "STAGE_START", stage: "mapping" });
        logVelocity("mapping");

        const graph = await generateRoadmap(profile, domain);
        state.roadmapGraph = graph;
        onEvent({ type: "STAGE_COMPLETE", stage: "mapping", data: graph });

        // ─── Stage 3: ANALYZE ───────────────────────────────
        state.stage = "analyzing";
        onEvent({ type: "STAGE_START", stage: "analyzing" });
        logVelocity("analyzing");

        const gaps = await analyzeGaps(graph, profile);
        state.gapAnalysis = gaps;
        onEvent({ type: "STAGE_COMPLETE", stage: "analyzing", data: gaps });

        // ─── Stage 4: CURATE ────────────────────────────────
        state.stage = "curating";
        onEvent({ type: "STAGE_START", stage: "curating" });
        logVelocity("curating");

        const bottleneckTopics = gaps.bottleneck_concepts.map(b => b.concept);
        const curated = await curateResources(profile, bottleneckTopics, []);
        state.curatedPath = curated;
        onEvent({ type: "STAGE_COMPLETE", stage: "curating", data: curated });

        // ─── Stage 5: BUILD ─────────────────────────────────
        state.stage = "building";
        onEvent({ type: "STAGE_START", stage: "building" });
        logVelocity("building");

        const roadmap = await generateAdaptivePlan(profile, curated, domain);
        state.adaptiveRoadmap = roadmap;
        onEvent({ type: "STAGE_COMPLETE", stage: "building", data: roadmap });

        // ─── Stage 6: TEST ──────────────────────────────────
        state.stage = "testing";
        onEvent({ type: "STAGE_START", stage: "testing" });
        logVelocity("testing");

        const challenges = await generateChallenges(
            profile,
            roadmap.week_1.focus,
            profile.level
        );
        state.challenges = challenges;
        onEvent({ type: "STAGE_COMPLETE", stage: "testing", data: challenges });

        // ─── Stage 7: EVALUATE ──────────────────────────────
        state.stage = "evaluating";
        onEvent({ type: "STAGE_START", stage: "evaluating" });
        logVelocity("evaluating");

        // Run progress + career evaluation in parallel
        const [progressEval, careerEval] = await Promise.all([
            evaluateProgress(roadmap, "Initial cycle — no user reflection yet.", 1),
            evaluateCareerReadiness(profile, profile.goal_type)
        ]);
        state.progressEval = progressEval;
        state.careerEval = careerEval;
        onEvent({ type: "STAGE_COMPLETE", stage: "evaluating", data: { progressEval, careerEval } });

        // ─── Stage 8: ADAPT ─────────────────────────────────
        state.stage = "adapting";
        onEvent({ type: "STAGE_START", stage: "adapting" });
        logVelocity("adapting");

        const velocityMetrics = calculateVelocity(state.velocityLog);
        const masteryPlan = await generateMasteryPlan(
            profile,
            careerEval.overall,
            velocityMetrics,
            bottleneckTopics
        );
        state.masteryPlan = masteryPlan;
        onEvent({ type: "STAGE_COMPLETE", stage: "adapting", data: masteryPlan });

        // ─── Stage 9: UNLOCK ────────────────────────────────
        state.stage = "unlocking";
        onEvent({ type: "STAGE_START", stage: "unlocking" });
        logVelocity("unlocking");

        const masteryDepth = careerEval.overall.competition_readiness_score;
        const implScore = careerEval.overall.internship_readiness_score;
        const velocityStable = velocityMetrics.trend === "stable";
        const depsSatisfied = gaps.bottleneck_concepts.length <= 2;

        const threshold = await detectThreshold(
            masteryDepth,
            implScore,
            velocityStable ? "stable" : "volatile",
            depsSatisfied
        );
        state.threshold = threshold;
        onEvent({ type: "STAGE_COMPLETE", stage: "unlocking", data: threshold });

        // ─── CYCLE COMPLETE ─────────────────────────────────
        state.stage = "complete";
        onEvent({ type: "CYCLE_COMPLETE", cycleCount: state.cycleCount });

    } catch (error: any) {
        state.stage = "error";
        state.error = error.message || "Unknown error in copilot cycle";
        onEvent({ type: "STAGE_ERROR", stage: state.stage, error: state.error! });
    }

    return state;
}

/**
 * Calculate velocity from the timestamp log.
 * Returns average time between stages and trend direction.
 */
function calculateVelocity(log: { timestamp: number; stage: CopilotStage }[]) {
    if (log.length < 2) {
        return { avgStageTimeMs: 0, trend: "unknown" as const, stagesPerMinute: 0 };
    }

    const deltas: number[] = [];
    for (let i = 1; i < log.length; i++) {
        deltas.push(log[i].timestamp - log[i - 1].timestamp);
    }

    const avgMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const recentAvg = deltas.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, deltas.length);

    const trend: "accelerating" | "stable" | "decelerating" =
        recentAvg < avgMs * 0.8 ? "accelerating" :
            recentAvg > avgMs * 1.2 ? "decelerating" :
                "stable";

    return {
        avgStageTimeMs: Math.round(avgMs),
        trend,
        stagesPerMinute: Math.round(60000 / avgMs * 10) / 10,
    };
}
