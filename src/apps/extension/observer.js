console.log("Nexus Listener: Content Script Loaded");

let isEnabled = true;
let apiPort = 3000; // Default, updated from storage

// Load initial state
chrome.storage.local.get(['enabled', 'apiPort'], (result) => {
    isEnabled = result.enabled !== false;
    if (result.apiPort) apiPort = result.apiPort;
});

// Listen for state changes from popup
chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
        isEnabled = changes.enabled.newValue;
        console.log(`Nexus Listener: ${isEnabled ? 'Resumed' : 'Paused'}`);
    }
    if (changes.apiPort) {
        apiPort = changes.apiPort.newValue;
        console.log(`Nexus Listener: API port changed to ${apiPort}`);
    }
});

// ============================================
// URL deduplication — prevent sending the same URL twice per session
// ============================================
const sentUrls = new Set();

// ============================================
// Dynamic URL extraction from text nodes
// Captures plain-text URLs that aren't wrapped in <a> tags
// ============================================
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

function extractPlainTextUrls(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return [];
    const matches = node.textContent.match(URL_REGEX);
    return matches || [];
}

// ============================================
// Core scanner — handles both <a> links AND plain-text URLs
// No domain filtering — the server-side LLM decides relevance.
// ============================================
function scanNode(node) {
    if (!isEnabled) return;
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    const urls = new Set();
    let context = "";

    // 1. Find <a href> links
    const links = node.querySelectorAll ? node.querySelectorAll('a[href]') : [];
    links.forEach(link => {
        if (link.href && link.href.startsWith('http')) {
            urls.add(link.href);
        }
    });

    // 2. Find plain-text URLs in text nodes
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    let textNode;
    while (textNode = walker.nextNode()) {
        const found = extractPlainTextUrls(textNode);
        found.forEach(u => urls.add(u));
    }

    if (urls.size === 0) return;

    // 3. Extract context — walk up to find full message bubble text
    let parent = node;
    let depth = 0;
    while (parent && depth < 5) {
        if (parent.innerText && parent.innerText.length > context.length) {
            context = parent.innerText;
        }
        parent = parent.parentElement;
        depth++;
    }
    // Cap context to avoid huge payloads
    if (context.length > 1000) context = context.substring(0, 1000);

    // 4. Send each unique URL
    urls.forEach(url => {
        if (sentUrls.has(url)) return;
        sentUrls.add(url);
        ingestEvent(url, context);
    });
}

// ============================================
// MutationObserver — real-time message capture
// ============================================
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            scanNode(node);
            // Also scan children in case the link is nested
            if (node.querySelectorAll) {
                node.querySelectorAll('a[href]').forEach(link => {
                    const bubble = link.closest
                        ? link.closest('[data-pre-plain-text], [class*="message"], div[role="row"]')
                        : link.parentElement;
                    if (bubble) scanNode(bubble);
                });
            }
        }
    }
});

const targetNode = document.body;
if (targetNode) {
    observer.observe(targetNode, { childList: true, subtree: true });
    console.log("Nexus Listener: DOM Observer Started");
}

// ============================================
// Send to ingest API (port is dynamic from storage)
// ============================================
async function ingestEvent(url, context) {
    const apiUrl = `http://localhost:${apiPort}/api/ingest`;

    const payload = {
        source: window.location.hostname.includes('whatsapp') ? 'WhatsApp' : 'Telegram',
        text: context,
        url: url,
        priority: 2
    };

    console.log("Sending to Nexus:", url.substring(0, 60));

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log("Nexus Ingest Success:", url.substring(0, 60));
            chrome.storage.local.get(['count'], (result) => {
                const count = (result.count || 0) + 1;
                chrome.storage.local.set({ count });
            });
        } else {
            console.error("Nexus Ingest Failed:", res.status);
            // Allow retry on next mutation
            sentUrls.delete(url);
        }

    } catch (e) {
        console.error("Nexus Ingest Error (is dev server on port " + apiPort + "?):", e.message || e);
        // Allow retry on next mutation
        sentUrls.delete(url);
    }
}
