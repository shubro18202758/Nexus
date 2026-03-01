
import { Client, LocalAuth, Chat, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import * as path from 'path';


// Configuration
const DEFAULT_LOOKBACK_DAYS = 30;
const KEYWORDS = ["hackathon", "meetup", "event", "workshop", "register", "apply", "lu.ma", "conf", "competition"];

async function main() {
    console.log("🚀 Starting WhatsApp History Import...");

    // Parse CLI Args
    const args = process.argv.slice(2);
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (args.length > 0) {
        // Simple parsing: --start 2023-01-01 --end 2023-01-31
        const startIdx = args.indexOf('--start');
        const endIdx = args.indexOf('--end');

        if (startIdx !== -1 && args[startIdx + 1]) {
            startDate = new Date(args[startIdx + 1]);
            console.log(`📅 Custom Start Date: ${startDate.toISOString()}`);
        }

        if (endIdx !== -1 && args[endIdx + 1]) {
            endDate = new Date(args[endIdx + 1]);
            console.log(`📅 Custom End Date: ${endDate.toISOString()}`);
        }
    }

    if (!startDate) {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - DEFAULT_LOOKBACK_DAYS);
        console.log(`📅 Default Start Date (30 days ago): ${startDate.toISOString()}`);
    }

    if (!endDate) {
        endDate = new Date(); // Present
        console.log(`📅 Default End Date (Now): ${endDate.toISOString()}`);
    }

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: path.resolve(process.cwd(), '.wwebjs_auth')
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('📷 QR RECEIVED. Scan with your phone:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', async () => {
        console.log('✅ Client is ready!');
        await fetchHistory(client, startDate!, endDate!);
    });

    client.on('auth_failure', msg => {
        console.error('❌ AUTHENTICATION FAILURE', msg);
    });

    console.log("🚀 Initializing Client...");
    client.initialize().catch(e => console.error("Init failed", e));
}

async function fetchHistory(client: Client, startDate: Date, endDate: Date) {
    // ... code to fetch chats ...
    // Race getChats with a timeout
    const chatsPromise = client.getChats();
    const timeoutPromise = new Promise<Chat[]>((_, reject) => setTimeout(() => reject(new Error("Timeout getting chats")), 30000));

    let chats: Chat[] = [];
    try {
        chats = await Promise.race([chatsPromise, timeoutPromise]);
    } catch (e) {
        console.error("⚠️ Failed to get chats via API (Timeout or Error):", e);
        console.log("Trying to list known chats from cache if available...");
    }

    console.log(`📂 Found ${chats.length} chats.`);

    // Filter for Groups
    const groupChats = chats.filter(chat => chat.isGroup);
    console.log(`👥 Found ${groupChats.length} group chats.`);

    console.log(`📅 Fetching messages between: ${startDate.toISOString()} and ${endDate.toISOString()}`);

    const allEvents: any[] = [];

    for (const chat of groupChats) {
        console.log(`🔍 Scanning Group: "${chat.name}"...`);

        // Fetch messages iteratively until we reach the start date
        let lastMsgId: string | undefined;
        let keepFetching = true;
        const MESSAGES_PER_BATCH = 100;
        const MAX_MESSAGES = 2000; // Safety cap
        let totalFetched = 0;

        while (keepFetching && totalFetched < MAX_MESSAGES) {
            const options: any = { limit: MESSAGES_PER_BATCH };
            if (lastMsgId) {
                // @ts-ignore
                options.before = lastMsgId;
            }

            const messages = await chat.fetchMessages(options);

            if (messages.length === 0) {
                break;
            }

            // Update lastMsgId for pagination (oldest message in batch)
            lastMsgId = messages[0].id._serialized;
            totalFetched += messages.length;

            // Process this batch
            for (const msg of messages) {
                const msgDate = new Date(msg.timestamp * 1000);

                // If message is older than start date, we can stop fetching for this chat
                if (msgDate < startDate) {
                    keepFetching = false;
                    // Don't continue this inner loop, but we might still have newer messages in this batch valid?
                    // Actually, fetchMessages returns newest last. So messages[0] is the oldest.
                    // If the oldest message in batch is NEWER than start date, we need to fetch more.
                    // If the oldest message in batch is OLDER than start date, we have crossed the boundary.
                }

                // Filter by Date Range (inclusive)
                if (msgDate >= startDate && msgDate <= endDate) {
                    if (isPotentialEvent(msg.body)) {
                        allEvents.push({
                            source: 'whatsapp',
                            groupName: chat.name,
                            timestamp: msgDate,
                            content: msg.body,
                            author: msg.author || msg.from,
                            status: 'PENDING'
                        });
                    }
                }
            }

            process.stdout.write(`.`);
        }
        console.log(` (Scanned ${totalFetched} msgs)`);
    }

    console.log(`✨ Found ${allEvents.length} potential events.`);

    // Save to a JSON file for inspection (Step 1)
    const outputPath = path.resolve(process.cwd(), 'whatsapp_events_dump.json');
    fs.writeFileSync(outputPath, JSON.stringify(allEvents, null, 2));
    console.log(`💾 Saved dump to ${outputPath}`);

    // Auto-ingest by triggering the pipeline script or API?
    // User wants "spawned... intercepted by this platform"
    // We should probably just process them right here or call the process script.
    // Let's call the `process-history.ts` logic here or just save to JSON and let the user trigger the next step?
    // For specific "intercepted by this platform", we should probably POST them to /api/ingest
    // Let's add that here.

    console.log("🚀 Sending to Ingestion API...");
    const ingestUrl = 'http://localhost:3000/api/ingest'; // Assuming local

    // We need to fetch via native fetch since we are in node environment (polyfilled in v18+)

    let processed = 0;
    for (const event of allEvents) {
        try {
            await fetch(ingestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: event.content, // 'text' or 'content' based on API
                    source: "WhatsApp",
                    metadata: {
                        timestamp: event.timestamp,
                        groupName: event.groupName,
                        author: event.author
                    }
                })
            });
            processed++;
            if (processed % 5 === 0) process.stdout.write('.');
            // Small delay to avoid hammering
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            console.error(`Failed to ingest event:`, e);
        }
    }
    console.log(`\n✅ Ingested ${processed} events.`);

    console.log("👋 Done. Closing client.");
    await client.destroy();
    process.exit(0);
}

function isPotentialEvent(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    // 1. Check for URL
    const hasLink = lower.includes("http");
    // 2. Check for Keywords
    const hasKeyword = KEYWORDS.some(k => lower.includes(k));

    return hasLink || hasKeyword;
}

main().catch(err => console.error(err));

