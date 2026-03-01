import { type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Seeds a minimal student profile for app initialization.
 * Only creates the base student identity — projects, experience,
 * and teammates should be added by the user through the UI.
 * No fabricated credentials or dummy embeddings.
 */
export async function seedStudentProfile(db: PgliteDatabase<typeof schema>) {
    console.log("🌱 Starting Student Profile Seeding...");

    // 1. Clear existing student data
    try {
        await db.delete(schema.experience).execute();
        await db.delete(schema.projects).execute();
        await db.delete(schema.teammates).execute();
        await db.delete(schema.students).execute();
    } catch (e) {
        console.warn("Tables might not exist yet, proceeding to insert...", e);
    }

    // 2. Insert minimal student identity (user should update via Settings)
    const [student] = await db.insert(schema.students).values({
        name: "Sayan",
        email: "",
        phone: "",
        university: "",
        major: "",
        gpa: "",
        studentId: "",
        transcript: "",
        links: {},
        demographics: {},
    }).returning();

    console.log("✅ Student Profile Created (minimal):", student.id);
    console.log("ℹ️  Update your profile in Settings to add real details.");
    console.log("🌱 Seeding Complete!");
}
