document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle-listening');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const eventCount = document.getElementById('event-count');
    const apiPortInput = document.getElementById('api-port');
    const portDisplay = document.getElementById('port-display');

    // Load saved state
    chrome.storage.local.get(['enabled', 'count', 'apiPort'], (result) => {
        const isEnabled = result.enabled !== false;
        toggle.checked = isEnabled;
        updateStatus(isEnabled);
        eventCount.textContent = result.count || 0;

        const port = result.apiPort || 3000;
        apiPortInput.value = port;
        portDisplay.textContent = port;
    });

    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.local.set({ enabled: isEnabled });
        updateStatus(isEnabled);
    });

    // Live port configuration — synced to observer.js via chrome.storage
    apiPortInput.addEventListener('change', () => {
        const port = parseInt(apiPortInput.value, 10);
        if (port >= 1000 && port <= 65535) {
            chrome.storage.local.set({ apiPort: port });
            portDisplay.textContent = port;
        }
    });

    // Auto-refresh count every 2s while popup is open
    setInterval(() => {
        chrome.storage.local.get(['count'], (result) => {
            eventCount.textContent = result.count || 0;
        });
    }, 2000);

    function updateStatus(isEnabled) {
        if (isEnabled) {
            statusText.textContent = "Listening Active";
            statusText.style.color = "#e4e4e7";
            statusDot.style.backgroundColor = "#4ade80";
            statusDot.style.boxShadow = "0 0 10px #4ade80";
        } else {
            statusText.textContent = "Listening Paused";
            statusText.style.color = "#71717a";
            statusDot.style.backgroundColor = "#ef4444";
            statusDot.style.boxShadow = "none";
        }
    }
});
