"""
WhatsApp Skill — persistent WhatsApp Web session via Playwright.

Features:
- Persistent login (scan QR once, stays logged in)
- Read messages from any chat/group
- Send messages to contacts or groups
- Listen for new messages in real-time
- Forward important messages to the ingestion pipeline
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx

from nanobot.types import (
    ParameterSpec,
    SkillManifest,
    SkillMethod,
    SkillStatus,
    ToolResult,
)
from skills.base import BaseSkill

WHATSAPP_URL = "https://web.whatsapp.com"
NEXUS_INGEST_URL = os.getenv("NEXUS_INGEST_URL", "http://localhost:3000/api/ingest")


class WhatsAppSkill(BaseSkill):
    """WhatsApp automation via persistent Playwright browser context."""

    def __init__(self):
        super().__init__()
        self._browser_mgr: Any = None
        self._page: Any = None
        self._listening = False
        self._listen_task: asyncio.Task | None = None

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="whatsapp",
            description="Send and read WhatsApp messages. Maintains a persistent browser session.",
            category="communication",
            requires_browser=True,
            methods=[
                SkillMethod(
                    name="send_message",
                    description="Send a WhatsApp message to a contact or group",
                    parameters={
                        "recipient": ParameterSpec(
                            type="string",
                            description="Contact name or group name",
                        ),
                        "message": ParameterSpec(
                            type="string",
                            description="Message text to send",
                        ),
                    },
                    example='{"recipient": "ML Study Group", "message": "Meeting at 5pm today!"}',
                ),
                SkillMethod(
                    name="read_messages",
                    description="Read recent messages from a specific chat",
                    parameters={
                        "chat_name": ParameterSpec(
                            type="string",
                            description="Name of the chat/group to read",
                        ),
                        "count": ParameterSpec(
                            type="number",
                            description="Number of recent messages to fetch",
                            required=False,
                            default=10,
                        ),
                    },
                    example='{"chat_name": "CSE Batch 2026", "count": 5}',
                ),
                SkillMethod(
                    name="get_unread",
                    description="Get all unread chats and their message counts",
                    parameters={},
                    example="{}",
                ),
                SkillMethod(
                    name="start_listener",
                    description="Start listening for new messages and forward important ones",
                    parameters={
                        "groups": ParameterSpec(
                            type="array",
                            description="List of group names to monitor (empty = all)",
                            required=False,
                            default=[],
                        ),
                    },
                ),
                SkillMethod(
                    name="check_login",
                    description="Check if WhatsApp Web is logged in",
                    parameters={},
                ),
            ],
        )

    async def startup(self) -> None:
        from browser.manager import BrowserManager

        self._browser_mgr = BrowserManager.get_instance()

    async def shutdown(self) -> None:
        if self._listen_task and not self._listen_task.done():
            self._listen_task.cancel()
        if self._browser_mgr:
            await self._browser_mgr.save_state("whatsapp")

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "check_login":
                return await self._check_login()
            elif method == "send_message":
                return await self._send_message(
                    params["recipient"], params["message"]
                )
            elif method == "read_messages":
                return await self._read_messages(
                    params["chat_name"], params.get("count", 10)
                )
            elif method == "get_unread":
                return await self._get_unread()
            elif method == "start_listener":
                return await self._start_listener(params.get("groups", []))
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"WhatsApp error: {str(e)}")

    # ── Private Methods ────────────────────────────────────────

    async def _ensure_page(self) -> Any:
        """Ensure WhatsApp Web is open and loaded."""
        if self._page:
            try:
                await self._page.title()
                return self._page
            except Exception:
                self._page = None

        page = await self._browser_mgr.get_page("whatsapp", WHATSAPP_URL)
        # Wait for the app to load (either QR code or chat list)
        try:
            await page.wait_for_selector(
                'div[data-testid="chat-list"], canvas[aria-label*="QR"]',
                timeout=15000,
            )
        except Exception:
            pass  # Page might still be loading
        self._page = page
        return page

    async def _check_login(self) -> ToolResult:
        page = await self._ensure_page()
        try:
            # Check if chat list is visible (= logged in)
            chat_list = await page.query_selector('div[data-testid="chat-list"]')
            if chat_list:
                return self._ok({"logged_in": True, "message": "WhatsApp Web is logged in and ready."})

            # Check for QR code
            qr = await page.query_selector('canvas[aria-label*="QR"]')
            if qr:
                # Take screenshot so user can scan
                path = await self._browser_mgr.screenshot("whatsapp", "qr_code")
                return self._ok({
                    "logged_in": False,
                    "message": "QR code displayed. Please scan with your phone.",
                    "screenshot": path,
                })

            return self._ok({"logged_in": False, "message": "WhatsApp Web is loading..."})
        except Exception as e:
            return self._err(f"Login check failed: {e}")

    async def _send_message(self, recipient: str, message: str) -> ToolResult:
        page = await self._ensure_page()

        # Search for the contact/group
        search_box = await page.wait_for_selector(
            'div[data-testid="chat-list-search"]', timeout=5000
        )
        if not search_box:
            return self._err("Cannot find search box. Is WhatsApp logged in?")

        await search_box.click()
        await search_box.fill(recipient)
        await asyncio.sleep(1.5)

        # Click the matching chat
        chat = await page.query_selector(f'span[title="{recipient}"]')
        if not chat:
            # Try partial match
            chat = await page.query_selector(
                f'span._ao3e[title*="{recipient}" i]'
            )
        if not chat:
            return self._err(f"Chat '{recipient}' not found.")

        await chat.click()
        await asyncio.sleep(0.5)

        # Type and send
        msg_box = await page.wait_for_selector(
            'div[data-testid="conversation-compose-box-input"]', timeout=5000
        )
        if not msg_box:
            return self._err("Cannot find message input box.")

        await msg_box.click()
        await msg_box.fill(message)
        await asyncio.sleep(0.3)

        send_btn = await page.query_selector('button[data-testid="send"]')
        if send_btn:
            await send_btn.click()
        else:
            await page.keyboard.press("Enter")

        await self._browser_mgr.save_state("whatsapp")
        return self._ok(f"Message sent to '{recipient}': {message[:50]}...")

    async def _read_messages(self, chat_name: str, count: int) -> ToolResult:
        page = await self._ensure_page()

        # Navigate to the chat
        search_box = await page.wait_for_selector(
            'div[data-testid="chat-list-search"]', timeout=5000
        )
        if not search_box:
            return self._err("Search box not found.")

        await search_box.click()
        await search_box.fill(chat_name)
        await asyncio.sleep(1.5)

        chat = await page.query_selector(f'span[title="{chat_name}"]')
        if not chat:
            return self._err(f"Chat '{chat_name}' not found.")

        await chat.click()
        await asyncio.sleep(1.0)

        # Extract messages
        messages = await page.evaluate(f"""
            () => {{
                const msgs = document.querySelectorAll('div.message-in, div.message-out');
                const result = [];
                const slice = Array.from(msgs).slice(-{count});
                for (const msg of slice) {{
                    const textEl = msg.querySelector('span.selectable-text');
                    const timeEl = msg.querySelector('span[data-testid="msg-time"]');
                    const isOutgoing = msg.classList.contains('message-out');
                    if (textEl) {{
                        result.push({{
                            text: textEl.innerText,
                            time: timeEl ? timeEl.innerText : '',
                            from_me: isOutgoing,
                        }});
                    }}
                }}
                return result;
            }}
        """)

        return self._ok({
            "chat": chat_name,
            "count": len(messages),
            "messages": messages,
        })

    async def _get_unread(self) -> ToolResult:
        page = await self._ensure_page()

        unread = await page.evaluate("""
            () => {
                const chats = document.querySelectorAll('div[data-testid="cell-frame-container"]');
                const result = [];
                for (const chat of chats) {
                    const badge = chat.querySelector('span[data-testid="icon-unread-count"]');
                    if (badge) {
                        const name = chat.querySelector('span[data-testid="cell-frame-title"]');
                        result.push({
                            chat: name ? name.innerText : 'Unknown',
                            unread_count: parseInt(badge.innerText) || 1,
                        });
                    }
                }
                return result;
            }
        """)

        return self._ok({
            "total_unread_chats": len(unread),
            "chats": unread,
        })

    async def _start_listener(self, groups: list[str]) -> ToolResult:
        if self._listening:
            return self._ok("Listener is already running.")

        self._listening = True
        self._listen_task = asyncio.create_task(self._listener_loop(groups))
        return self._ok(f"Message listener started. Monitoring: {'all chats' if not groups else ', '.join(groups)}")

    async def _listener_loop(self, groups: list[str]) -> None:
        """Background loop that polls for new messages and forwards to ingestion."""
        seen_messages: set[str] = set()

        while self._listening:
            try:
                page = await self._ensure_page()

                # Get notification badges
                unread_data = await page.evaluate("""
                    () => {
                        const chats = document.querySelectorAll('div[data-testid="cell-frame-container"]');
                        const result = [];
                        for (const chat of chats) {
                            const badge = chat.querySelector('span[data-testid="icon-unread-count"]');
                            if (badge) {
                                const name = chat.querySelector('span[data-testid="cell-frame-title"]');
                                const preview = chat.querySelector('span[data-testid="last-msg-status"]');
                                result.push({
                                    chat: name ? name.innerText : 'Unknown',
                                    preview: preview ? preview.innerText : '',
                                });
                            }
                        }
                        return result;
                    }
                """)

                for item in unread_data:
                    chat_name = item.get("chat", "")
                    preview = item.get("preview", "")

                    # Filter by group list if specified
                    if groups and chat_name not in groups:
                        continue

                    # Dedup
                    msg_key = f"{chat_name}:{preview[:50]}"
                    if msg_key in seen_messages:
                        continue
                    seen_messages.add(msg_key)

                    # Forward to Next.js ingestion pipeline
                    try:
                        async with httpx.AsyncClient() as client:
                            await client.post(
                                NEXUS_INGEST_URL,
                                json={
                                    "source": "whatsapp",
                                    "channel": chat_name,
                                    "content": preview,
                                    "raw": preview,
                                },
                                timeout=10.0,
                            )
                    except Exception:
                        pass  # Don't crash listener for ingestion failures

                # Trim seen set to prevent unbounded growth
                if len(seen_messages) > 500:
                    seen_messages = set(list(seen_messages)[-250:])

            except Exception:
                pass  # Resilient — don't die on transient errors

            await asyncio.sleep(5)  # Poll every 5 seconds
