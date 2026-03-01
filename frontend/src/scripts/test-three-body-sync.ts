// ===================================================================
// Three-Body Orchestrator Sync Test
//
// Proves that the Local CEO (DeepSeek R1) can orchestrate tasks
// by explicitly delegating to Contract Engine Alpha (Groq Ingestion)
// and Contract Engine Beta (Groq Nanobot).
// ===================================================================

import "dotenv/config";
import { LLMEngine } from "../lib/ai/llm-engine";

async function main() {
    console.log("\n🚀 == THREE-BODY ORCHESTRATOR INITIALIZATION == 🚀\n");
    const engine = LLMEngine.getInstance();

    // The user's complex request
    const userRequest = "Hey, there's a React Hackathon happening tomorrow at 5 PM in the CS building. Can you extract the details and then draft a persuasive 3-sentence application for me to join a team?";

    console.log(`[USER REQUEST]: "${userRequest}"\n`);
    console.log("🧠 [Local CEO] (DeepSeek R1): Analyzing request and delegating tasks...\n");

    // ── STEP 1: DELEGATE TO ALPHA (Fast Extraction) ──
    console.log("⚙️  [CEO -> Alpha] Delegating extraction task to Groq-Alpha (llama-3.1-8b-instant)...");

    const alphaPrompt = `You are Contract Engine Alpha. Extract event details from the following message. Return ONLY a JSON object with { "event_name", "date_time", "location", "topic" }. Message: "${userRequest}"`;

    const alphaResult = await engine.chat(
        [{ role: "user", content: alphaPrompt }],
        { mode: "groq-alpha", json_mode: true } // Alpha explicitly uses the Alpha key
    );

    console.log(`✅ [Alpha Output]: ${alphaResult}\n`);

    // ── STEP 2: DELEGATE TO BETA (Complex Logic/Drafting) ──
    console.log("⚙️  [CEO -> Beta] Delegating creative drafting to Groq-Beta (llama-3.3-70b-versatile)...");

    const betaPrompt = `You are Contract Engine Beta (Nanobot). Using this exact extracted JSON, draft a highly persuasive, 3-sentence application paragraph proving I am the best fit for this event. JSON: ${alphaResult}`;

    const betaResult = await engine.chat(
        [{ role: "user", content: betaPrompt }],
        { mode: "groq-beta" } // Beta explicitly uses the Nanobot key
    );

    console.log(`✅ [Beta Output]:\n${betaResult}\n`);

    // ── STEP 3: CEO SYNTHESIS (Local DeepSeek R1) ──
    console.log("🧠 [Local CEO] Synthesizing final response locally...");

    const ceoPrompt = `You are the overarching CEO of a Three-Body AI system. 
You received a user request: "${userRequest}".
You delegated extraction to your Alpha engine: ${alphaResult}.
You delegated drafting to your Beta engine: ${betaResult}.

Briefly summarize to the user what you did, and present the final application draft the Beta engine created. Emphasize how your contract engines successfully handled the workload in parallel.`;

    const ceoResult = await engine.chat(
        [{ role: "user", content: ceoPrompt }],
        { mode: "local-ceo" }
    );

    console.log(`\n👑 [FINAL CEO RESPONSE]:\n${ceoResult}\n`);
}

main().catch(console.error);
