// Diagnostic test — check whatsapp-web.js internal Store state
const { Client, LocalAuth } = require("whatsapp-web.js");

console.log("[DIAG] Creating client...");
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
    timeout: 90000,
  },
});

client.on("qr", (qr) => {
  console.log("[DIAG] QR needed (should not happen with cached auth)");
});

client.on("authenticated", () => {
  console.log("[DIAG] Authenticated");
});

client.on("ready", async () => {
  console.log("[DIAG] ===== CLIENT READY =====");
  
  // Check internal state via Puppeteer page
  const page = client.pupPage;
  if (!page) {
    console.error("[DIAG] No Puppeteer page found!");
    return;
  }

  try {
    // Check if WhatsApp Store modules are available
    const storeCheck = await page.evaluate(() => {
      const results = {};
      
      // Check if window.Store exists (whatsapp-web.js injects this)
      results.hasStore = typeof window.Store !== 'undefined';
      results.hasWWebJS = typeof window.WWebJS !== 'undefined';
      
      if (window.Store) {
        results.storeKeys = Object.keys(window.Store).slice(0, 30);
        results.hasChat = !!window.Store.Chat;
        results.hasMsg = !!window.Store.Msg;
        results.hasMsgStore = !!window.Store.Msg;
        results.hasConn = !!window.Store.Conn;
        
        // Check if Chat store has items
        if (window.Store.Chat) {
          try {
            const chatModels = window.Store.Chat.getModelsArray ? window.Store.Chat.getModelsArray() : [];
            results.chatCount = chatModels.length;
            results.sampleChats = chatModels.slice(0, 3).map(c => ({
              id: c.id?._serialized || 'unknown',
              name: c.name || c.formattedTitle || 'unnamed'
            }));
          } catch (e) {
            results.chatError = e.message;
          }
        }
        
        // Check if Msg store has items
        if (window.Store.Msg) {
          try {
            const msgModels = window.Store.Msg.getModelsArray ? window.Store.Msg.getModelsArray() : [];
            results.msgCount = msgModels.length;
          } catch (e) {
            results.msgError = e.message;
          }
        }
      }
      
      return results;
    });
    
    console.log("[DIAG] Store state:", JSON.stringify(storeCheck, null, 2));
  } catch (e) {
    console.error("[DIAG] Page evaluate error:", e.message);
  }
  
  // Also check module raid status
  try {
    const moduleCheck = await page.evaluate(() => {
      try {
        const mR = window.mR; // moduleraid instance
        return {
          hasModuleRaid: !!mR,
          moduleCount: mR ? Object.keys(mR.modules || {}).length : 0,
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log("[DIAG] ModuleRaid:", JSON.stringify(moduleCheck));
  } catch (e) {
    console.error("[DIAG] ModuleRaid check error:", e.message);
  }

  // Listen for a bit then exit
  console.log("[DIAG] Waiting 30s for messages...");
  setTimeout(async () => {
    // Final check
    try {
      const finalCheck = await page.evaluate(() => {
        if (window.Store && window.Store.Msg) {
          const msgs = window.Store.Msg.getModelsArray ? window.Store.Msg.getModelsArray() : [];
          return {
            totalMsgs: msgs.length,
            recentMsgs: msgs.slice(-3).map(m => ({
              id: m.id?._serialized || 'unknown',
              from: m.from || 'unknown',
              body: (m.body || '').substring(0, 50),
              t: m.t,
            }))
          };
        }
        return { noStore: true };
      });
      console.log("[DIAG] Final msg state:", JSON.stringify(finalCheck, null, 2));
    } catch (e) {
      console.error("[DIAG] Final check error:", e.message);
    }
    
    console.log("[DIAG] Done. Exiting.");
    process.exit(0);
  }, 30000);
});

client.on("message", (msg) => {
  console.log("[DIAG-EVENT] message:", msg.from, msg.body?.substring(0, 50));
});

client.on("message_create", (msg) => {
  console.log("[DIAG-EVENT] message_create:", msg.from, msg.body?.substring(0, 50));
});

console.log("[DIAG] Initializing...");
client.initialize().then(() => {
  console.log("[DIAG] initialize() resolved");
}).catch((err) => {
  console.error("[DIAG] initialize() error:", err.message);
  process.exit(1);
});
