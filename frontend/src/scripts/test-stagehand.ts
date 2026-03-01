import { analyzeForm } from "../lib/agent/form-analyzer";
import { Stagehand } from "../lib/agent/simple-stagehand";

async function runTest() {
    const targetUrl = process.argv[2] || "https://docs.google.com/forms/d/e/1FAIpQLSxe8-T2b6q0o7k5a5X6q8j9hZ1l2m3n4o5p6q7r8s9t0/viewform";

    console.log(`Running Stagehand Test against: ${targetUrl}`);

    const stagehand = new Stagehand({
        env: "LOCAL",
        enableVision: true,
        verbose: 1,
    });

    try {
        await stagehand.init();
        const result = await analyzeForm(stagehand, targetUrl);
        console.log("\nExtracted Schema:\n");
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("\nTest Failed:", error);
    } finally {
        await stagehand.close();
    }
}

runTest();
