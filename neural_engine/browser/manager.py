"""
Persistent Browser Manager — keeps Playwright contexts alive across requests.

Key features:
- Single browser instance shared across all skills
- Named persistent contexts (WhatsApp, Gmail, etc.) with separate storage
- Contexts survive individual skill restarts
- Anti-detection stealth patches applied automatically
- Automatic screenshot capture for debugging
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)
from rich.console import Console

console = Console()

BROWSER_DATA_DIR = Path(__file__).parent.parent / "browser_data"
SCREENSHOTS_DIR = BROWSER_DATA_DIR / "screenshots"


class BrowserManager:
    """
    Singleton browser manager.
    One Chromium instance, multiple persistent contexts.
    """

    _instance: BrowserManager | None = None

    def __init__(self):
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._contexts: dict[str, BrowserContext] = {}
        self._pages: dict[str, Page] = {}
        self.is_alive = False

    @classmethod
    def get_instance(cls) -> BrowserManager:
        if cls._instance is None:
            cls._instance = BrowserManager()
        return cls._instance

    async def launch(self) -> None:
        """Start the browser (headless by default, set HEADFUL=1 for visible)."""
        if self._browser and self._browser.is_connected():
            return

        BROWSER_DATA_DIR.mkdir(parents=True, exist_ok=True)
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

        self._playwright = await async_playwright().start()

        headless = os.getenv("HEADFUL", "0") != "1"
        self._browser = await self._playwright.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-infobars",
                "--disable-extensions",
                "--disable-popup-blocking",
            ],
        )
        self.is_alive = True
        console.print(f"  🌐 Browser launched ({'headless' if headless else 'headful'})")

    async def get_context(self, name: str) -> BrowserContext:
        """
        Get or create a named persistent context.
        Each context has its own cookies, localStorage, sessions — so WhatsApp
        stays logged in separately from Gmail.
        """
        if name in self._contexts:
            ctx = self._contexts[name]
            # Check if context is still valid
            try:
                _ = ctx.pages
                return ctx
            except Exception:
                # Context died, recreate
                del self._contexts[name]

        if not self._browser or not self._browser.is_connected():
            await self.launch()

        assert self._browser is not None

        storage_dir = BROWSER_DATA_DIR / name
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_file = storage_dir / "state.json"

        # Load existing storage state if available
        storage_state = str(storage_file) if storage_file.exists() else None

        ctx = await self._browser.new_context(
            storage_state=storage_state,
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="Asia/Kolkata",
        )

        # Apply stealth patches
        await self._apply_stealth(ctx)

        # Auto-save storage state on close
        ctx.on("close", lambda: None)  # placeholder

        self._contexts[name] = ctx
        console.print(f"  📦 Browser context ready: [cyan]{name}[/]")
        return ctx

    async def get_page(self, context_name: str, url: str | None = None) -> Page:
        """Get or create a page in a named context."""
        ctx = await self.get_context(context_name)
        pages = ctx.pages
        if pages:
            page = pages[0]
        else:
            page = await ctx.new_page()

        if url:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

        self._pages[context_name] = page
        return page

    async def save_state(self, name: str) -> None:
        """Persist cookies and localStorage for a context."""
        if name not in self._contexts:
            return
        ctx = self._contexts[name]
        storage_dir = BROWSER_DATA_DIR / name
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_file = storage_dir / "state.json"
        try:
            state = await ctx.storage_state()
            import json
            with open(storage_file, "w") as f:
                json.dump(state, f)
            console.print(f"  💾 Saved browser state: {name}")
        except Exception as e:
            console.print(f"  ⚠️  Failed to save state for {name}: {e}")

    async def screenshot(self, context_name: str, label: str = "capture") -> str | None:
        """Take a screenshot of the current page. Returns the file path."""
        if context_name not in self._pages:
            return None
        page = self._pages[context_name]
        path = SCREENSHOTS_DIR / f"{context_name}_{label}_{int(asyncio.get_event_loop().time())}.png"
        try:
            await page.screenshot(path=str(path), full_page=False)
            return str(path)
        except Exception:
            return None

    async def close_context(self, name: str) -> None:
        """Close a specific context (saves state first)."""
        await self.save_state(name)
        if name in self._contexts:
            try:
                await self._contexts[name].close()
            except Exception:
                pass
            del self._contexts[name]
        self._pages.pop(name, None)

    async def close(self) -> None:
        """Shut down everything."""
        for name in list(self._contexts.keys()):
            await self.close_context(name)
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        self.is_alive = False
        console.print("  🌐 Browser closed")

    async def _apply_stealth(self, ctx: BrowserContext) -> None:
        """Apply anti-detection patches to evade bot detection."""
        await ctx.add_init_script("""
            // Override navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => false });

            // Override chrome detection
            window.chrome = { runtime: {} };

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);

            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        """)
