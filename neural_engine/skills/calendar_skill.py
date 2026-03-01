"""
Calendar Skill — schedule management via Google Calendar API + iCal parsing.

Features:
- View today's / this week's schedule
- Create new events
- Check for conflicts
- Parse iCal files (university timetable import)
- Find free slots for study sessions
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
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

NEXUS_API = os.getenv("NEXUS_API_URL", "http://localhost:3000")


class CalendarSkill(BaseSkill):
    """Calendar management — reads from NEXUS database + creates events."""

    def __init__(self):
        super().__init__()
        self._http: httpx.AsyncClient | None = None

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="calendar",
            description="View schedule, create events, find free slots, check conflicts",
            category="productivity",
            requires_browser=False,
            methods=[
                SkillMethod(
                    name="get_today",
                    description="Get all events/tasks scheduled for today",
                    parameters={},
                    example="{}",
                ),
                SkillMethod(
                    name="get_week",
                    description="Get all events for the current week",
                    parameters={},
                    example="{}",
                ),
                SkillMethod(
                    name="get_upcoming",
                    description="Get the next N upcoming events",
                    parameters={
                        "count": ParameterSpec(
                            type="number",
                            description="Number of upcoming events to return",
                            required=False,
                            default=5,
                        ),
                    },
                ),
                SkillMethod(
                    name="create_event",
                    description="Create a new calendar event",
                    parameters={
                        "title": ParameterSpec(
                            type="string",
                            description="Event title",
                        ),
                        "date": ParameterSpec(
                            type="string",
                            description="Date in YYYY-MM-DD format",
                        ),
                        "time": ParameterSpec(
                            type="string",
                            description="Start time in HH:MM format (24h)",
                            required=False,
                        ),
                        "duration_minutes": ParameterSpec(
                            type="number",
                            description="Duration in minutes",
                            required=False,
                            default=60,
                        ),
                        "location": ParameterSpec(
                            type="string",
                            description="Event location",
                            required=False,
                        ),
                        "description": ParameterSpec(
                            type="string",
                            description="Additional details",
                            required=False,
                        ),
                        "category": ParameterSpec(
                            type="string",
                            description="Category: academic, social, career, personal, health",
                            required=False,
                            default="personal",
                        ),
                    },
                    example='{"title": "ML Lab", "date": "2025-01-20", "time": "14:00", "duration_minutes": 120, "location": "SOM Lab", "category": "academic"}',
                ),
                SkillMethod(
                    name="find_free_slots",
                    description="Find free time slots on a given day for scheduling",
                    parameters={
                        "date": ParameterSpec(
                            type="string",
                            description="Date to check in YYYY-MM-DD format",
                        ),
                        "min_duration": ParameterSpec(
                            type="number",
                            description="Minimum free slot duration in minutes",
                            required=False,
                            default=30,
                        ),
                    },
                    example='{"date": "2025-01-20", "min_duration": 60}',
                ),
                SkillMethod(
                    name="check_conflicts",
                    description="Check if a proposed time conflicts with existing events",
                    parameters={
                        "date": ParameterSpec(
                            type="string",
                            description="Date in YYYY-MM-DD format",
                        ),
                        "time": ParameterSpec(
                            type="string",
                            description="Time in HH:MM format",
                        ),
                        "duration_minutes": ParameterSpec(
                            type="number",
                            description="Duration in minutes",
                            required=False,
                            default=60,
                        ),
                    },
                ),
                SkillMethod(
                    name="import_ical",
                    description="Import events from an iCal (.ics) URL or file",
                    parameters={
                        "url": ParameterSpec(
                            type="string",
                            description="URL to .ics file (e.g. university timetable export)",
                        ),
                    },
                ),
            ],
        )

    async def startup(self) -> None:
        self._http = httpx.AsyncClient(base_url=NEXUS_API, timeout=15.0)

    async def shutdown(self) -> None:
        if self._http:
            await self._http.aclose()

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "get_today":
                return await self._get_today()
            elif method == "get_week":
                return await self._get_week()
            elif method == "get_upcoming":
                return await self._get_upcoming(params.get("count", 5))
            elif method == "create_event":
                return await self._create_event(params)
            elif method == "find_free_slots":
                return await self._find_free_slots(
                    params["date"], params.get("min_duration", 30)
                )
            elif method == "check_conflicts":
                return await self._check_conflicts(
                    params["date"],
                    params["time"],
                    params.get("duration_minutes", 60),
                )
            elif method == "import_ical":
                return await self._import_ical(params["url"])
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"Calendar error: {e}")

    # ── Internal Methods ───────────────────────────────────────

    async def _query_events(self, start_date: str, end_date: str) -> list[dict]:
        """Query events from the Nexus PGlite database via API."""
        try:
            resp = await self._http.get(
                "/api/events",
                params={"start": start_date, "end": end_date},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, list) else data.get("events", [])
        except Exception:
            pass
        return []

    async def _get_today(self) -> ToolResult:
        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        events = await self._query_events(today, tomorrow)

        if not events:
            return self._ok({
                "date": today,
                "event_count": 0,
                "message": "No events scheduled for today. You have a free day!",
            })

        return self._ok({
            "date": today,
            "event_count": len(events),
            "events": events,
        })

    async def _get_week(self) -> ToolResult:
        today = datetime.now()
        # Start from Monday
        monday = today - timedelta(days=today.weekday())
        sunday = monday + timedelta(days=7)

        events = await self._query_events(
            monday.strftime("%Y-%m-%d"),
            sunday.strftime("%Y-%m-%d"),
        )

        # Group by day
        by_day: dict[str, list] = {}
        for ev in events:
            date_key = ev.get("date", ev.get("startDate", "unknown"))[:10]
            by_day.setdefault(date_key, []).append(ev)

        return self._ok({
            "week_start": monday.strftime("%Y-%m-%d"),
            "week_end": sunday.strftime("%Y-%m-%d"),
            "total_events": len(events),
            "by_day": by_day,
        })

    async def _get_upcoming(self, count: int) -> ToolResult:
        today = datetime.now().strftime("%Y-%m-%d")
        far_future = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
        events = await self._query_events(today, far_future)

        # Sort by date and take first N
        events.sort(key=lambda e: e.get("date", e.get("startDate", "")))
        upcoming = events[:count]

        return self._ok({
            "count": len(upcoming),
            "events": upcoming,
        })

    async def _create_event(self, params: dict) -> ToolResult:
        """Create event via the Nexus API (writes to PGlite)."""
        try:
            # Build event payload for Nexus events table
            payload = {
                "title": params["title"],
                "date": params["date"],
                "startDate": params["date"],
                "source": "nanobot",
                "category": params.get("category", "personal"),
                "location": params.get("location", ""),
                "description": params.get("description", ""),
                "eventType": "calendar",
            }

            if params.get("time"):
                payload["time"] = params["time"]

            resp = await self._http.post("/api/events", json=payload)
            if resp.status_code in (200, 201):
                return self._ok({
                    "created": True,
                    "event": payload,
                    "message": f"Event '{params['title']}' created for {params['date']}",
                })
            else:
                return self._err(f"API returned {resp.status_code}: {resp.text[:200]}")

        except Exception as e:
            return self._err(f"Failed to create event: {e}")

    async def _find_free_slots(self, date: str, min_duration: int) -> ToolResult:
        next_day = (
            datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)
        ).strftime("%Y-%m-%d")
        events = await self._query_events(date, next_day)

        # Build busy intervals (assume 8:00-22:00 as active hours)
        busy: list[tuple[int, int]] = []
        for ev in events:
            time_str = ev.get("time", "")
            if time_str:
                parts = time_str.split(":")
                start_min = int(parts[0]) * 60 + int(parts[1])
                duration = ev.get("duration_minutes", 60)
                busy.append((start_min, start_min + duration))

        busy.sort()

        # Find gaps
        free_slots = []
        day_start = 8 * 60   # 8:00 AM
        day_end = 22 * 60    # 10:00 PM

        current = day_start
        for start, end in busy:
            if start > current and (start - current) >= min_duration:
                free_slots.append({
                    "start": f"{current // 60:02d}:{current % 60:02d}",
                    "end": f"{start // 60:02d}:{start % 60:02d}",
                    "duration_minutes": start - current,
                })
            current = max(current, end)

        if day_end > current and (day_end - current) >= min_duration:
            free_slots.append({
                "start": f"{current // 60:02d}:{current % 60:02d}",
                "end": f"{day_end // 60:02d}:{day_end % 60:02d}",
                "duration_minutes": day_end - current,
            })

        return self._ok({
            "date": date,
            "free_slots": free_slots,
            "total_free_hours": sum(s["duration_minutes"] for s in free_slots) / 60,
        })

    async def _check_conflicts(
        self, date: str, time: str, duration: int
    ) -> ToolResult:
        next_day = (
            datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)
        ).strftime("%Y-%m-%d")
        events = await self._query_events(date, next_day)

        parts = time.split(":")
        proposed_start = int(parts[0]) * 60 + int(parts[1])
        proposed_end = proposed_start + duration

        conflicts = []
        for ev in events:
            time_str = ev.get("time", "")
            if not time_str:
                continue
            ev_parts = time_str.split(":")
            ev_start = int(ev_parts[0]) * 60 + int(ev_parts[1])
            ev_duration = ev.get("duration_minutes", 60)
            ev_end = ev_start + ev_duration

            # Check overlap
            if proposed_start < ev_end and proposed_end > ev_start:
                conflicts.append(ev)

        return self._ok({
            "has_conflict": len(conflicts) > 0,
            "conflicts": conflicts,
            "message": (
                f"{len(conflicts)} conflict(s) found" if conflicts
                else "No conflicts — time slot is free!"
            ),
        })

    async def _import_ical(self, url: str) -> ToolResult:
        """Import events from an iCal URL."""
        try:
            from icalendar import Calendar

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, timeout=30.0)
                resp.raise_for_status()

            cal = Calendar.from_ical(resp.text)
            imported = 0

            for component in cal.walk():
                if component.name == "VEVENT":
                    summary = str(component.get("summary", "Untitled"))
                    dtstart = component.get("dtstart")
                    location = str(component.get("location", ""))
                    description = str(component.get("description", ""))

                    if dtstart:
                        dt = dtstart.dt
                        date_str = dt.strftime("%Y-%m-%d")
                        time_str = (
                            dt.strftime("%H:%M")
                            if hasattr(dt, "hour")
                            else ""
                        )

                        await self._create_event({
                            "title": summary,
                            "date": date_str,
                            "time": time_str,
                            "location": location,
                            "description": description,
                            "category": "academic",
                        })
                        imported += 1

            return self._ok({
                "imported_count": imported,
                "message": f"Successfully imported {imported} events from iCal",
            })

        except ImportError:
            return self._err("icalendar package not installed. Run: pip install icalendar")
        except Exception as e:
            return self._err(f"iCal import failed: {e}")
