import { Stagehand } from "./simple-stagehand";
import { z } from "zod";
import { analyzeForm } from "./form-analyzer";
import { resolveTeamFields } from "./team-resolver";
import { mapProfileToForm } from "./reasoning-engine";
import { serverDb } from "@/lib/server-db";
import { students, projects, experience, type Student } from "@/db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

// Use proper named import
const StagehandClass = Stagehand;

export type FormContext = {
    student?: Student; // Optional: If not provided, will fetch default
    dryRun?: boolean;
    additionalInstructions?: string;
};

export async function fillForm(url: string, context: FormContext = {}): Promise<{ success: boolean; summary?: string; error?: string; screenshotPath?: string; screenshotBase64?: string }> {
    const { dryRun = true, additionalInstructions = "", student: providedStudent } = context;

    console.log(`🚀 Starting Form Filler Agent (DryRun: ${dryRun})`);
    if (additionalInstructions) console.log(`ℹ️ Additional Instructions: ${additionalInstructions}`);

    // Instantiate Stagehand ONCE at the beginning
    const stagehand = new StagehandClass({
        env: "LOCAL",
        enableVision: true,
        verbose: 1,
    });

    try {
        await stagehand.init();

        // 1. Analyze Form (using shared instance)
        const schema = await analyzeForm(stagehand, url);
        console.log("✅ Form Analyzed. Questions found:", schema.questions.length);

        // 2. Fetch or Use Student Profile
        let student = providedStudent;
        let studentProjects: any[] = [];
        let studentExp: any[] = [];

        // MOCK MODE FOR DB
        if (process.env.MOCK_STAGEHAND === 'true') {
            console.log("⚠️ Using MOCK MODE for Database Profile");
            student = {
                id: "mock-student-id",
                name: "John Doe",
                email: "john@example.com",
                phone: "1234567890",
                links: { github: "https://github.com/johndoe" },
                university: "Mock University",
                major: "Computer Science",
                gpa: "4.0",
                studentId: "12345",
                transcript: "A+ in everything",
                skills: ["TypeScript", "React"],
                bio: "I am a mock student.",
                createdAt: new Date(),
                updatedAt: new Date(),
                embedding: null
            } as any; // Cast to avoid strict type checks on partial mocks if needed

            studentProjects = [
                { title: "Mock Project", description: "A mock project", skills: "Mocking" }
            ];
            studentExp = [
                { role: "Mock Intern", company: "Mock Corp", description: "Did mock work" }
            ];
        } else if (!student) {
            const allStudents = await serverDb.select().from(students).limit(1);
            if (allStudents.length === 0) {
                throw new Error("No student profile found in DB.");
            }
            student = allStudents[0];
            studentProjects = await serverDb.select().from(projects).where(eq(projects.studentId, student.id));
            studentExp = await serverDb.select().from(experience).where(eq(experience.studentId, student.id));
        } else {
            studentProjects = await serverDb.select().from(projects).where(eq(projects.studentId, student.id));
            studentExp = await serverDb.select().from(experience).where(eq(experience.studentId, student.id));
        }

        // 3. Construct Profile Context
        // student is guaranteed set by the if-else chain above
        const s = student!;
        let profileContext = `
        Name: ${s.name}
        Email: ${s.email}
        Phone: ${s.phone}
        Links: ${JSON.stringify(s.links)}
        University: ${s.university}
        Major: ${s.major}
        GPA: ${s.gpa}
        Student ID: ${s.studentId}
        Bio/Transcript Summary: ${s.transcript ? s.transcript.substring(0, 500) + "..." : "N/A"}
        
        PROJECTS:
        ${studentProjects.map(p => `- ${p.title}: ${p.description} (Skills: ${p.skills})`).join("\n")}
        
        EXPERIENCE:
        ${studentExp.map(e => `- ${e.role} at ${e.company}: ${e.description}`).join("\n")}
        `;

        // 4. Resolve Team Data
        const teamContext = await resolveTeamFields(schema.questions.map((q: any) => q.label));
        if (teamContext) {
            profileContext += "\n" + teamContext;
        }

        if (additionalInstructions) {
            profileContext += "\nUSER COMMAND / CONTEXT:\n" + additionalInstructions;
        }

        // 5. Reason / Map
        console.log("🧠 Reasoning with Gemini...");
        const fillPlan = await mapProfileToForm(profileContext, schema);
        console.log("📋 Fill Plan:", JSON.stringify(fillPlan, null, 2));

        // 6. Act (Stagehand)
        // Already initialized.

        for (const question of schema.questions) {
            const value = fillPlan[question.label];
            if (value) {
                console.log(`✍️ Filling '${question.label}' with '${value}'`);
                await stagehand.act(`Fill the field labeled "${question.label}" with "${value}"`);
            }
        }

        if (dryRun) {
            console.log("🛑 Dry Run: Skipping submit.");
            const screenshotPath = path.resolve(process.cwd(), `dry_run_${Date.now()}.png`);

            // Try the public page property for screenshot
            const page = stagehand.page;

            if (page) {
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`📸 Screenshot saved to: ${screenshotPath}`);

                // Read file as base64
                const bitmap = fs.readFileSync(screenshotPath);
                const screenshotBase64 = Buffer.from(bitmap).toString('base64');

                return {
                    success: true,
                    summary: "Dry run completed. Form filled but not submitted.",
                    screenshotPath,
                    screenshotBase64
                };
            } else {
                console.warn("⚠️ Could not capture screenshot: Page object not found.");
                return {
                    success: true,
                    summary: "Dry run completed. Form filled but not submitted. (No Screenshot)",
                };
            }
        } else {
            console.log("🚀 Submitting form...");
            // More robust submit finding
            await stagehand.act("Find and click the primary 'Submit', 'Register', 'Sign Up', or 'Get Tickets' button.");
            console.log("✅ Form Submitted!");
            return { success: true, summary: "Form submitted successfully." };
        }

    } catch (error) {
        console.error("Form Filling Error:", error);
        return { success: false, error: String(error) };
    } finally {
        await stagehand.close();
    }
}
