
import puppeteer from 'puppeteer';

async function main() {
    console.log("🚀 Launching Puppeteer...");
    const browser = await puppeteer.launch({ headless: true });
    console.log("✅ Browser launched!");
    await browser.close();
    console.log("👋 Browser closed.");
}

main().catch(console.error);
