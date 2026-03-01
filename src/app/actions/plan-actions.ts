"use server";

import { serverDb } from "@/lib/server-db";
import { type AdaptiveRoadmap } from "@/lib/ai/roadmap-planner";
import {
    learningRoadmaps,
    progressReflections,
    careerEvaluations,
    copilotCycles,
    learningProfiles,
    students,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Helper: get the first student (single-user system)
async function getStudentId(): Promise<string> {
    const student = await serverDb.query.students.findFirst();
    if (!student) throw new Error("No student profile found");
    return student.id;
}

// ─── Layer 5: Save Generated Adaptive Plan ──────────────────
export async function saveGeneratedPlan(plan: AdaptiveRoadmap, topic: string) {
    try {
        const studentId = await getStudentId();
        await serverDb.insert(learningRoadmaps).values({
            studentId,
            domain: topic,
            roadmapData: plan as any,
        });
        revalidatePath("/knowledge");
        return { success: true };
    } catch (error) {
        console.error("Failed to save plan:", error);
        return { success: false, error: String(error) };
    }
}

// ─── Layer 6: Submit Progress Reflection ────────────────────
export async function submitProgress(roadmap: AdaptiveRoadmap, reflection: string, week: number) {
    try {
        const studentId = await getStudentId();
        // Find the roadmap in DB (match by domain)
        const existing = await serverDb.query.learningRoadmaps.findFirst({
            where: eq(learningRoadmaps.studentId, studentId),
        });

        await serverDb.insert(progressReflections).values({
            studentId,
            roadmapId: existing?.id ?? null,
            weekNumber: week,
            reflection,
            difficultyAdjustment: "maintain",
            fullEvaluation: { roadmapSnapshot: roadmap } as any,
        });
        revalidatePath("/knowledge");
        return { success: true };
    } catch (error) {
        console.error("Failed to submit progress:", error);
        return { success: false, error: String(error) };
    }
}

// ─── Layer 7: Generate Implementation Challenges ────────────
export async function createChallenge(topic: string, level: string) {
    try {
        const studentId = await getStudentId();
        // Store as a learning roadmap of type "challenge"
        await serverDb.insert(learningRoadmaps).values({
            studentId,
            domain: `challenge:${topic}`,
            roadmapData: { type: "challenge", topic, level, createdAt: Date.now() } as any,
        });
        revalidatePath("/knowledge");
        return { success: true };
    } catch (error) {
        console.error("Failed to create challenge:", error);
        return { success: false, error: String(error) };
    }
}

// ─── Layer 8: Career Readiness Evaluation ───────────────────
export async function checkCareerReadiness(goalType: string, evalResult?: {
    competitionScore?: number;
    internshipScore?: number;
    weakestAreas?: string[];
    portfolioGaps?: string[];
    fullEvaluation?: any;
}) {
    try {
        const studentId = await getStudentId();
        await serverDb.insert(careerEvaluations).values({
            studentId,
            goalType,
            competitionScore: evalResult?.competitionScore ?? 0,
            internshipScore: evalResult?.internshipScore ?? 0,
            weakestAreas: (evalResult?.weakestAreas ?? []) as any,
            portfolioGaps: (evalResult?.portfolioGaps ?? []) as any,
            fullEvaluation: (evalResult?.fullEvaluation ?? {}) as any,
        });
        revalidatePath("/profile");
        return { success: true };
    } catch (error) {
        console.error("Failed to check career readiness:", error);
        return { success: false, error: String(error) };
    }
}

// ─── Layer 9: Create Adaptive Mastery Plan ──────────────────
export async function createMasteryPlan(goal: string, planData?: any) {
    try {
        const studentId = await getStudentId();
        await serverDb.insert(learningRoadmaps).values({
            studentId,
            domain: `mastery:${goal}`,
            roadmapData: (planData ?? { goal, type: "mastery", createdAt: Date.now() }) as any,
        });
        revalidatePath("/knowledge");
        return { success: true };
    } catch (error) {
        console.error("Failed to create mastery plan:", error);
        return { success: false, error: String(error) };
    }
}

// ─── Layer 10: Threshold Detection ──────────────────────────
export async function checkThreshold(data: {
    masteryDepth: number;
    implementationScore: number;
    velocityStatus: string;
    dependenciesSatisfied: boolean;
}) {
    try {
        const studentId = await getStudentId();
        const advanced = data.masteryDepth >= 80
            && data.implementationScore >= 70
            && data.velocityStatus === "accelerating"
            && data.dependenciesSatisfied;
        const tier = advanced ? "advanced" : data.masteryDepth >= 50 ? "intermediate" : "beginner";

        // Update the learning profile
        const profile = await serverDb.query.learningProfiles.findFirst({
            where: eq(learningProfiles.studentId, studentId),
        });

        if (profile) {
            await serverDb
                .update(learningProfiles)
                .set({
                    level: tier,
                    confidenceScore: Math.round((data.masteryDepth + data.implementationScore) / 2),
                    lastAnalyzed: new Date(),
                })
                .where(eq(learningProfiles.id, profile.id));
        }

        revalidatePath("/profile");
        return { success: true, advancedUnlocked: advanced, tier };
    } catch (error) {
        console.error("Failed to check threshold:", error);
        return { success: false, error: String(error) };
    }
}

// ─── Full Cycle Persistence ─────────────────────────────────
export async function saveCopilotCycleResult(cycleData: {
    cycleNumber: number;
    profileLevel: string;
    bottlenecks: string[];
    careerScore: number;
    advancedUnlocked: boolean;
    tier: string;
    timestamp: number;
}) {
    try {
        const studentId = await getStudentId();
        await serverDb.insert(copilotCycles).values({
            studentId,
            cycleNumber: cycleData.cycleNumber,
            profileLevel: cycleData.profileLevel,
            bottlenecks: cycleData.bottlenecks as any,
            careerScore: cycleData.careerScore,
            advancedUnlocked: String(cycleData.advancedUnlocked),
            tier: cycleData.tier,
            fullState: cycleData as any,
        });
        revalidatePath("/profile");
        return { success: true };
    } catch (error) {
        console.error("Failed to save cycle result:", error);
        return { success: false, error: String(error) };
    }
}
