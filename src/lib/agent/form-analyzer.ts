import { Stagehand } from "./simple-stagehand";
import { z } from "zod";

export const formSchema = z.object({
    questions: z.array(z.object({
        label: z.string().describe("The text of the question"),
        type: z.enum(['text', 'radio', 'checkbox']).describe("The type of input required"),
        required: z.boolean().describe("Whether the question is mandatory"),
        options: z.array(z.string()).optional().describe("Options for radio/checkbox questions")
    }))
});

export async function analyzeForm(stagehand: Stagehand, url: string) {
    console.log(`🕵️‍♂️ Analyzing form at: ${url}`);

    // Use high-level API for navigation
    await stagehand.act(`navigate to ${url}`);

    // Extract using instance method
    const data = await stagehand.extract({
        instruction: "Extract all the questions from this Google Form.",
        schema: formSchema,
    });

    return data;
}
