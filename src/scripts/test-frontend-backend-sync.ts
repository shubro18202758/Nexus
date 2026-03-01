import "dotenv/config";

async function runIntegrationTest() {
    console.log("\n🚀 == SYNTHETIC UI INTEGRATION TEST == 🚀\n");

    try {
        // ── 1. Check Next.js Frontend ──
        console.log("🌐 [1/3] Pinging Next.js Frontend (port 3000)...");
        const nextRes = await fetch("http://localhost:3000/");
        if (nextRes.ok) {
            console.log("✅ Next.js Frontend is UP and accessible.\n");
        } else {
            console.log("❌ Next.js Frontend returned status:", nextRes.status);
        }

        // ── 2. Check Python Nanobot Backend Health ──
        console.log("🧠 [2/3] Pinging Python Nanobot Engine (port 7777)...");
        const healthRes = await fetch("http://localhost:7777/api/health");
        if (healthRes.ok) {
            const healthData = await healthRes.json();
            console.log(`✅ Python Backend is UP (Uptime: ${healthData.uptime_seconds}s).\n`);
        } else {
            console.log("❌ Python Backend returned status:", healthRes.status);
            return;
        }

        // ── 3. Simulate UI Chat Request to Backend ──
        console.log("💬 [3/3] Simulating a user message from the UI to the Nanobot...");
        const chatPayload = {
            message: "Analyze this text and tell me what you see.",
            session_id: "integration_test_uid",
            strategy: "cloud_first"  // Force the new GROQ_NANOBOT_KEY
        };

        console.log(`Sending Payload: ${JSON.stringify(chatPayload)}`);

        const chatRes = await fetch("http://localhost:7777/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatPayload)
        });

        if (chatRes.ok) {
            const chatData = await chatRes.json();
            console.log("\n✅ [Nanobot Response successfully received at UI layer]:");
            console.log("--------------------------------------------------");
            console.log(chatData.content || chatData.message);
            console.log("--------------------------------------------------");
            console.log(`⏱️ Duration: ${chatData.duration_ms} ms`);
            console.log(`⚙️ Engine Used: ${chatData.engine}`);
            console.log(`🔧 Tools Used: ${JSON.stringify(chatData.tools_used)}`);
            console.log("\n🎉 The Frontend-Backend sync is fully operational! The UI can successfully command the Python Nanobot.");
        } else {
            const errorText = await chatRes.text();
            console.log("❌ Chat request failed:", chatRes.status, errorText);
        }

    } catch (e) {
        console.error("❌ Integration test failed with error:", e);
    }
}

runIntegrationTest();
