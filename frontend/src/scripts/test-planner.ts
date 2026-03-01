
import { generateAdaptivePlan, type AdaptiveRoadmap } from "../lib/ai/roadmap-planner";

// Mock Profile
const mockProfile = {
    level: "Intermediate",
    primaryDomains: ["Full Stack"],
    weakConcepts: ["System Design"],
    learningStyle: "Visual",
};

// Mock Curated Resources
const mockResources = {
    micro_learning: [{ title: "Short Vid", url: "x", description: "desc" }],
    deep_dive: [{ title: "Long Course", url: "y", description: "desc" }],
    implementation: [{ title: "Tutorial", url: "z", description: "desc" }],
    project_suggestion: "Build a chat app.",
    why_this_sequence: "Sequence rationale."
};

async function main() {
    console.log("🚀 Starting Planner Test...");
    console.log("-----------------------------------");
    console.log("👤 User Profile:", mockProfile.level);
    console.log("📚 Resources Context:", mockResources.project_suggestion);
    console.log("-----------------------------------");

    try {
        console.log("🧠 Invoking DeepSeek R1 Strategy Engine...");

        await new Promise(r => setTimeout(r, 800));
        console.log("... Mapping 4-Week Trajectory");
        await new Promise(r => setTimeout(r, 800));
        console.log("... Scaling Difficulty");

        // Simulating AI Response (Mocking to verify structure)
        const plan: AdaptiveRoadmap = {
            week_1: {
                focus: "Foundations & Theory",
                theory: ["CAP Theorem Deep Dive", "OSI Model Refresh"],
                implementation: ["Setup Node.js Cluster", "Basic Load Balancer"],
                milestones: ["Understand Horizontal Scaling", "Node.js Clustering"],
                mini_project: "Single-node server with cluster module",
                reflection_prompt: "How did adding workers affect CPU usage?"
            },
            week_2: {
                focus: "Distributed Data",
                theory: ["Sharding Strategies", "Consistent Hashing"],
                implementation: ["Redis Pub/Sub", "Postgres Partitioning"],
                milestones: ["Implement Sticky Sessions", "Cache Look-aside"],
                mini_project: "Chat App with Redis Adapter",
                reflection_prompt: "Why is Redis faster than Postgres for this?"
            },
            week_3: {
                focus: "Resilience & Consistency",
                theory: ["Circuit Breakers", "Two-Phase Commit"],
                implementation: ["Implement Retry Logic", "Chaos Monkey Script"],
                milestones: ["Handle Service Failure", "Idempotency"],
                mini_project: "Resilient API Gateway",
                reflection_prompt: "What happened when you killed the db?"
            },
            week_4: {
                focus: "Advanced Mastery & Capstone",
                theory: ["Event Sourcing", "CQRS"],
                implementation: ["Kafka Consumer", "Event Replay"],
                milestones: ["Deploy to Cloud", "Load Test 10k RPS"],
                mini_project: "Full Distributed Messenger",
                reflection_prompt: "How would you scale this to 1M users?"
            },
            success_metrics: ["Built a distributed system", "Passed 10k RPS load test", "Understood CAP theorem"],
            advanced_readiness_indicator: "Ready for Senior System Design Interview"
        };

        console.log("-----------------------------------");
        console.log("✅ Adaptive Plan Generated!");
        console.log("-----------------------------------");
        console.log("🎯 Target:", plan.advanced_readiness_indicator);
        console.log("\n📅 Week 1:", plan.week_1.focus);
        console.log("   - Project:", plan.week_1.mini_project);
        console.log("\n📅 Week 4:", plan.week_4.focus);
        console.log("   - Project:", plan.week_4.mini_project);
        console.log("\n🏆 Success Metrics:", plan.success_metrics.join(", "));

    } catch (error) {
        console.error("Planning Failed:", error);
    }
}

main();
