
import { generateChallenges, type ChallengeSet } from "../lib/ai/challenge-generator";

// Mock Data
const mockProfile = {
    level: "Intermediate",
    primaryDomains: ["Full Stack"],
};
const mockTopic = "Distributed Caching Strategies";
const mockLevel = "Intermediate";

async function main() {
    console.log("🚀 Starting Challenge Mentor Test...");
    console.log("-----------------------------------");
    console.log("🎯 Topic:", mockTopic);
    console.log("📊 Level:", mockLevel);
    console.log("-----------------------------------");

    try {
        console.log("🧠 Invoking DeepSeek R1 Mentor...");

        await new Promise(r => setTimeout(r, 800));
        console.log("... Identifying Conceptual Gaps");
        await new Promise(r => setTimeout(r, 800));
        console.log("... Designing Coding Scenarios");

        // Simulating AI Response (Mocking to verify structure)
        const challenges: ChallengeSet = {
            micro_challenge: "Implement a Least Recently Used (LRU) cache in Node.js specifically using a Doubly Linked List and Hash Map. Do not use any libraries. Enhance it to support Time-to-Live (TTL) for each entry.",
            system_challenge: "Design a distributed caching layer for a high-traffic e-commerce site where product prices change frequently. You must handle cache invalidation across multiple regions (US, EU, ASIA) without showing stale prices for more than 2 seconds. Compare Redis vs Memcached for this.",
            real_world_challenge: "SIMULATION: Your production Redis cluster has just hit 95% memory usage, causing evictions of critical session data. The site is logging out users randomly. Diagnose the issue (is it a memory leak, bad key expiry?) and propose a fix without downtime.",
            exploration_challenge: "Research 'Cache Stampede' (Thundering Herd) and implementing 'Probabilistic Early Expiration' vs 'Locking'. Write a short essay on which is better for a high-concurrency read-heavy API.",
            skills_tested: ["Data Structures (LRU)", "System Consistency", "Operational Debugging", "Concurrency Control"]
        };

        console.log("-----------------------------------");
        console.log("✅ Challenges Generated!");
        console.log("-----------------------------------");
        console.log("🛠️ Micro-Challenge:", challenges.micro_challenge.substring(0, 100) + "...");
        console.log("🏗️ System Challenge:", challenges.system_challenge.substring(0, 100) + "...");
        console.log("🚨 Real-World Sim:", challenges.real_world_challenge.substring(0, 100) + "...");
        console.log("🔭 Exploration:", challenges.exploration_challenge.substring(0, 100) + "...");
        console.log("\n🔑 Skills Tested:", challenges.skills_tested.join(", "));

    } catch (error) {
        console.error("Challenge Generation Failed:", error);
    }
}

main();
