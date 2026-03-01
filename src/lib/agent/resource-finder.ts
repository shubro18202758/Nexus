import { Stagehand } from "./simple-stagehand";
import { z } from "zod";

export interface LearningResource {
    title: string;
    url: string;
    description: string;
}

export async function findResources(topic: string, limit: number = 3): Promise<LearningResource[]> {
    console.log(`🔍 Searching for resources on: ${topic} (Limit: ${limit})`);

    const stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
        // headless: true // Configured inside SimpleStagehand
    });

    try {
        await stagehand.init();
        // Use the wrapper's page for navigation if needed, or rely on .act()
        // SimpleStagehand exposes .page (Playwright Page)
        if (stagehand.page) {
            await stagehand.page.goto(`https://www.google.com/search?q=${encodeURIComponent(topic + " tutorial course")}&tbm=vid`);
        }

        // Use Stagehand instance method .extract(), NOT page.extract()
        const resources = await stagehand.extract({
            instruction: `Extract the top ${limit} video tutorials or courses from the search results.`,
            schema: z.object({
                results: z.array(z.object({
                    title: z.string(),
                    url: z.string(),
                    description: z.string(),
                }))
            })
        });

        return resources.results ? resources.results.slice(0, limit) : [];

    } catch (error) {
        console.error("Resource Search Failed:", error);
        return [];
    } finally {
        await stagehand.close();
    }
}
