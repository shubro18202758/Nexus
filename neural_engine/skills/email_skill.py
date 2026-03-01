"""
Email Skill — Gmail/Outlook integration via Playwright persistent session.

Features:
- Read inbox (latest emails, unread count)
- Send emails
- Search emails by keyword
- Draft replies
- Works with any webmail via persistent browser context
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from nanobot.types import (
    ParameterSpec,
    SkillManifest,
    SkillMethod,
    ToolResult,
)
from skills.base import BaseSkill

GMAIL_URL = "https://mail.google.com"


class EmailSkill(BaseSkill):
    """Email management via persistent Gmail browser session."""

    def __init__(self):
        super().__init__()
        self._browser_mgr: Any = None
        self._page: Any = None

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="email",
            description="Read, send, and search emails via Gmail. Persistent login.",
            category="communication",
            requires_browser=True,
            methods=[
                SkillMethod(
                    name="get_inbox",
                    description="Get recent emails from inbox",
                    parameters={
                        "count": ParameterSpec(
                            type="number",
                            description="Number of recent emails to fetch",
                            required=False,
                            default=10,
                        ),
                    },
                    example='{"count": 5}',
                ),
                SkillMethod(
                    name="get_unread_count",
                    description="Get the number of unread emails",
                    parameters={},
                    example="{}",
                ),
                SkillMethod(
                    name="read_email",
                    description="Read the full content of a specific email by subject line",
                    parameters={
                        "subject": ParameterSpec(
                            type="string",
                            description="Subject line of the email to open (partial match)",
                        ),
                    },
                ),
                SkillMethod(
                    name="send_email",
                    description="Compose and send a new email",
                    parameters={
                        "to": ParameterSpec(
                            type="string",
                            description="Recipient email address",
                        ),
                        "subject": ParameterSpec(
                            type="string",
                            description="Email subject line",
                        ),
                        "body": ParameterSpec(
                            type="string",
                            description="Email body text",
                        ),
                    },
                    example='{"to": "prof@iitb.ac.in", "subject": "Assignment Extension", "body": "Dear Prof..."}',
                ),
                SkillMethod(
                    name="search_emails",
                    description="Search emails by keyword",
                    parameters={
                        "query": ParameterSpec(
                            type="string",
                            description="Search query (same as Gmail search)",
                        ),
                        "count": ParameterSpec(
                            type="number",
                            description="Max results",
                            required=False,
                            default=5,
                        ),
                    },
                    example='{"query": "from:placement@iitb.ac.in", "count": 10}',
                ),
                SkillMethod(
                    name="check_login",
                    description="Check if Gmail is logged in",
                    parameters={},
                ),
            ],
        )

    async def startup(self) -> None:
        from browser.manager import BrowserManager

        self._browser_mgr = BrowserManager.get_instance()

    async def shutdown(self) -> None:
        if self._browser_mgr:
            await self._browser_mgr.save_state("gmail")

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "check_login":
                return await self._check_login()
            elif method == "get_inbox":
                return await self._get_inbox(params.get("count", 10))
            elif method == "get_unread_count":
                return await self._get_unread_count()
            elif method == "read_email":
                return await self._read_email(params["subject"])
            elif method == "send_email":
                return await self._send_email(
                    params["to"], params["subject"], params["body"]
                )
            elif method == "search_emails":
                return await self._search_emails(
                    params["query"], params.get("count", 5)
                )
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"Email error: {e}")

    # ── Private ────────────────────────────────────────────────

    async def _ensure_page(self) -> Any:
        if self._page:
            try:
                await self._page.title()
                return self._page
            except Exception:
                self._page = None

        page = await self._browser_mgr.get_page("gmail", GMAIL_URL)
        await asyncio.sleep(3)  # Gmail takes a bit to load
        self._page = page
        return page

    async def _check_login(self) -> ToolResult:
        page = await self._ensure_page()
        try:
            # Check if compose button exists (= logged in)
            compose = await page.query_selector('div[gh="cm"]')
            if compose:
                return self._ok({"logged_in": True, "message": "Gmail is logged in."})

            # Check for sign-in prompt
            path = await self._browser_mgr.screenshot("gmail", "login_check")
            return self._ok({
                "logged_in": False,
                "message": "Not logged into Gmail. Please log in manually in the browser.",
                "screenshot": path,
            })
        except Exception as e:
            return self._err(f"Login check failed: {e}")

    async def _get_inbox(self, count: int) -> ToolResult:
        page = await self._ensure_page()

        # Navigate to inbox
        await page.goto(GMAIL_URL + "/mail/u/0/#inbox")
        await asyncio.sleep(2)

        emails = await page.evaluate(f"""
            () => {{
                const rows = document.querySelectorAll('tr.zA');
                const result = [];
                const slice = Array.from(rows).slice(0, {count});
                for (const row of slice) {{
                    const sender = row.querySelector('.yX .yW span');
                    const subject = row.querySelector('.y6 span:first-child');
                    const snippet = row.querySelector('.y2');
                    const time = row.querySelector('.xW span');
                    const isUnread = row.classList.contains('zE');
                    result.push({{
                        sender: sender ? sender.getAttribute('email') || sender.innerText : 'Unknown',
                        sender_name: sender ? sender.innerText : 'Unknown',
                        subject: subject ? subject.innerText : '(no subject)',
                        snippet: snippet ? snippet.innerText : '',
                        time: time ? time.getAttribute('title') || time.innerText : '',
                        unread: isUnread,
                    }});
                }}
                return result;
            }}
        """)

        return self._ok({
            "count": len(emails),
            "emails": emails,
        })

    async def _get_unread_count(self) -> ToolResult:
        page = await self._ensure_page()

        count = await page.evaluate("""
            () => {
                const el = document.querySelector('.aim .bsU');
                if (el) return parseInt(el.innerText) || 0;
                // Try title bar
                const title = document.title;
                const match = title.match(/\\((\\d+)\\)/);
                return match ? parseInt(match[1]) : 0;
            }
        """)

        return self._ok({
            "unread_count": count,
            "message": f"You have {count} unread email(s)." if count else "Inbox zero! No unread emails.",
        })

    async def _read_email(self, subject: str) -> ToolResult:
        page = await self._ensure_page()

        # Search for the email
        search_box = await page.query_selector('input[aria-label="Search mail"]')
        if search_box:
            await search_box.click()
            await search_box.fill(f"subject:{subject}")
            await page.keyboard.press("Enter")
            await asyncio.sleep(2)

        # Click first result
        first_row = await page.query_selector("tr.zA")
        if not first_row:
            return self._err(f"No email found with subject matching: {subject}")

        await first_row.click()
        await asyncio.sleep(2)

        # Extract content
        content = await page.evaluate("""
            () => {
                const body = document.querySelector('.a3s.aiL');
                const subject = document.querySelector('h2.hP');
                const sender = document.querySelector('.gD');
                const date = document.querySelector('.g3');
                return {
                    subject: subject ? subject.innerText : '',
                    sender: sender ? sender.getAttribute('email') || sender.innerText : '',
                    date: date ? date.innerText : '',
                    body: body ? body.innerText.slice(0, 3000) : '(could not extract body)',
                };
            }
        """)

        return self._ok(content)

    async def _send_email(self, to: str, subject: str, body: str) -> ToolResult:
        page = await self._ensure_page()

        # Click compose
        compose = await page.query_selector('div[gh="cm"]')
        if not compose:
            return self._err("Cannot find Compose button. Is Gmail logged in?")

        await compose.click()
        await asyncio.sleep(1.5)

        # Fill recipient
        to_field = await page.query_selector('input[aria-label="To recipients"]')
        if to_field:
            await to_field.fill(to)
            await page.keyboard.press("Tab")

        # Fill subject
        subject_field = await page.query_selector('input[name="subjectbox"]')
        if subject_field:
            await subject_field.fill(subject)

        # Fill body
        body_field = await page.query_selector('div[aria-label="Message Body"]')
        if body_field:
            await body_field.click()
            await body_field.fill(body)

        await asyncio.sleep(0.5)

        # Send
        send_btn = await page.query_selector('div[aria-label*="Send"]')
        if send_btn:
            await send_btn.click()
        else:
            await page.keyboard.press("Control+Enter")

        await asyncio.sleep(1)
        return self._ok(f"Email sent to {to}: {subject}")

    async def _search_emails(self, query: str, count: int) -> ToolResult:
        page = await self._ensure_page()

        search_box = await page.query_selector('input[aria-label="Search mail"]')
        if not search_box:
            return self._err("Search box not found.")

        await search_box.click()
        await search_box.fill(query)
        await page.keyboard.press("Enter")
        await asyncio.sleep(2)

        emails = await page.evaluate(f"""
            () => {{
                const rows = document.querySelectorAll('tr.zA');
                const result = [];
                const slice = Array.from(rows).slice(0, {count});
                for (const row of slice) {{
                    const sender = row.querySelector('.yX .yW span');
                    const subject = row.querySelector('.y6 span:first-child');
                    const snippet = row.querySelector('.y2');
                    const time = row.querySelector('.xW span');
                    result.push({{
                        sender: sender ? sender.innerText : 'Unknown',
                        subject: subject ? subject.innerText : '(no subject)',
                        snippet: snippet ? snippet.innerText : '',
                        time: time ? time.innerText : '',
                    }});
                }}
                return result;
            }}
        """)

        return self._ok({
            "query": query,
            "count": len(emails),
            "results": emails,
        })
