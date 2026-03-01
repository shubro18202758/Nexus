// const fetch = require('node-fetch'); // Using global fetch in Node 18+

async function mockIngestion() {
    console.log("🚀 Starting Mock Event Ingestion...");

    const events = [
        {
            source: "WhatsApp",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSxe8.../viewform",
            raw_context: "URGENT: Hackathon team needs a frontend dev! Apply ASAP. [Forwarded from CS Group]",
            priority: 5
        },
        {
            source: "Telegram",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSd.../viewform",
            raw_context: "Internship opportunity at stealth startup. Remote. filling fast.",
            priority: 4
        },
        {
            source: "WhatsApp",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSf.../viewform",
            raw_context: "Research Assistant position open in AI Lab. Contact Prof. X.",
            priority: 3
        },
        {
            source: "Telegram",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSg.../viewform",
            raw_context: "Beta testers needed for new productivity app. Paid user study.",
            priority: 2
        },
        {
            source: "WhatsApp",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSh.../viewform",
            raw_context: "Campus Ambassador program. Free swag!",
            priority: 1
        }
    ];

    const API_URL = "http://localhost:3002/api/ingest";

    for (const event of events) {
        try {
            console.log(`📡 Ingesting: ${event.raw_context.substring(0, 30)}...`);
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(event)
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`✅ Success: Event ID ${data.event.id}`);
            } else {
                console.error(`❌ Failed: Status ${res.status}`);
            }
        } catch (error) {
            console.error(`❌ Error connecting to API: ${(error as Error).message}`);
        }
        // Small delay to simulate real-time
        await new Promise(r => setTimeout(r, 500));
    }

    console.log("✨ Ingestion Complete! Check /events dashboard.");
}

mockIngestion();
