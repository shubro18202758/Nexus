import { serverDb } from "@/lib/server-db";
import { teammates } from "@/db/schema";

export async function resolveTeamFields(formSchemaKeys: string[]): Promise<string> {
    // 1. Check if schema asks for Team info
    const teamKeywords = ["teammate", "partner", "collaborator", "member"];
    const hasTeamFields = formSchemaKeys.some(key =>
        key && teamKeywords.some(keyword => key.toLowerCase().includes(keyword))
    );

    if (!hasTeamFields) {
        return "";
    }

    // 2. Fetch Team Data
    // In a real scenario, we'd filter by the current user's ID. 
    // For this prototype, we'll fetch all teammates as the "User's Team".
    try {
        const team = await serverDb.select().from(teammates);

        if (team.length === 0) {
            return "No teammates found in profile.";
        }

        // 3. Construct Context
        let context = "TEAMMATES_CONTEXT:\n";
        team.forEach((member, idx) => {
            context += `Teammate ${idx + 1}: Name=${member.name}, Email=${member.email || "N/A"}, Role=${member.role || "N/A"}\n`;
        });

        return context;
    } catch (error) {
        console.error("Error resolving team fields:", error);
        return "";
    }
}
