"use server";

import { serverDb } from "@/lib/server-db";
import { learningProfiles, students, documents, tasks, workspaces } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function saveLearningProfile(profileData: any) {
    try {
        // 1. Get current student (Singleton for V1 local OS)
        const student = await serverDb.query.students.findFirst();

        if (!student) {
            throw new Error("No student profile found. Please create a profile first.");
        }

        // 2. Check if profile exists
        const existing = await serverDb.query.learningProfiles.findFirst({
            where: eq(learningProfiles.studentId, student.id)
        });

        if (existing) {
            // Update
            await serverDb.update(learningProfiles)
                .set({
                    level: profileData.level,
                    primaryDomains: profileData.primary_domains,
                    secondaryDomains: profileData.secondary_domains,
                    weakConcepts: profileData.weak_concepts,
                    strongConcepts: profileData.strong_concepts,
                    learningStyle: profileData.learning_style,
                    goalType: profileData.goal_type,
                    confidenceScore: Math.round(profileData.confidence_score * 100), // Store as 0-100
                    lastAnalyzed: new Date(),
                })
                .where(eq(learningProfiles.id, existing.id));
        } else {
            // Insert
            await serverDb.insert(learningProfiles).values({
                studentId: student.id,
                level: profileData.level,
                primaryDomains: profileData.primary_domains,
                secondaryDomains: profileData.secondary_domains,
                weakConcepts: profileData.weak_concepts,
                strongConcepts: profileData.strong_concepts,
                learningStyle: profileData.learning_style,
                goalType: profileData.goal_type,
                confidenceScore: Math.round(profileData.confidence_score * 100),
            });
        }

        revalidatePath("/profile");
        return { success: true };
    } catch (error) {
        console.error("Failed to save learning profile:", error);
        return { success: false, error: String(error) };
    }
}

export async function getLearningProfile() {
    try {
        const student = await serverDb.query.students.findFirst();
        if (!student) return null;

        const profile = await serverDb.query.learningProfiles.findFirst({
            where: eq(learningProfiles.studentId, student.id)
        });
        return profile;
    } catch (error) {
        console.error("Failed to fetch learning profile:", error);
        return null;
    }
}

export async function getUserContext() {
    try {
        const student = await serverDb.query.students.findFirst();
        if (!student) return "";

        // Fetch recent docs (limit 5)
        const recentDocs = await serverDb.query.documents.findMany({
            where: eq(documents.workspaceId, student.id), // Wait, docs are linked to workspace, not student directly? 
            // Workspaces table exists. Student might not be linked to workspace in schema yet?
            // Let's check schema. tasks -> workspaceId. documents -> workspaceId. 
            // students table is separate "Student OS" core.
            // We need to bridge them or just fetch all for V1 single user.
            limit: 5,
            orderBy: (docs, { desc }) => [desc(docs.createdAt)]
        });

        // Actually, if workspaceId is required, we might just fetch the first workspace?
        const workspace = await serverDb.query.workspaces.findFirst();
        let docsContext = "";
        let tasksContext = "";

        if (workspace) {
            const docs = await serverDb.query.documents.findMany({
                where: eq(documents.workspaceId, workspace.id),
                limit: 5,
            });
            docsContext = docs.map(d => `Document: ${d.title}\nContent Snippet: ${d.content?.slice(0, 200)}...`).join("\n\n");

            const recentTasks = await serverDb.query.tasks.findMany({
                where: eq(tasks.workspaceId, workspace.id),
                limit: 10
            });
            tasksContext = recentTasks.map(t => `Task: ${t.title} (${t.status})`).join("\n");
        }

        return `Recent Documents:\n${docsContext}\n\nRecent Tasks:\n${tasksContext}`;

    } catch (error) {
        console.error("Failed to fetch user context:", error);
        return "";
    }
}
