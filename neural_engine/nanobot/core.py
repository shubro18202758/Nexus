"""
Nanobot Core — the hybrid agentic reasoning loop.

This is the brain. It:
1. Receives a command from the user (via API / WebSocket)
2. Routes to the correct skill via Groq cloud (fast, ~500ms)
3. Executes the skill
4. Generates response using DualLLM (local 8B aided by Groq 70B)
5. Returns the result with full reasoning trace

Hybrid Architecture:
  - Groq 70B: routing, complex reasoning, refinement
  - Local 8B: privacy-first responses, offline capability
  - Sync: both LLMs share context, tools, and memory
"""

from __future__ import annotations

import asyncio
import importlib
import inspect
import os
import sys
import time
from pathlib import Path
from typing import Any, Callable

from rich.console import Console

from .dual_llm import LLMStrategy
from .groq_alpha import GroqAlpha
from .groq_beta import GroqBeta
from .llm import LLM
from .memory import Memory
from .router import SkillRouter
from .three_body import ThreeBody
from .types import (
    AgentState,
    ChatRequest,
    ChatResponse,
    Message,
    SkillManifest,
    StatusResponse,
    ToolCall,
    ToolResult,
    WSEvent,
)

console = Console()

# The Nanobot system prompt — powers the Three-Body hybrid engine.
NANOBOT_SYSTEM_PROMPT = """You are Nanobot, a persistent hybrid AI agent running on a student's local machine.
You run the Three-Body Orchestrator architecture:
- CEO: DeepSeek R1 8B running locally — you are the orchestrator
- Contract Engine Alpha: Groq llama-3.1-8b-instant — fast ingestion, classification
- Contract Engine Beta: Groq llama-3.3-70b-versatile — advanced reasoning, code gen

You have direct access to tools that control the browser, read emails, manage calendars,
send WhatsApp messages, fill forms, and interact with the student's knowledge base.

You are a university student's personal automation partner. Your job is to:
- Help manage their academic life (deadlines, assignments, notes)
- Automate repetitive tasks (form filling, RSVPs, reminders)
- Monitor communication channels (WhatsApp, email) and surface important info
- Proactively suggest actions based on context
- Delegate complex reasoning to Beta and fast parsing to Alpha

When a user gives you a command:
1. Think carefully about the best approach
2. Call the appropriate tool if action is needed
3. Delegate to Alpha for scanning/classification, Beta for deep reasoning
4. Give concise, actionable responses
5. If you need more context, ask

Be direct. Be helpful. Be proactive. No fluff."""

MAX_TOOL_TURNS = 5  # Max tool-call loops per request

# ── Keyword-based skill routing (instant fallback) ───────────────
# Maps keyword patterns → (skill, method, reasoning).
# Used when the LLM router fails or returns "none" for skill-hinted messages.
_KEYWORD_SKILL_MAP: list[tuple[list[str], str, str, str]] = [
    # (keywords, skill, method, reasoning)
    (["urgent", "urgency", "most important", "critical event"],
     "planner", "get_urgent", "User is asking about urgent/important events"),
    (["focus today", "should i focus", "today's focus", "today focus", "what should i do today"],
     "planner", "today_focus", "User wants to know what to focus on today"),
    (["stale", "staleness", "outdated plan", "old plan"],
     "planner", "check_staleness", "User is checking plan staleness"),
    (["my plan", "show plan", "current plan", "get plan", "event plan"],
     "planner", "get_plan", "User wants to see their plan"),
    (["progress", "how am i doing", "progress summary"],
     "planner", "progress_summary", "User wants a progress summary"),
    (["week outlook", "this week", "week ahead", "weekly"],
     "planner", "week_outlook", "User wants a weekly outlook"),
    (["schedule", "calendar", "upcoming event", "free slot"],
     "calendar", "get_events", "User is asking about calendar/schedule"),
    (["remind me", "set reminder", "alarm", "snooze"],
     "reminder", "create", "User wants to set a reminder"),
    (["email", "inbox", "unread mail", "send email"],
     "email", "scan_inbox", "User is asking about email"),
    (["note", "take note", "journal", "capture thought"],
     "notes", "create", "User wants to create a note"),
]


def _keyword_fallback_route(message: str, available_skills: dict[str, Any]) -> ToolCall | None:
    """Instant keyword-based skill classification — 0ms, no LLM needed."""
    msg_lower = message.lower()
    for keywords, skill, method, reasoning in _KEYWORD_SKILL_MAP:
        if skill not in available_skills:
            continue
        if any(kw in msg_lower for kw in keywords):
            return ToolCall(skill=skill, method=method, params={}, reasoning=reasoning)
    return None


