"use server";

import { serverDb } from "@/lib/server-db";
import { learningRoadmaps, students, learningProfiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function saveRoadmap(domain: string, roadmapData: any) {
    try {
        const student = await serverDb.query.students.findFirst();
        if (!student) throw new Error("No student found");

        // Save to DB
        await serverDb.insert(learningRoadmaps).values({
            studentId: student.id,
            domain,
            roadmapData,
        });

        revalidatePath("/profile");
        return { success: true };
    } catch (error) {
        console.error("Failed to save roadmap:", error);
        return { success: false, error: String(error) };
    }
}

export async function getRoadmaps() {
    try {
        const student = await serverDb.query.students.findFirst();
        if (!student) return [];

        return await serverDb.query.learningRoadmaps.findMany({
            where: eq(learningRoadmaps.studentId, student.id),
            orderBy: [desc(learningRoadmaps.createdAt)]
        });
    } catch (error) {
        return [];
    }
}
