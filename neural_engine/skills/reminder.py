"""
Reminder Skill — deadline tracking, proactive nudges, and notification management.

Features:
- Set one-time or recurring reminders
- Track assignment/exam deadlines
- Proactive alerts before events
- Integrates with the NEXUS event/plan database
- Priority-based notification queue
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from nanobot.types import (
    ParameterSpec,
    SkillManifest,
    SkillMethod,
    ToolResult,
)
from skills.base import BaseSkill

NEXUS_API = os.getenv("NEXUS_API_URL", "http://localhost:3000")
REMINDER_DIR = Path(__file__).parent.parent / "memory_store"
REMINDER_FILE = REMINDER_DIR / "reminders.json"


class ReminderSkill(BaseSkill):
    """Deadline tracking and proactive reminder notifications."""

    def __init__(self):
        super().__init__()
        self._reminders: list[dict] = []
        self._check_task: asyncio.Task | None = None
        self._running = False
        self._ws_callback: Any = None  # Callback to push notifications
        self._load_reminders()  # Load persisted reminders on init

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="reminder",
            description="Set reminders, track deadlines, get proactive alerts for upcoming events",
            category="productivity",
            requires_browser=False,
            methods=[
                SkillMethod(
                    name="set_reminder",
                    description="Set a new reminder",
                    parameters={
                        "text": ParameterSpec(
                            type="string",
                            description="What to remind about",
                        ),
                        "when": ParameterSpec(
                            type="string",
                            description="When to remind: ISO datetime (2025-01-20T14:00), relative ('in 30 minutes', 'tomorrow 9am'), or daily time ('every day at 8:00')",
                        ),
                        "priority": ParameterSpec(
                            type="string",
                            description="Priority: low, medium, high, critical",
                            required=False,
                            default="medium",
                        ),
                    },
                    example='{"text": "Submit ML assignment", "when": "2025-01-20T23:59", "priority": "high"}',
                ),
                SkillMethod(
                    name="list_reminders",
                    description="List all active reminders",
                    parameters={},
                ),
                SkillMethod(
                    name="cancel_reminder",
                    description="Cancel a reminder by its ID",
                    parameters={
                        "reminder_id": ParameterSpec(
                            type="number",
                            description="ID of the reminder to cancel",
                        ),
                    },
                ),
                SkillMethod(
                    name="check_deadlines",
                    description="Check for upcoming deadlines from the NEXUS database",
                    parameters={
                        "hours_ahead": ParameterSpec(
                            type="number",
                            description="How many hours ahead to check",
                            required=False,
                            default=24,
                        ),
                    },
                ),
                SkillMethod(
                    name="start_monitor",
                    description="Start the background deadline monitor that checks every 5 minutes",
                    parameters={},
                ),
                SkillMethod(
                    name="stop_monitor",
                    description="Stop the background deadline monitor",
                    parameters={},
                ),
                SkillMethod(
                    name="snooze",
                    description="Snooze a reminder by N minutes",
                    parameters={
                        "reminder_id": ParameterSpec(
                            type="number",
                            description="ID of the reminder to snooze",
                        ),
                        "minutes": ParameterSpec(
                            type="number",
                            description="Minutes to snooze",
                            required=False,
                            default=15,
                        ),
                    },
                ),
            ],
        )

    async def startup(self) -> None:
        """Auto-start the background monitor so reminders fire without manual intervention."""
        active = [r for r in self._reminders if not r["fired"]]
        if active:
            print(f"[Reminder] Loaded {len(active)} active reminder(s) from disk.")
        # Always start the monitor — it costs almost nothing when idle
        self._running = True
        self._check_task = asyncio.create_task(self._monitor_loop())
        print("[Reminder] Background monitor auto-started.")

    async def shutdown(self) -> None:
        self._running = False
        if self._check_task and not self._check_task.done():
            self._check_task.cancel()

    def set_notification_callback(self, callback: Any) -> None:
        """Set callback for pushing notifications to the frontend."""
        self._ws_callback = callback

    # ── Persistence ────────────────────────────────────────────

    def _load_reminders(self) -> None:
        """Load reminders from disk."""
        if REMINDER_FILE.exists():
            try:
                data = json.loads(REMINDER_FILE.read_text(encoding="utf-8"))
                self._reminders = data if isinstance(data, list) else []
            except (json.JSONDecodeError, OSError):
                self._reminders = []

    def _save_reminders(self) -> None:
        """Persist reminders to disk."""
        REMINDER_DIR.mkdir(parents=True, exist_ok=True)
        try:
            REMINDER_FILE.write_text(
                json.dumps(self._reminders, indent=2, default=str),
                encoding="utf-8",
            )
        except OSError:
            pass  # Non-fatal — reminders still in memory

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "set_reminder":
                return await self._set_reminder(
                    params["text"],
                    params["when"],
                    params.get("priority", "medium"),
                )
            elif method == "list_reminders":
                return self._list_reminders()
            elif method == "cancel_reminder":
                return self._cancel_reminder(int(params["reminder_id"]))
            elif method == "check_deadlines":
                return await self._check_deadlines(params.get("hours_ahead", 24))
            elif method == "start_monitor":
                return self._start_monitor()
            elif method == "stop_monitor":
                return self._stop_monitor()
            elif method == "snooze":
                return self._snooze(
                    int(params["reminder_id"]), params.get("minutes", 15)
                )
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"Reminder error: {e}")

    # ── Private ────────────────────────────────────────────────

    async def _set_reminder(
        self, text: str, when: str, priority: str
    ) -> ToolResult:
        trigger_time = self._parse_time(when)
        if not trigger_time:
            return self._err(
                f"Could not parse time: '{when}'. Use ISO format (2025-01-20T14:00) or relative ('in 30 minutes')."
            )

        reminder_id = len(self._reminders) + 1
        reminder = {
            "id": reminder_id,
            "text": text,
            "trigger_at": trigger_time.isoformat(),
            "priority": priority,
            "created_at": datetime.now().isoformat(),
            "fired": False,
            "snoozed": 0,
        }
        self._reminders.append(reminder)
        self._save_reminders()

        # Calculate time until
        delta = trigger_time - datetime.now()
        time_str = self._format_delta(delta)

        return self._ok({
            "id": reminder_id,
            "text": text,
            "trigger_at": trigger_time.isoformat(),
            "time_until": time_str,
            "priority": priority,
            "message": f"Reminder set: '{text}' — firing {time_str}",
        })

    def _list_reminders(self) -> ToolResult:
        active = [r for r in self._reminders if not r["fired"]]
        now = datetime.now()

        for r in active:
            trigger = datetime.fromisoformat(r["trigger_at"])
            delta = trigger - now
            r["time_until"] = self._format_delta(delta)
            r["overdue"] = delta.total_seconds() < 0

        active.sort(key=lambda r: r["trigger_at"])

        return self._ok({
            "total": len(active),
            "reminders": active,
        })

    def _cancel_reminder(self, reminder_id: int) -> ToolResult:
        for r in self._reminders:
            if r["id"] == reminder_id:
                r["fired"] = True  # Mark as done
                self._save_reminders()
                return self._ok(f"Reminder #{reminder_id} cancelled: '{r['text']}'")
        return self._err(f"Reminder #{reminder_id} not found.")

    def _snooze(self, reminder_id: int, minutes: int) -> ToolResult:
        for r in self._reminders:
            if r["id"] == reminder_id and not r["fired"]:
                new_time = datetime.now() + timedelta(minutes=minutes)
                r["trigger_at"] = new_time.isoformat()
                r["snoozed"] = r.get("snoozed", 0) + 1
                self._save_reminders()
                return self._ok({
                    "id": reminder_id,
                    "new_trigger": new_time.isoformat(),
                    "message": f"Snoozed for {minutes} minutes.",
                })
        return self._err(f"Reminder #{reminder_id} not found or already fired.")

    async def _check_deadlines(self, hours_ahead: int) -> ToolResult:
        """Check NEXUS database for upcoming deadlines."""
        now = datetime.now()
        cutoff = now + timedelta(hours=hours_ahead)

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{NEXUS_API}/api/events",
                    params={
                        "start": now.strftime("%Y-%m-%d"),
                        "end": cutoff.strftime("%Y-%m-%d"),
                    },
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    events = data if isinstance(data, list) else data.get("events", [])

                    deadlines = []
                    for ev in events:
                        ev_date = ev.get("date", ev.get("startDate", ""))
                        if ev_date:
                            deadlines.append({
                                "title": ev.get("title", "Untitled"),
                                "date": ev_date,
                                "category": ev.get("category", ""),
                                "source": ev.get("source", ""),
                            })

                    return self._ok({
                        "hours_ahead": hours_ahead,
                        "deadline_count": len(deadlines),
                        "deadlines": deadlines,
                    })
        except Exception:
            pass

        # Also check local reminders
        upcoming_reminders = []
        for r in self._reminders:
            if r["fired"]:
                continue
            trigger = datetime.fromisoformat(r["trigger_at"])
            if now <= trigger <= cutoff:
                upcoming_reminders.append(r)

        return self._ok({
            "hours_ahead": hours_ahead,
            "upcoming_reminders": upcoming_reminders,
        })

    def _start_monitor(self) -> ToolResult:
        if self._running:
            return self._ok("Monitor is already running.")

        self._running = True
        self._check_task = asyncio.create_task(self._monitor_loop())
        return self._ok("Deadline monitor started. Checking every 5 minutes.")

    def _stop_monitor(self) -> ToolResult:
        self._running = False
        if self._check_task and not self._check_task.done():
            self._check_task.cancel()
        return self._ok("Deadline monitor stopped.")

    async def _monitor_loop(self) -> None:
        """Background loop that checks reminders and emits notifications."""
        while self._running:
            now = datetime.now()

            for r in self._reminders:
                if r["fired"]:
                    continue

                trigger = datetime.fromisoformat(r["trigger_at"])
                if now >= trigger:
                    r["fired"] = True
                    self._save_reminders()

                    # Emit notification
                    if self._ws_callback:
                        try:
                            await self._ws_callback({
                                "type": "reminder_fired",
                                "reminder": r,
                                "message": f"🔔 REMINDER: {r['text']}",
                                "priority": r["priority"],
                            })
                        except Exception:
                            pass

            await asyncio.sleep(60)  # Check every minute

    # ── Time Parsing ───────────────────────────────────────────

    def _parse_time(self, when: str) -> datetime | None:
        """Parse various time formats into datetime."""
        now = datetime.now()

        # ISO format
        try:
            return datetime.fromisoformat(when)
        except ValueError:
            pass

        # Relative: "in X minutes/hours"
        when_lower = when.lower().strip()
        import re

        m = re.match(r"in\s+(\d+)\s+(minute|min|hour|hr|day)s?", when_lower)
        if m:
            amount = int(m.group(1))
            unit = m.group(2)
            if unit in ("minute", "min"):
                return now + timedelta(minutes=amount)
            elif unit in ("hour", "hr"):
                return now + timedelta(hours=amount)
            elif unit == "day":
                return now + timedelta(days=amount)

        # "tomorrow at HH:MM" or "tomorrow HH:MM"
        m = re.match(r"tomorrow\s+(?:at\s+)?(\d{1,2}):(\d{2})", when_lower)
        if m:
            return (now + timedelta(days=1)).replace(
                hour=int(m.group(1)), minute=int(m.group(2)), second=0
            )

        # "today at HH:MM"
        m = re.match(r"today\s+(?:at\s+)?(\d{1,2}):(\d{2})", when_lower)
        if m:
            return now.replace(
                hour=int(m.group(1)), minute=int(m.group(2)), second=0
            )

        return None

    def _format_delta(self, delta: timedelta) -> str:
        """Human-readable time delta."""
        total_seconds = int(delta.total_seconds())
        if total_seconds < 0:
            return "OVERDUE"

        days = total_seconds // 86400
        hours = (total_seconds % 86400) // 3600
        minutes = (total_seconds % 3600) // 60

        parts = []
        if days:
            parts.append(f"{days}d")
        if hours:
            parts.append(f"{hours}h")
        if minutes:
            parts.append(f"{minutes}m")

        return "in " + " ".join(parts) if parts else "now"
