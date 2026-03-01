// Bare-minimum whatsapp-web.js test — CommonJS
const { Client, LocalAuth } = require("whatsapp-web.js");

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
  console.log("[TEST] QR code generated (length=" + qr.length + ")");
});

client.on("authenticated", () => {
  console.log("[TEST] Authenticated!");
});

client.on("ready", async () => {
  console.log("[TEST] ===== CLIENT READY =====");
  
  try {
    const chats = await Promise.race([
      client.getChats(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    console.log("[TEST] getChats returned " + chats.length + " chats");
    for (const c of chats.slice(0, 5)) {
      console.log("  chat: " + (c.name || c.id._serialized) + " isGroup=" + c.isGroup);
    }
    
    if (chats.length > 0) {
      try {
        const msgs = await chats[0].fetchMessages({ limit: 10 });
        console.log("[TEST] fetchMessages on first chat: " + msgs.length + " messages");
        for (const m of msgs.slice(0, 3)) {
          console.log("  msg: from=" + m.from + " body=\"" + (m.body || "").substring(0, 50) + "\"");
        }
      } catch (e) {
        console.error("[TEST] fetchMessages error:", e.message);
      }
    }
  } catch (e) {
    console.error("[TEST] getChats error:", e.message);
  }
  
  console.log("[TEST] Now listening for incoming messages... send something to this phone");
});

client.on("message", (msg) => {
  console.log("[TEST-MSG] message: from=" + msg.from + " body=\"" + (msg.body || "").substring(0, 80) + "\"");
});

client.on("message_create", (msg) => {
  console.log("[TEST-MSG] message_create: from=" + msg.from + " body=\"" + (msg.body || "").substring(0, 80) + "\" fromMe=" + msg.fromMe);
});

client.on("disconnected", (reason) => {
  console.log("[TEST] Disconnected:", reason);
});

client.on("auth_failure", (err) => {
  console.error("[TEST] Auth failure:", err);
});

console.log("[TEST] Initializing...");
client.initialize().then(() => {
  console.log("[TEST] initialize() resolved");
}).catch((err) => {
  console.error("[TEST] initialize() error:", err.message);
});
