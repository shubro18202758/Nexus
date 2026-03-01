import { fetch } from "next/dist/compiled/@edge-runtime/primitives/fetch";

async function testIngest() {
    const payload = {
        source: "WhatsApp",
        url: "https://treehacks.stanford.edu",
        content: "Hey everyone! Check out TreeHacks 2026. It's Stanford's premier hackathon. Applications are open now! Use this link to apply. Great for CS majors."
    };

    console.log("🚀 Sending Test Payload:", payload);

    try {
        const response = await fetch("http://localhost:3000/api/ingest", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log("✅ Response Status:", response.status);
        console.log("📄 Response Data:", JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("❌ Request Failed:", error);
    }
}

testIngest();
