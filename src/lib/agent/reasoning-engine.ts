import OpenAI from "openai";
import { AI_CONFIG } from "@/lib/ai/config";

// Initialize Local LLM
const localLLM = new OpenAI({
    baseURL: AI_CONFIG.BASE_URL,
    apiKey: "ollama",
});

interface FormQuestion {
    label: string;
    type: string;
    required: boolean;
    options?: string[];
}

export async function mapProfileToForm(
    profileContext: string,
    formSchema: { questions: FormQuestion[] }
): Promise<Record<string, string>> {
    // MOCK MODE
    if (process.env.MOCK_STAGEHAND === 'true') {
        console.log("⚠️ Using MOCK MODE for Reasoning Engine");
        return {
            "First name": "John",
            "Last name": "Doe",
            "Email": "john.doe@example.com",
            "Phone": "123-456-7890",
            "LinkedIn": "https://linkedin.com/in/johndoe",
            "Portfolio": "https://johndoe.com",
            "GitHub": "https://github.com/johndoe"
        };
    }
    const prompt = `
    You are an expert form-filling assistant. You have a Student Profile and a Form Schema. 
    Your goal is to map the profile data to the form fields. 
    If a field is ambiguous, use the vector descriptions in the profile to generate the best answer.

    STUDENT PROFILE CONTEXT:
    ${profileContext}

    FORM SCHEMA:
    ${JSON.stringify(formSchema, null, 2)}

    INSTRUCTIONS:
    1. Return a JSON object where keys are the 'label' from the form schema and values are the answers.
    2. For 'radio' or 'checkbox' types, the value must exactly match one of the provided 'options'.
    3. If no information is found for a field, leave the value as an empty string "" unless you can infer it.
    4. Do not include markdown formatting like \`\`\`json. Just return the raw JSON object.
    
    Respond ONLY with Valid JSON.
    `;

    console.log(`🧠 Reasoning with Local LLM (${AI_CONFIG.LOCAL_MODEL_NAME})...`);

    try {
        const completion = await localLLM.chat.completions.create({
            model: AI_CONFIG.LOCAL_MODEL_NAME,
            messages: [
                { role: "system", content: "You remain in strict JSON mode." },
                { role: "user", content: prompt }
            ],
            temperature: AI_CONFIG.TEMPERATURE,
        });

        const rawResponse = completion.choices[0].message.content || "{}";

        // Clean up markdown/think blocks
        let jsonString = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        jsonString = jsonString.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Reasoning Engine Error:", error);
        throw error;
    }
}
