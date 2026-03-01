import { chromium, Browser, Page, BrowserContext } from "playwright";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import * as fs from 'fs';

export class Stagehand {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    public page: Page | null = null;
    private options: any;
    private genAI: GoogleGenerativeAI | null = null;
    private groq: Groq | null = null;
    private model: any;
    private modelName: string = "gemini-2.0-flash"; // Default
    private provider: 'gemini' | 'groq' = 'gemini';
    private MOCK_ENABLED = true;

    constructor(options: any) {
        this.options = options;
        this.MOCK_ENABLED = process.env.MOCK_STAGEHAND === 'true';

        // Check for Groq API Key first as user requested switch
        const groqApiKey = process.env.GROQ_API_KEY;
        if (groqApiKey) {
            console.log("Using Groq Provider");
            this.provider = 'groq';
            this.groq = new Groq({ apiKey: groqApiKey });
            this.modelName = "llama-3.3-70b-versatile";
            this.MOCK_ENABLED = false; // Force real mode if key provided
        } else {
            console.log("Using Gemini Provider");
            const apiKey = options.modelClientOptions?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!apiKey && !this.MOCK_ENABLED) throw new Error("No API Key found (Gemini or Groq)");

            if (apiKey) {
                this.genAI = new GoogleGenerativeAI(apiKey);
                this.modelName = "gemini-2.0-flash";
                this.model = this.genAI.getGenerativeModel({ model: this.modelName });
            }
        }
    }

    async init() {
        console.log(`🚀 Initializing SimpleStagehand (${this.provider.toUpperCase()} - ${this.modelName})...`);

        if (this.MOCK_ENABLED || this.options.mock) {
            console.log("⚠️ Using FULL MOCK MODE for Stagehand (No Browser Launch)");
            this.page = {
                goto: async (url: string) => console.log(`[Mock] Goto ${url}`),
                fill: async (selector: string, value: string) => console.log(`[Mock] Fill ${selector} with ${value}`),
                click: async (selector: string) => console.log(`[Mock] Click ${selector}`),
                screenshot: async (options: { path: string }) => {
                    console.log(`[Mock] Screenshot to ${options.path}`);
                    fs.writeFileSync(options.path, "Mock Screenshot Data");
                },
                locator: (selector: string) => ({
                    first: () => ({
                        fill: async (val: string) => console.log(`[Mock] Locator('${selector}').fill('${val}')`),
                    }),
                }),
                evaluate: async (fn: any) => "Mock Page Text Content",
                content: async () => "<html><body>Mock DOM Content</body></html>",
            } as any;
            return { page: this.page };
        }

        this.browser = await chromium.launch({
            headless: true,
        });
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();
        return { page: this.page };
    }

    async act(actionOrOptions: string | { action: string }) {
        if (!this.page) throw new Error("Page not initialized");

        const actionDescription = (typeof actionOrOptions === "string" ? actionOrOptions : actionOrOptions?.action) || "";
        console.log(`🤖 SimpleStagehand Act (${this.provider}) [Mock:${this.MOCK_ENABLED}]: "${actionDescription}"`);

        if (!actionDescription) {
            console.error("❌ Action description is empty or undefined!", actionOrOptions);
            return;
        }

        if (actionDescription.startsWith("navigate to ")) {
            const url = actionDescription.replace("navigate to ", "").trim();
            await this.page.goto(url);
            return;
        }

        // MOCK MODE
        if (this.MOCK_ENABLED || this.options.mock) {
            // ... (Mock logic - same as before, abbreviated for brevity in replacement but keeping logic safe)
            // Handle any fill action generically
            if (actionDescription.toLowerCase().includes("fill")) {
                const labelMatch = actionDescription.match(/labeled\s+"([^"]+)"/i);
                const valueMatch = actionDescription.match(/with\s+"([^"]+)"/i);
                if (labelMatch && valueMatch) {
                    console.log(`⚠️ Mock Fill: "${labelMatch[1]}" => "${valueMatch[1]}"`);
                }
                return;
            }
            return;
        }

        // Real AI Logic
        const content = await this.page.content();
        const simplifiedDOM = content.substring(0, 30000);

        const prompt = `
        You are a browser automation agent.
        The user wants to perform this action: "${actionDescription}"
        
        Here is the HTML of the current page (truncated):
        ${simplifiedDOM}

        Analyze the HTML and identify the target element. 
        Return a JSON object with:
        - selector: The Playwright selector to interact with.
        - actionType: "click", "fill", or "type".
        - value: The value to fill (optional).
        - reasoning: Why you chose this.
        `;

        try {
            let jsonStr = "";

            if (this.provider === 'groq' && this.groq) {
                const completion = await this.groq.chat.completions.create({
                    messages: [
                        { role: "system", content: "You are a helpful browser automation assistant. You ONLY return valid JSON." },
                        { role: "user", content: prompt }
                    ],
                    model: this.modelName,
                    temperature: 0,
                    response_format: { type: "json_object" }
                });
                jsonStr = completion.choices[0]?.message?.content || "{}";
            } else if (this.genAI && this.model) {
                const result = await this.model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                });
                const text = result.response.text();
                const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
                jsonStr = jsonMatch ? jsonMatch[1] : text;
            }

            let plan;
            try {
                plan = JSON.parse(jsonStr);
            } catch (e) {
                console.error("Failed to parse JSON plan:", jsonStr);
                throw new Error("AI returned invalid JSON plan");
            }

            console.log(`🤖 AI Plan: ${plan.actionType || 'unknown'} on ${plan.selector || 'unknown'} (${plan.reasoning || 'unknown'})`);

            if (plan.actionType === "click") {
                await this.page.click(plan.selector);
            } else if (plan.actionType === "fill" || plan.actionType === "type") {
                const val = plan.value || "";
                await this.page.fill(plan.selector, val);
            }
        } catch (e: any) {
            const errMsg = `Act Error: ${e.message}\nStack: ${e.stack}`;
            try { fs.writeFileSync('error_log.txt', errMsg); } catch (f) { }
            console.warn(`⚠️ Action failed. Logged to error_log.txt.`);
            throw e;
        }
    }

    async extract(options: { instruction: string; schema?: any } | string, secondaryOptions?: { schema?: any }) {
        if (!this.page) throw new Error("Page not initialized");

        let instruction: string;
        if (typeof options === "string") {
            instruction = options;
        } else {
            instruction = options.instruction;
        }

        console.log(`🤖 SimpleStagehand Extract (${this.provider}): "${instruction}"`);

        // MOCK MODE
        if (this.MOCK_ENABLED || this.options.mock) {
            console.log("⚠️ Using MOCK MODE for Extract");
            return {
                questions: [
                    { label: "First name", type: "text", required: true },
                    { label: "Last name", type: "text", required: true }
                ],
            };
        }

        const content = await this.page.evaluate(() => document.body.innerText);
        const truncatedContent = content.substring(0, 50000);

        const prompt = `
        Extract the information based on this instruction: "${instruction}"
        
        Return the result as a valid JSON object.
        
        Page Content:
        ${truncatedContent}
        `;

        try {
            let jsonStr = "";

            if (this.provider === 'groq' && this.groq) {
                const completion = await this.groq.chat.completions.create({
                    messages: [
                        { role: "system", content: "You are a data extraction assistant. You ONLY return valid JSON." },
                        { role: "user", content: prompt }
                    ],
                    model: this.modelName,
                    temperature: 0,
                    response_format: { type: "json_object" }
                });
                jsonStr = completion.choices[0]?.message?.content || "{}";
            } else if (this.genAI && this.model) {
                const result = await this.model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                });
                const text = result.response.text();
                const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
                jsonStr = jsonMatch ? jsonMatch[1] : text;
            }

            return JSON.parse(jsonStr);
        } catch (e: any) {
            const errMsg = `Extract Error: ${e.message}\nStack: ${e.stack}`;
            try { fs.writeFileSync('error_log.txt', errMsg); } catch (f) { }
            console.error("Failed to extract:", e);
            throw new Error("AI extraction failed. Check error_log.txt");
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}
