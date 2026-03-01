"""
Planner Skill — Adaptive AI planner for event preparation via Three-Body system.

The "Jarvis-like" agentic planner:
  - View upcoming events with countdown & urgency
  - Generate AI preparation plans
  - Check plan staleness & auto-compress
  - Get study/prep recommendations
  - Track plan progress

Data flows through NEXUS API at localhost:3000.
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


def _calc_urgency(days_remaining: int) -> str:
    """Map days remaining to urgency level."""
    if days_remaining <= 0:
        return "overdue"
    if days_remaining <= 3:
        return "critical"
    if days_remaining <= 7:
        return "urgent"
    if days_remaining <= 14:
        return "normal"
    return "future"


def _format_countdown(days: int) -> str:
    """Human-readable countdown string."""
    if days < 0:
        return f"{abs(days)} days overdue!"
    if days == 0:
        return "TODAY"
    if days == 1:
        return "tomorrow"
    if days <= 7:
        return f"{days} days left"
    weeks = days // 7
    remaining = days % 7
    if remaining == 0:
        return f"{weeks} week{'s' if weeks > 1 else ''} left"
    return f"{weeks}w {remaining}d left"


class PlannerSkill(BaseSkill):
    """Adaptive AI planner — countdown tracking, plan generation, staleness detection."""

    def __init__(self):
        super().__init__()
        self._http: httpx.AsyncClient | None = None

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="planner",
            description=(
                "Manage event preparation plans: view urgency, generate strategies, "
                "check staleness, track progress, get recommendations"
            ),
            category="productivity",
            requires_browser=False,
            methods=[
                SkillMethod(
                    name="get_urgent",
                    description="List events sorted by urgency (critical first). Shows countdown and plan status.",
                    parameters={
                        "limit": ParameterSpec(
                            type="number",
                            description="Max events to return",
                            required=False,
                            default=10,
                        ),
                    },
                ),
                SkillMethod(
                    name="get_plan",
                    description="Get the preparation plan for a specific event by ID.",
                    parameters={
                        "event_id": ParameterSpec(
                            type="string",
                            description="The event UUID",
                        ),
                    },
                ),
                SkillMethod(
                    name="check_staleness",
                    description=(
                        "Check if any event plans are stale (plan has more days than remaining). "
                        "Returns which plans need recompression."
                    ),
                    parameters={},
                ),
                SkillMethod(
                    name="today_focus",
                    description=(
                        "Get today's recommended focus: what tasks to work on right now based on "
                        "urgency, upcoming deadlines, and plan progress."
                    ),
                    parameters={},
                ),
                SkillMethod(
                    name="progress_summary",
                    description="Get a summary of plan progress across all planned events.",
                    parameters={},
                ),
                SkillMethod(
                    name="week_outlook",
                    description=(
                        "Get this week's outlook — upcoming events, deadlines, and what needs attention."
                    ),
                    parameters={},
                ),
            ],
        )

    # ─── Lifecycle ────────────────────────────────────────────

    async def startup(self):
        self._http = httpx.AsyncClient(timeout=15.0)
        self._status = SkillStatus.READY

    async def shutdown(self):
        if self._http:
            await self._http.aclose()
        self._status = SkillStatus.STOPPED

    # ─── Router ───────────────────────────────────────────────

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        if self._http is None:
            await self.startup()

        dispatch = {
            "get_urgent": self._get_urgent,
            "get_plan": self._get_plan,
            "check_staleness": self._check_staleness,
            "today_focus": self._today_focus,
            "progress_summary": self._progress_summary,
            "week_outlook": self._week_outlook,
        }

        handler = dispatch.get(method)
        if not handler:
            return self._err(f"Unknown method: {method}")

        try:
            return await handler(params)
        except httpx.HTTPError as exc:
            return self._err(f"NEXUS API error: {exc}")
        except Exception as exc:
            return self._err(f"Planner error: {exc}")

    # ─── Methods ──────────────────────────────────────────────

    async def _get_urgent(self, params: dict[str, Any]) -> ToolResult:
        """List events sorted by urgency with countdown info."""
        limit = int(params.get("limit", 10))
        now = datetime.now()

        # Fetch all events
        resp = await self._http.get(f"{NEXUS_API}/api/events")
        resp.raise_for_status()
        all_events = resp.json()

        if not isinstance(all_events, list):
            all_events = all_events.get("events", [])

        # Enrich with countdown and urgency
        enriched = []
        for ev in all_events:
            target_date_str = ev.get("deadline") or ev.get("eventDate")
            if not target_date_str:
                continue

            try:
                target = datetime.fromisoformat(target_date_str.replace("Z", "+00:00"))
                days_left = (target.date() - now.date()).days
            except (ValueError, TypeError):
                continue

            urgency = _calc_urgency(days_left)
            # Skip events far in the future for urgency view
            if urgency == "future" and days_left > 30:
                continue

            enriched.append({
                "id": ev.get("id"),
                "title": ev.get("title", "Untitled"),
                "category": ev.get("category", "unknown"),
                "date": target_date_str,
                "days_remaining": days_left,
                "countdown": _format_countdown(days_left),
                "urgency": urgency,
                "status": ev.get("status"),
                "has_plan": False,  # Will be enriched below
            })

        # Sort by urgency (overdue first, then critical, then urgent, ...)
        urgency_order = {"overdue": 0, "critical": 1, "urgent": 2, "normal": 3, "future": 4}
        enriched.sort(key=lambda x: (urgency_order.get(x["urgency"], 5), x["days_remaining"]))
        enriched = enriched[:limit]

        # Batch-check which have plans
        for item in enriched:
            try:
                plan_resp = await self._http.get(
                    f"{NEXUS_API}/api/event-plans",
                    params={"eventId": item["id"]},
                )
                if plan_resp.status_code == 200:
                    plan_data = plan_resp.json()
                    if plan_data.get("plan"):
                        item["has_plan"] = True
                        item["plan_progress"] = plan_data["plan"].get("progress", 0)
            except Exception:
                pass

        summary_lines = []
        for item in enriched:
            plan_status = f"📋 {item.get('plan_progress', 0)}% done" if item["has_plan"] else "⚠️ No plan"
            icon = {"overdue": "🔴", "critical": "🔴", "urgent": "🟠", "normal": "🔵", "future": "⚪"}.get(
                item["urgency"], "⚪"
            )
            summary_lines.append(
                f"{icon} [{item['urgency'].upper()}] {item['title']} — "
                f"{item['countdown']} | {item['category']} | {plan_status}"
            )

        return self._ok({
            "events": enriched,
            "total": len(enriched),
            "summary": "\n".join(summary_lines),
        })

    async def _get_plan(self, params: dict[str, Any]) -> ToolResult:
        """Get the plan for a specific event."""
        event_id = params.get("event_id")
        if not event_id:
            return self._err("event_id is required")

        resp = await self._http.get(
            f"{NEXUS_API}/api/event-plans",
            params={"eventId": event_id},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("plan"):
            return self._ok({
                "has_plan": False,
                "message": "No plan exists for this event. Use the calendar UI to generate one.",
            })

        plan = data["plan"]
        generated = plan.get("generatedPlan", {})
        days = generated.get("days", []) if isinstance(generated, dict) else generated

        # Calculate real progress
        total_tasks = 0
        done_tasks = 0
        if isinstance(days, list):
            for day in days:
                tasks = day.get("tasks", [])
                total_tasks += len(tasks)
                done_tasks += sum(1 for t in tasks if t.get("done"))

        progress = round(done_tasks / total_tasks * 100) if total_tasks > 0 else 0

        return self._ok({
            "has_plan": True,
            "plan_days": len(days) if isinstance(days, list) else 0,
            "progress": progress,
            "tasks_done": done_tasks,
            "tasks_total": total_tasks,
            "is_locked": plan.get("isLocked", False),
            "plan_data": days,
        })

    async def _check_staleness(self, _params: dict[str, Any]) -> ToolResult:
        """Check all event plans for staleness (more plan days than days remaining)."""
        now = datetime.now()

        # Fetch all events
        resp = await self._http.get(f"{NEXUS_API}/api/events")
        resp.raise_for_status()
        all_events = resp.json()
        if not isinstance(all_events, list):
            all_events = all_events.get("events", [])

        stale = []
        fresh = 0

        for ev in all_events:
            target_str = ev.get("deadline") or ev.get("eventDate")
            if not target_str:
                continue

            try:
                target = datetime.fromisoformat(target_str.replace("Z", "+00:00"))
                days_left = (target.date() - now.date()).days
            except (ValueError, TypeError):
                continue

            if days_left < 0:
                continue  # Already past

            # Check if plan exists
            try:
                plan_resp = await self._http.get(
                    f"{NEXUS_API}/api/event-plans",
                    params={"eventId": ev.get("id")},
                )
                if plan_resp.status_code != 200:
                    continue
                plan_data = plan_resp.json()
                if not plan_data.get("plan"):
                    continue

                plan = plan_data["plan"]
                generated = plan.get("generatedPlan", {})
                days = generated.get("days", []) if isinstance(generated, dict) else generated
                plan_days = len(days) if isinstance(days, list) else 0

                if plan_days > days_left and not plan.get("isLocked"):
                    stale.append({
                        "event_id": ev.get("id"),
                        "title": ev.get("title", "Untitled"),
                        "plan_days": plan_days,
                        "days_remaining": days_left,
                        "urgency": _calc_urgency(days_left),
                        "needs_compression": True,
                    })
                else:
                    fresh += 1
            except Exception:
                continue

        stale_summary = "\n".join(
            f"⚠️ {s['title']}: {s['plan_days']} plan days but only {s['days_remaining']}d left — needs replan!"
            for s in stale
        )

        return self._ok({
            "stale_count": len(stale),
            "fresh_count": fresh,
            "stale_events": stale,
            "summary": stale_summary if stale else "✅ All plans are fresh and up to date.",
        })

    async def _today_focus(self, _params: dict[str, Any]) -> ToolResult:
        """Generate today's focus: what the student should work on right now."""
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")

        # Get all events
        resp = await self._http.get(f"{NEXUS_API}/api/events")
        resp.raise_for_status()
        all_events = resp.json()
        if not isinstance(all_events, list):
            all_events = all_events.get("events", [])

        focus_items = []

        for ev in all_events:
            target_str = ev.get("deadline") or ev.get("eventDate")
            if not target_str:
                continue
            try:
                target = datetime.fromisoformat(target_str.replace("Z", "+00:00"))
                days_left = (target.date() - now.date()).days
            except (ValueError, TypeError):
                continue

            if days_left < 0 or days_left > 14:
                continue

            urgency = _calc_urgency(days_left)

            # Check plan
            plan_info = {"has_plan": False, "today_tasks": []}
            try:
                plan_resp = await self._http.get(
                    f"{NEXUS_API}/api/event-plans",
                    params={"eventId": ev.get("id")},
                )
                if plan_resp.status_code == 200:
                    plan_data = plan_resp.json()
                    if plan_data.get("plan"):
                        plan_info["has_plan"] = True
                        generated = plan_data["plan"].get("generatedPlan", {})
                        days = generated.get("days", []) if isinstance(generated, dict) else generated
                        # Find today's tasks (Day 1 or current day)
                        if isinstance(days, list) and len(days) > 0:
                            # Map to today based on start date logic
                            plan_info["today_tasks"] = [
                                t.get("title", t.get("task", "Unknown task"))
                                for t in days[0].get("tasks", [])
                                if not t.get("done")
                            ]
            except Exception:
                pass

            focus_items.append({
                "title": ev.get("title", "Untitled"),
                "urgency": urgency,
                "days_left": days_left,
                "countdown": _format_countdown(days_left),
                "category": ev.get("category"),
                "has_plan": plan_info["has_plan"],
                "today_tasks": plan_info["today_tasks"],
                "action_needed": "Generate a plan!" if not plan_info["has_plan"] else (
                    "Complete today's tasks" if plan_info["today_tasks"] else "Review progress"
                ),
            })

        # Sort by urgency
        urgency_order = {"overdue": 0, "critical": 1, "urgent": 2, "normal": 3}
        focus_items.sort(key=lambda x: (urgency_order.get(x["urgency"], 5), x["days_left"]))

        # Build summary
        if not focus_items:
            summary = "🎉 Nothing urgent today! Good time to work ahead or explore new opportunities."
        else:
            lines = [f"📋 Today's Focus ({now.strftime('%A, %B %d')}):", ""]
            for i, item in enumerate(focus_items[:5], 1):
                icon = {"overdue": "🔴", "critical": "🔴", "urgent": "🟠", "normal": "🔵"}.get(
                    item["urgency"], "⚪"
                )
                lines.append(f"{i}. {icon} {item['title']} — {item['countdown']}")
                if item["today_tasks"]:
                    for task in item["today_tasks"][:3]:
                        lines.append(f"   • {task}")
                else:
                    lines.append(f"   → {item['action_needed']}")
                lines.append("")
            summary = "\n".join(lines)

        return self._ok({
            "date": today_str,
            "focus_items": focus_items[:5],
            "total_active": len(focus_items),
            "summary": summary,
        })

    async def _progress_summary(self, _params: dict[str, Any]) -> ToolResult:
        """Summary of all plan progress."""
        now = datetime.now()

        resp = await self._http.get(f"{NEXUS_API}/api/events")
        resp.raise_for_status()
        all_events = resp.json()
        if not isinstance(all_events, list):
            all_events = all_events.get("events", [])

        stats = {
            "total_events": len(all_events),
            "with_plan": 0,
            "without_plan": 0,
            "avg_progress": 0,
            "fully_complete": 0,
            "critical_unplanned": 0,
        }
        progress_values = []

        for ev in all_events:
            target_str = ev.get("deadline") or ev.get("eventDate")
            days_left = 999
            if target_str:
                try:
                    target = datetime.fromisoformat(target_str.replace("Z", "+00:00"))
                    days_left = (target.date() - now.date()).days
                except (ValueError, TypeError):
                    pass

            try:
                plan_resp = await self._http.get(
                    f"{NEXUS_API}/api/event-plans",
                    params={"eventId": ev.get("id")},
                )
                if plan_resp.status_code == 200:
                    plan_data = plan_resp.json()
                    if plan_data.get("plan"):
                        stats["with_plan"] += 1
                        progress = plan_data["plan"].get("progress", 0)
                        progress_values.append(progress)
                        if progress >= 100:
                            stats["fully_complete"] += 1
                    else:
                        stats["without_plan"] += 1
                        if days_left <= 7:
                            stats["critical_unplanned"] += 1
            except Exception:
                stats["without_plan"] += 1

        if progress_values:
            stats["avg_progress"] = round(sum(progress_values) / len(progress_values))

        summary_lines = [
            "📊 Plan Progress Overview:",
            f"  Total events: {stats['total_events']}",
            f"  With plans: {stats['with_plan']} | Without: {stats['without_plan']}",
            f"  Average progress: {stats['avg_progress']}%",
            f"  Fully complete: {stats['fully_complete']}",
        ]
        if stats["critical_unplanned"] > 0:
            summary_lines.append(
                f"  ⚠️ {stats['critical_unplanned']} urgent event(s) without a plan!"
            )

        return self._ok({**stats, "summary": "\n".join(summary_lines)})

    async def _week_outlook(self, _params: dict[str, Any]) -> ToolResult:
        """This week's outlook — events, deadlines, attention items."""
        now = datetime.now()
        week_end = now + timedelta(days=7)

        resp = await self._http.get(f"{NEXUS_API}/api/events")
        resp.raise_for_status()
        all_events = resp.json()
        if not isinstance(all_events, list):
            all_events = all_events.get("events", [])

        this_week = []
        for ev in all_events:
            target_str = ev.get("deadline") or ev.get("eventDate")
            if not target_str:
                continue
            try:
                target = datetime.fromisoformat(target_str.replace("Z", "+00:00"))
                days_left = (target.date() - now.date()).days
            except (ValueError, TypeError):
                continue

            if 0 <= days_left <= 7:
                this_week.append({
                    "title": ev.get("title", "Untitled"),
                    "category": ev.get("category"),
                    "date": target_str,
                    "days_left": days_left,
                    "countdown": _format_countdown(days_left),
                    "urgency": _calc_urgency(days_left),
                    "day_name": target.strftime("%A"),
                })

        this_week.sort(key=lambda x: x["days_left"])

        if not this_week:
            summary = "📅 This week looks clear! Great time to work ahead or explore new topics."
        else:
            lines = [f"📅 Week Outlook ({now.strftime('%b %d')} → {week_end.strftime('%b %d')}):", ""]
            for item in this_week:
                icon = {"critical": "🔴", "urgent": "🟠", "normal": "🔵"}.get(item["urgency"], "⚪")
                lines.append(f"  {icon} {item['day_name']}: {item['title']} ({item['countdown']})")
            summary = "\n".join(lines)

        return self._ok({
            "events_this_week": this_week,
            "total": len(this_week),
            "summary": summary,
        })
