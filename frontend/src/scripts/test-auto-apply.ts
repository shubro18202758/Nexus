
import { applyToEvent } from "@/actions/apply-to-event";

async function testAutoApply() {
    const TEST_URL = "https://docs.google.com/forms/d/e/1FAIpQLScyv7Wd-Wq_Zz7lWJj1xV8zQgQ9z7jXxYy6qQ4q3w2e1r1t3g/viewform"; // Replace with a real safe test form if possible, or use a known one. 
    // Ideally use a dummy form we control, or a public one that won't be spammed (since we do dryRun).
    // Using a generic "Contact Us" or similar form for testing is safer.
    // For now, let's assume the user has a test URL or we can use a dummy one.
    // Let's use a dummy URL and mock the Stagehand part? No, we need real browser.

    // Using a sample "Event Registration" type form found online or previously used.
    // For the sake of this test context, I'll use a placeholder that Stagehand might fail on if not real, 
    // so let's try a very simple public form or the TreeHacks one if available, but dryRun prevents submit.

    // Using a public logical form for testing
    const TARGET_URL = "https://docs.google.com/forms/d/e/1FAIpQLSd8ZtPz3Z7Z1Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3Z3/viewform"; // Hypothetical or use a real one.
    // Actually let's use a real one that is safe.
    // Wikipedia contact form? 
    // Let's use a placeholder and if it fails navigation we know Stagehand is working at least.
    // Better: "https://example.com" has no form.
    // Let's use the TreeHacks url from before:
    const TARGET_URL_REAL = "https://treehacks.stanford.edu";
    // But treehacks might not have a form directly on landing.
    // Let's use a generic Typeform or Google Form if we can finding one.
    // For now, I'll use a very simple test HTML file if I could serve it, but I can't easily.
    // I will use `https://www.w3schools.com/html/html_forms.asp` - it has input fields! 
    const W3_URL = "https://www.w3schools.com/html/html_forms.asp";
    // Let's use a known clean form to test mapping.
    // Actually, let's use a mocked server or just trust the dry run on a real simple form.

    const USER_INTENT = "I want to attend as a hacker interested in AI.";

    console.log("🧪 Testing Auto-Apply Action...");

    const result = await applyToEvent(TARGET_URL, USER_INTENT);

    if (result.error) {
        console.error("❌ Test Failed:", result.error);
    } else {
        console.log("✅ Test Passed!");
        console.log("📝 Message:", result.message);
        console.log("📸 Screenshot (Base64 length):", result.screenshot ? result.screenshot.length : "None");

        if (result.screenshot) {
            // Optional: Write to file to verify
            // import fs from 'fs';
            // fs.writeFileSync("test_output.png", Buffer.from(result.screenshot, 'base64'));
            console.log("✨ Screenshot data received.");
        }
    }
}

// Check if we can run this. server actions usually need Next.js context.
// src/scripts usually run with `tsx`. Calling a server action directly might fail if it depends on headers/cookies 
// not present in script. But our action only uses clean DB and logic. 
// `fillForm` uses `serverDb`. 
// Let's try.

testAutoApply();