class Nanobot:
    """The central hybrid agent. Singleton per process."""

    _instance: Nanobot | None = None

    def __init__(self):
        # Three-Body Orchestrator: CEO + Alpha + Beta
        self.local_llm = LLM()           # CEO — DeepSeek R1 8B (Ollama)
        self.alpha_engine = GroqAlpha()   # Contract Engine Alpha (fast 8B)
        self.beta_engine = GroqBeta()     # Contract Engine Beta (powerful 70B)

        # The Three-Body replaces DualLLM
        self.three_body = ThreeBody(
            ceo=self.local_llm,
            alpha=self.alpha_engine,
            beta=self.beta_engine,
        )

        self.memory = Memory(max_turns=50)
        self.skills: dict[str, Any] = {}  # name -> skill instance
        self.router: SkillRouter | None = None
        self.state = AgentState.IDLE
        self._start_time = time.time()
        self._ws_broadcast: Callable[[WSEvent], Any] | None = None
        self._browser_manager: Any = None

    @classmethod
    def get_instance(cls) -> Nanobot:
        if cls._instance is None:
            cls._instance = Nanobot()
        return cls._instance

    # ── Lifecycle ────────────────────────────────────────────────

    async def startup(self) -> None:
        """Initialize everything: Three-Body health, discover skills, build router."""
        console.print("[bold cyan]🤖 Nanobot Three-Body Engine starting up...[/]")

        # 1. Check all three engines
        console.print("  [dim]Checking Three-Body engines...[/]")
        health = await self.three_body.startup()

        if not health["ceo"] and not health["alpha"] and not health["beta"]:
            console.print("  ❌ [red]No engine available! System will have limited functionality.[/]")

        # 2. Discover and load skills
        await self._discover_skills()

        # 3. Build router — 100% local (DeepSeek R1 8B via Ollama)
        manifests = [s.manifest() for s in self.skills.values()]
        self.router = SkillRouter(
            local_llm=self.local_llm if health["ceo"] else None,
            manifests=manifests,
        )
        if health["ceo"]:
            console.print("  ✅ Router will use [green]local DeepSeek R1 8B[/] for skill routing")
        else:
            console.print("  ⚠️  CEO offline — router will have no LLM (keyword-only)")
        console.print(f"  ✅ Router initialized with {len(manifests)} skills")

        # 4. Start all skills (remove failed ones from routing)
        failed_skills = []
        for name, skill in self.skills.items():
            try:
                await skill.startup()
                # Wire reminder notification callback to WS broadcast
                if hasattr(skill, "set_notification_callback"):
                    if self._ws_broadcast:
                        skill.set_notification_callback(self._ws_broadcast)
                    else:
                        # WS broadcast may be set later — use a lazy wrapper
                        async def _lazy_broadcast(data, _self=self):
                            if _self._ws_broadcast:
                                await _self._ws_broadcast(data)
                        skill.set_notification_callback(_lazy_broadcast)
                console.print(f"  ✅ Skill ready: [green]{name}[/]")
            except Exception as e:
                console.print(f"  ❌ Skill failed: [red]{name}[/] — {e}")
                failed_skills.append(name)

        # Remove failed skills so they're not routed to
        for name in failed_skills:
            del self.skills[name]
            console.print(f"  🗑️  Removed failed skill: [red]{name}[/]")

        mode = "three-body" if health["ceo"] and (health["alpha"] or health["beta"]) else (
            "ceo-only" if health["ceo"] else (
                "cloud-only" if health["alpha"] or health["beta"] else "degraded"
            )
        )
        engines_up = sum([health["ceo"], health["alpha"], health["beta"]])
        console.print(f"[bold green]🚀 Nanobot is alive! Mode: {mode} ({engines_up}/3 engines)[/]")

    async def shutdown(self) -> None:
        """Gracefully shut down all skills and connections."""
        console.print("[bold yellow]Nanobot shutting down...[/]")
        for name, skill in self.skills.items():
            try:
                await skill.shutdown()
            except Exception as e:
                console.print(f"  ⚠️  Error shutting down {name}: {e}")
        await self.three_body.close()
        if self._browser_manager:
            await self._browser_manager.close()
        console.print("[bold red]Nanobot stopped.[/]")

    # ── Skill Discovery ──────────────────────────────────────────

    async def _discover_skills(self) -> None:
        """Auto-discover skills from the skills/ directory."""
        skills_dir = Path(__file__).parent.parent / "skills"

        # Make sure skills package is importable
        engine_root = str(Path(__file__).parent.parent)
        if engine_root not in sys.path:
            sys.path.insert(0, engine_root)

        for file in skills_dir.glob("*.py"):
            if file.name.startswith("_") or file.name == "base.py":
                continue

            module_name = f"skills.{file.stem}"
            try:
                module = importlib.import_module(module_name)
                # Find all BaseSkill subclasses in the module
                from skills.base import BaseSkill

                for attr_name in dir(module):
                    attr = getattr(module, attr_name)
                    if (
                        inspect.isclass(attr)
                        and issubclass(attr, BaseSkill)
                        and attr is not BaseSkill
                    ):
                        instance = attr()
                        self.skills[instance.name] = instance
                        console.print(f"  📦 Discovered skill: [cyan]{instance.name}[/]")
            except Exception as e:
                console.print(f"  ⚠️  Failed to load {module_name}: {e}")

    # ── The Brain — Agent Loop ───────────────────────────────────

    async def process(self, request: ChatRequest) -> ChatResponse:
        """
        Main agent loop:
        1. Add user message to memory
        2. Route to skill via LLM
        3. Execute skill
        4. If more reasoning needed, loop
        5. Generate final response
        """
        t0 = time.time()
        self.state = AgentState.THINKING
        await self._emit(WSEvent(type="state_change", data={"state": "thinking"}))

        session_id = request.conversation_id
        self.memory.add(session_id, "user", request.message)

        # Store any extra context
        if request.context:
            for k, v in request.context.items():
                self.memory.set_context(session_id, k, v)

        tools_used: list[str] = []
        reasoning_trace = ""

        # Get conversation history
        history = self.memory.get_history(session_id)
        messages = [
            {"role": "system", "content": NANOBOT_SYSTEM_PROMPT},
            *history,
        ]

        for turn in range(MAX_TOOL_TURNS):
            # Pre-check: if Three-Body keyword classification is confident,
            # skip skill router — avoids 25-42s overhead from rate-limited
            # router LLM calls + Playwright skill crashes on Windows.
            # BUT: always allow skill routing if skill-actionable words present.
            _delegate, _kw_conf = self.three_body._classify_delegate(request.message)

            # Skill-hint keywords — if any are present, always try the router
            _SKILL_HINTS = {
                # planner
                "urgent", "urgency", "deadline", "countdown", "stale",
                "focus", "outlook", "progress", "preparation", "plan",
                # calendar
                "schedule", "calendar", "free slot", "conflict",
                "upcoming", "today", "this week", "tomorrow",
                # reminder
                "remind", "reminder", "alarm", "snooze",
                # email
                "email", "inbox", "unread", "send email",
                # notes
                "note", "capture", "journal",
                # web_research
                "search the web", "look up", "research",
                # whatsapp
                "whatsapp", "message",
            }
            msg_lower = request.message.lower()
            _has_skill_hint = any(kw in msg_lower for kw in _SKILL_HINTS)

            if _kw_conf >= 0.5 and not _has_skill_hint:
                console.print(
                    f"  ⏩ Skipping router — Three-Body fast-path: "
                    f"[cyan]{_delegate.value}[/] (conf={_kw_conf:.2f})"
                )
                break
            elif _has_skill_hint:
                console.print(
                    f"  🔀 Skill hint detected — routing to skill system"
                )

            # Route — decide if we need a tool
            if self.router and self.skills:
                self.state = AgentState.THINKING
                await self._emit(WSEvent(type="thought", data={"text": "Deciding which tool to use..."}))

                # FAST PATH: keyword-based skill routing (0ms, no LLM)
                # Try this FIRST — if it matches, skip the slow LLM router entirely.
                tool_call = None
                if _has_skill_hint:
                    tool_call = _keyword_fallback_route(request.message, self.skills)
                    if tool_call:
                        console.print(
                            f"  ⚡ Keyword router matched: "
                            f"[cyan]{tool_call.skill}.{tool_call.method}[/]"
                        )

                # SLOW PATH: LLM-based routing (DeepSeek R1 8B, ~30-60s)
                # Only if keyword routing didn't match.
                if tool_call is None:
                    context_str = str(self.memory.get_context(session_id))
                    tool_call = await self.router.route(request.message, context_str)

                if tool_call.skill != "none" and tool_call.skill in self.skills:
                    # Execute the tool
                    skill_name = tool_call.skill
                    self.state = AgentState.TOOL_CALLING
                    await self._emit(WSEvent(
                        type="tool_start",
                        data={
                            "skill": skill_name,
                            "method": tool_call.method,
                            "reasoning": tool_call.reasoning,
                        },
                    ))

                    console.print(
                        f"  🔧 Calling [cyan]{skill_name}.{tool_call.method}[/]"
                        f" — {tool_call.reasoning}"
                    )

                    self.state = AgentState.EXECUTING
                    skill = self.skills[skill_name]
                    tt0 = time.time()
                    try:
                        result = await skill.execute(tool_call.method, tool_call.params)
                        result.duration_ms = (time.time() - tt0) * 1000
                    except Exception as e:
                        console.print(f"  ⚠️  Skill {skill_name} crashed: {e}, falling through to LLM")
                        break  # Skip tool, let Three-Body handle it

                    tools_used.append(f"{skill_name}.{tool_call.method}")
                    reasoning_trace += f"\n[Tool: {skill_name}.{tool_call.method}] {tool_call.reasoning}"

                    await self._emit(WSEvent(
                        type="tool_result",
                        data={
                            "skill": skill_name,
                            "method": tool_call.method,
                            "success": result.success,
                            "duration_ms": result.duration_ms,
                            "preview": str(result.data)[:200] if result.data else result.error,
                        },
                    ))

                    # Add tool result to conversation
                    tool_output = (
                        f"Tool {skill_name}.{tool_call.method} result: "
                        f"{'SUCCESS' if result.success else 'ERROR'}\n"
                        f"{result.data if result.success else result.error}"
                    )
                    self.memory.add(session_id, "tool", tool_output)
                    messages.append({"role": "assistant", "content": f"[Using tool: {skill_name}.{tool_call.method}]"})
                    messages.append({"role": "user", "content": tool_output})

                    # For single-turn tool calls, break and generate response
                    break
                else:
                    # No tool needed — proceed to generate response
                    break
            else:
                break

        # Generate final response using DualLLM (smart dispatch)
        self.state = AgentState.RESPONDING
        await self._emit(WSEvent(type="state_change", data={"state": "responding"}))

        # Parse forced strategy if specified
        forced_strategy = None
        if request.strategy:
            try:
                forced_strategy = LLMStrategy(request.strategy)
            except ValueError:
                pass  # Invalid strategy, use auto

        response_text, engine_used = await self.three_body.chat(
            messages, temperature=0.4, max_tokens=4096,
            classify_message=request.message,  # Use original user query for complexity
            strategy=forced_strategy,
        )

        # Separate thinking from answer (DeepSeek R1 format)
        thinking, answer = self.local_llm.extract_thinking(response_text)
        if not answer:
            answer = response_text

        self.memory.add(session_id, "assistant", answer)

        elapsed_ms = (time.time() - t0) * 1000
        self.state = AgentState.IDLE
        await self._emit(WSEvent(type="state_change", data={"state": "idle"}))

        return ChatResponse(
            message=answer,
            reasoning=thinking or reasoning_trace,
            tools_used=tools_used,
            state=AgentState.IDLE,
            duration_ms=elapsed_ms,
            engine=engine_used,
        )

    # ── Status ───────────────────────────────────────────────────

    def get_status(self) -> StatusResponse:
        return StatusResponse(
            state=self.state,
            active_skills=list(self.skills.keys()),
            browser_alive=self._browser_manager is not None
            and getattr(self._browser_manager, "is_alive", False),
            ollama_connected=self.three_body.is_local_connected,
            groq_connected=self.three_body.is_cloud_connected,
            alpha_connected=self.three_body.is_alpha_connected,
            beta_connected=self.three_body.is_beta_connected,
            uptime_seconds=time.time() - self._start_time,
            local_model=self.local_llm.model,
            cloud_model=self.beta_engine.model,
            alpha_model=self.alpha_engine.model,
            mode="three-body" if self.three_body.is_local_connected and self.three_body.is_cloud_connected else (
                "ceo-only" if self.three_body.is_local_connected else (
                    "cloud-only" if self.three_body.is_cloud_connected else "degraded"
                )
            ),
            llm_stats=self.three_body.get_stats(),
            router_stats=self.router.get_stats() if self.router else {},
        )

    # ── WebSocket Broadcasting ───────────────────────────────────

    def set_broadcast(self, fn: Callable[[WSEvent], Any]) -> None:
        """Register a function to broadcast events to all WebSocket clients."""
        self._ws_broadcast = fn

    async def _emit(self, event: WSEvent) -> None:
        """Push an event to the frontend."""
        if self._ws_broadcast:
            try:
                await self._ws_broadcast(event)
            except Exception:
                pass  # Don't crash the agent loop for WS errors

    def set_browser_manager(self, manager: Any) -> None:
        self._browser_manager = manager
