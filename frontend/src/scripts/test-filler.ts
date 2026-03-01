import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { fillForm } from "../lib/agent/auto-filler";

async function runTest() {
    // Public T-Shirt Sign Up or similar found earlier
    const targetUrl = process.argv[2] || "https://docs.google.com/forms/d/e/1FAIpQLSxe8-T2b6q0o7k5a5X6q8j9hZ1l2m3n4o5p6q7r8s9t0/viewform";

    console.log(`🧪 Running Form Filler Test against: ${targetUrl}`);

    try {
        await fillForm(targetUrl, { dryRun: true }); // Dry Run = true
        console.log("\n✅ Test Complete. Check the 'dry_run_...' screenshot in the root directory.");
    } catch (error) {
        console.error("\n❌ Test Failed:", error);
    }
}

runTest();
