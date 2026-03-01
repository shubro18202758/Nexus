const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        console.error("No API Key found");
        return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("Fetching models...");
    try {
        // There is no listModels on genAI directly in some versions?
        // Actually it is usually on the client.
        // But SDK might not expose it easily in high level.
        // Let's try to just use a known model and print info, or use REST.

        // Actually, let's use a simple fetch to list models if SDK fails.
        // API Endpoint: https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`));
        } else {
            console.error("Failed to list models:", data);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

listModels();
