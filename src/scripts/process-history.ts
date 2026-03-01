
import fs from 'fs';
import path from 'path';

// Helper delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log("🚀 Starting Batch Event Processing...");

    const dumpPath = path.resolve(process.cwd(), 'whatsapp_events_dump.json');
    if (!fs.existsSync(dumpPath)) {
        console.error("❌ No dump file found at:", dumpPath);
        process.exit(1);
    }

    const rawData = fs.readFileSync(dumpPath, 'utf-8');
    const events = JSON.parse(rawData);

    console.log(`📂 Found ${events.length} messages to process.`);

    for (const [index, event] of events.entries()) {
        console.log(`\nProcessing ${index + 1}/${events.length}: from ${event.groupName}`);

        try {
            const response = await fetch('http://localhost:3000/api/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: event.content,
                    source: 'WhatsApp',
                    url: null, // Let API extract or ignore
                    metadata: {
                        groupName: event.groupName,
                        author: event.author,
                        timestamp: event.timestamp
                    }
                })
            });

            const result = await response.json();
            console.log(`   👉 Status: ${response.status} -`, result);
        } catch (error) {
            console.error("   ❌ Failed:", error);
        }

        // Rate limiting (1s) to be nice to LLM/DB
        await delay(1000);
    }

    console.log("\n✅ Processing Complete!");
}

main();
