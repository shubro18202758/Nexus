// Bare-minimum whatsapp-web.js test — no Next.js, no abstraction
// Run: node test-wa-bare.mjs
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

console.log("[TEST] Creating client...");
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    timeout: 60000,
  },
});

client.on("qr", (qr) => {
  console.log("[TEST] QR code generated (scan needed):", qr.substring(0, 40) + "...");
});

client.on("authenticated", () => {
  console.log("[TEST] Authenticated!");
});

client.on("ready", async () => {
  console.log("[TEST] ===== CLIENT READY =====");
  
  // Try getChats
  try {
    const chats = await Promise.race([
      client.getChats(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    console.log(`[TEST] getChats returned ${chats.length} chats`);
    for (const c of chats.slice(0, 5)) {
      console.log(`  chat: ${c.name || c.id._serialized} (isGroup=${c.isGroup})`);
    }
    
    // Try fetchMessages on first chat
    if (chats.length > 0) {
      try {
        const msgs = await chats[0].fetchMessages({ limit: 10 });
        console.log(`[TEST] fetchMessages on first chat returned ${msgs.length} messages`);
        for (const m of msgs.slice(0, 3)) {
          console.log(`  msg: from=${m.from}, body="${(m.body || "").substring(0, 50)}", ts=${m.timestamp}`);
        }
      } catch (e) {
        console.error("[TEST] fetchMessages error:", e.message);
      }
    }
  } catch (e) {
    console.error("[TEST] getChats error:", e.message);
  }
});

client.on("message", (msg) => {
  console.log(`[TEST-EVENT] message: from=${msg.from}, body="${(msg.body || "").substring(0, 80)}", ts=${msg.timestamp}`);
});

client.on("message_create", (msg) => {
  console.log(`[TEST-EVENT] message_create: from=${msg.from}, body="${(msg.body || "").substring(0, 80)}", ts=${msg.timestamp}, fromMe=${msg.fromMe}`);
});

client.on("disconnected", (reason) => {
  console.log("[TEST] Disconnected:", reason);
});

client.on("auth_failure", (err) => {
  console.error("[TEST] Auth failure:", err);
});

console.log("[TEST] Initializing client...");
client.initialize().then(() => {
  console.log("[TEST] client.initialize() resolved");
}).catch((err) => {
  console.error("[TEST] client.initialize() error:", err.message);
});
