"""
Dual-LLM Orchestrator — the brain behind hybrid intelligence.

Combines local DeepSeek R1 8B (Ollama) + Groq Cloud (llama-3.3-70b-versatile)
to get the best of both worlds:

LOCAL 8B (Ollama):
  - Privacy-first, no data leaves the machine
  - Handles simple/quick tasks, drafts, casual conversation
  - Runs offline — no internet needed
  - The "always-on" baseline

GROQ CLOUD (70B):
  - Blazing fast (~500ms vs ~80s for local)
  - Powers the skill router (accurate intent classification)
  - Aids complex reasoning (validates/refines local drafts)
  - Handles multi-step planning, code gen, long-context tasks

STRATEGY:
  1. ROUTING → Always Groq (fast + accurate, <500ms)
  2. SIMPLE CHAT → Local 8B (privacy, always available)
  3. COMPLEX TASKS → Groq generates, local validates (or vice versa)
  4. REFINEMENT → Local drafts → Groq polishes
  5. FALLBACK → If one fails, the other takes over
"""

from __future__ import annotations

import asyncio
import time
from enum import Enum
from typing import Any, AsyncGenerator

from rich.console import Console

from .groq_llm import GroqLLM
from .llm import LLM

console = Console()


class LLMStrategy(str, Enum):
    """Which LLM to use for what."""
    LOCAL_ONLY = "local_only"       # Force local 8B
    CLOUD_ONLY = "cloud_only"       # Force Groq cloud
    CLOUD_ROUTE = "cloud_route"     # Groq for routing only
    CLOUD_AID = "cloud_aid"         # Local drafts, Groq refines
    CLOUD_FIRST = "cloud_first"     # Groq first, local fallback
    LOCAL_FIRST = "local_first"     # Local first, Groq fallback
    CONSENSUS = "consensus"         # Both generate, pick best


# Classify message complexity
COMPLEX_KEYWORDS = [
    "explain", "analyze", "compare", "plan", "strategy", "calculate",
    "code", "implement", "debug", "summarize", "research", "design",
    "architecture", "algorithm", "optimize", "evaluate", "critique",
    "multi-step", "detailed", "comprehensive", "in-depth", "pros and cons",
]


class DualLLM:
    """
    Orchestrates local + cloud LLMs for optimal performance.
    
    The local 8B model is the heart — always running, always available.
    Groq cloud is the turbocharger — fast, powerful, aids when needed.
    """

    def __init__(
        self,
        local: LLM | None = None,
        cloud: GroqLLM | None = None,
    ):
        self.local = local or LLM()
        self.cloud = cloud or GroqLLM()
        self._local_healthy = False
        self._cloud_healthy = False
        self._stats = {
            "local_calls": 0,
            "cloud_calls": 0,
            "local_avg_ms": 0.0,
            "cloud_avg_ms": 0.0,
            "fallbacks": 0,
            "refinements": 0,
        }

    async def startup(self) -> dict[str, bool]:
        """Check health of both LLMs."""
        local_task = self.local.check_health()
        cloud_task = self.cloud.check_health()
        self._local_healthy, self._cloud_healthy = await asyncio.gather(
            local_task, cloud_task
        )

        if self._local_healthy:
            console.print(f"  ✅ Local LLM: [green]{self.local.model}[/]")
        else:
            console.print(f"  ⚠️  Local LLM: [yellow]offline[/]")

        if self._cloud_healthy:
            console.print(f"  ✅ Cloud LLM: [green]{self.cloud.model}[/] (Groq)")
        else:
            console.print(f"  ⚠️  Cloud LLM: [yellow]offline[/]")

        return {"local": self._local_healthy, "cloud": self._cloud_healthy}

    @property
    def is_local_connected(self) -> bool:
        return self._local_healthy and self.local.is_connected

    @property
    def is_cloud_connected(self) -> bool:
        return self._cloud_healthy and self.cloud.is_connected

    def get_stats(self) -> dict[str, Any]:
        return {**self._stats, "local_online": self.is_local_connected, "cloud_online": self.is_cloud_connected}

    # ── Smart Dispatch ───────────────────────────────────────────

    def _classify_complexity(self, message: str) -> str:
        """Classify whether a message is simple or complex."""
        msg_lower = message.lower()
        word_count = len(message.split())

        # Short messages are simple
        if word_count < 8:
            return "simple"

        # Check for complex keywords
        complex_score = sum(1 for kw in COMPLEX_KEYWORDS if kw in msg_lower)
        if complex_score >= 2 or word_count > 50:
            return "complex"

        return "simple"

    def _pick_strategy(self, message: str, force: LLMStrategy | None = None) -> LLMStrategy:
        """Decide which LLM strategy to use based on message + availability."""
        if force:
            return force

        # Auto-reconnect: if marked offline, optimistically try again
        # (the actual call will validate and re-mark if truly down)
        if not self._cloud_healthy and not self._local_healthy:
            # Both marked offline — try cloud first (faster to check)
            return LLMStrategy.CLOUD_FIRST
        if not self._cloud_healthy:
            return LLMStrategy.LOCAL_ONLY
        if not self._local_healthy:
            return LLMStrategy.CLOUD_ONLY

        # Both available — smart dispatch
        complexity = self._classify_complexity(message)

        if complexity == "complex":
            return LLMStrategy.CLOUD_AID  # Groq generates, local validates context
        else:
            return LLMStrategy.LOCAL_FIRST  # Local handles, Groq as fallback

    # ── Main Chat Method ─────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
        strategy: LLMStrategy | None = None,
        refine: bool = False,
        classify_message: str | None = None,
    ) -> tuple[str, str]:
        """
        Chat using the dual LLM system.
        
        Returns: (response_text, engine_used)
        engine_used is "local", "cloud", "cloud+local_refined", "local+cloud_refined"
        
        classify_message: Use this for complexity classification instead of
        the last message (important when messages[-1] is a tool result).
        """
        # Use explicit classify_message, or find the first user message as fallback
        if classify_message:
            user_msg = classify_message
        else:
            # Find the original user message (skip tool results)
            user_msg = ""
            for m in messages:
                if m.get("role") == "user" and not m.get("content", "").startswith("Tool "):
                    user_msg = m["content"]
                    break
            if not user_msg:
                user_msg = messages[-1]["content"] if messages else ""

        strat = self._pick_strategy(user_msg, strategy)
        console.print(f"  🧠 Strategy: [cyan]{strat.value}[/] (complexity: {self._classify_complexity(user_msg)})")

        if strat == LLMStrategy.LOCAL_ONLY:
            return await self._call_local(messages, temperature, max_tokens), "local"

        elif strat == LLMStrategy.CLOUD_ONLY:
            return await self._call_cloud(messages, temperature, max_tokens), "cloud"

        elif strat == LLMStrategy.LOCAL_FIRST:
            return await self._local_first(messages, temperature, max_tokens)

        elif strat == LLMStrategy.CLOUD_FIRST:
            return await self._cloud_first(messages, temperature, max_tokens)

        elif strat == LLMStrategy.CLOUD_AID:
            return await self._cloud_aid(messages, temperature, max_tokens)

        elif strat == LLMStrategy.CONSENSUS:
            return await self._consensus(messages, temperature, max_tokens)

        else:
            # Default: try cloud, fall back to local
            return await self._cloud_first(messages, temperature, max_tokens)

    # ── Strategy Implementations ─────────────────────────────────

    async def _call_local(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> str:
        """Call local Ollama."""
        t0 = time.perf_counter()
        try:
            result = await self.local.chat(messages, temp, max_tok)
            elapsed = (time.perf_counter() - t0) * 1000
            self._stats["local_calls"] += 1
            self._update_avg("local_avg_ms", elapsed, self._stats["local_calls"])
            self._local_healthy = True
            return result
        except Exception as e:
            self._local_healthy = False
            raise

    async def _call_cloud(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> str:
        """Call Groq cloud."""
        t0 = time.perf_counter()
        try:
            result = await self.cloud.chat(messages, temp, max_tok)
            elapsed = (time.perf_counter() - t0) * 1000
            self._stats["cloud_calls"] += 1
            self._update_avg("cloud_avg_ms", elapsed, self._stats["cloud_calls"])
            self._cloud_healthy = True
            return result
        except Exception as e:
            self._cloud_healthy = False
            raise

    async def _local_first(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> tuple[str, str]:
        """Try local first, fall back to cloud if local fails."""
        try:
            result = await self._call_local(messages, temp, max_tok)
            return result, "local"
        except Exception:
            self._stats["fallbacks"] += 1
            console.print("  ⚡ Local failed, falling back to Groq cloud")
            try:
                result = await self._call_cloud(messages, temp, max_tok)
                return result, "cloud(fallback)"
            except Exception:
                return "I'm sorry, both local and cloud LLMs are unavailable right now.", "error"

    async def _cloud_first(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> tuple[str, str]:
        """Try cloud first, fall back to local."""
        try:
            result = await self._call_cloud(messages, temp, max_tok)
            return result, "cloud"
        except Exception:
            self._stats["fallbacks"] += 1
            console.print("  ⚡ Cloud failed, falling back to local 8B")
            try:
                result = await self._call_local(messages, temp, max_tok)
                return result, "local(fallback)"
            except Exception:
                return "I'm sorry, both local and cloud LLMs are unavailable right now.", "error"

    async def _cloud_aid(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> tuple[str, str]:
        """
        Cloud generates the main response (fast + powerful).
        Local validates/adds personal context.
        This is the "aid" mode — cloud helps local, doesn't replace it.
        """
        try:
            # Step 1: Cloud generates the primary response (fast)
            cloud_response = await self._call_cloud(messages, temp, max_tok)

            # Step 2: Local refines with personal context (if available and fast enough)
            # We give local a condensed task to keep it quick
            refine_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a local AI assistant running on the student's machine. "
                        "A cloud AI has drafted a response below. Your job is to:\n"
                        "1. Keep the core content if it's good\n"
                        "2. Add any personal context you know about the student\n"
                        "3. Make it more concise and actionable\n"
                        "4. If the draft is already good, return it as-is with minor improvements\n"
                        "Keep your response focused and brief."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Original question: {messages[-1]['content']}\n\n"
                        f"Cloud AI draft:\n{cloud_response}\n\n"
                        "Refine this response. Keep it concise."
                    ),
                },
            ]

            try:
                # Give local a reasonable timeout for refinement
                refined = await asyncio.wait_for(
                    self._call_local(refine_messages, 0.3, 2048),
                    timeout=90.0,  # 90s max for refinement
                )
                self._stats["refinements"] += 1

                # Extract clean answer (remove thinking tags)
                _, clean = self.local.extract_thinking(refined)
                if clean and len(clean) > 20:
                    return clean, "cloud+local_refined"
                else:
                    return cloud_response, "cloud(local_skip)"
            except (asyncio.TimeoutError, Exception):
                # If local is too slow or fails, just use cloud response
                return cloud_response, "cloud(local_timeout)"

        except Exception as e:
            # Cloud failed, try local alone
            console.print(f"  ⚠️  CLOUD_AID cloud step failed: [red]{e}[/]")
            self._stats["fallbacks"] += 1
            try:
                result = await self._call_local(messages, temp, max_tok)
                return result, "local(cloud_failed)"
            except Exception as e2:
                console.print(f"  ❌ CLOUD_AID local fallback also failed: [red]{e2}[/]")
                return "I'm sorry, both LLMs are unavailable.", "error"

    async def _consensus(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> tuple[str, str]:
        """
        Both generate independently, then cloud picks the best.
        Expensive — only for critical decisions.
        """
        local_result = None
        cloud_result = None

        # Run both in parallel
        async def get_local():
            nonlocal local_result
            try:
                local_result = await self._call_local(messages, temp, max_tok)
            except Exception:
                pass

        async def get_cloud():
            nonlocal cloud_result
            try:
                cloud_result = await self._call_cloud(messages, temp, max_tok)
            except Exception:
                pass

        await asyncio.gather(get_local(), get_cloud())

        if cloud_result and local_result:
            # Use cloud to judge (it's faster and smarter)
            judge_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a quality judge. Given two AI responses to a user question, "
                        "pick the better one or merge the best parts. Output ONLY the final "
                        "best response — no commentary about which was better."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Question: {messages[-1]['content']}\n\n"
                        f"Response A (local):\n{local_result}\n\n"
                        f"Response B (cloud):\n{cloud_result}\n\n"
                        "Output the best response:"
                    ),
                },
            ]
            try:
                best = await self._call_cloud(judge_messages, 0.2, max_tok)
                return best, "consensus"
            except Exception:
                return cloud_result, "cloud"
        elif cloud_result:
            return cloud_result, "cloud"
        elif local_result:
            return local_result, "local"
        else:
            return "Both LLMs are unavailable.", "error"

    # ── Routing (always cloud) ───────────────────────────────────

    async def route(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 512,
    ) -> str:
        """
        Route a message using the fastest available LLM.
        Prefers cloud (Groq) for speed + accuracy.
        Falls back to local if cloud is down.
        """
        try:
            return await self.cloud.chat(
                messages, temperature, max_tokens, json_mode=True
            )
        except Exception:
            # Fallback to local for routing
            try:
                return await self.local.chat(messages, temperature, max_tokens)
            except Exception:
                return '{"skill": "none", "method": "chat", "params": {}, "reasoning": "LLM unavailable"}'

    # ── Streaming (prefers cloud for speed) ──────────────────────

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
        prefer_cloud: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens — prefers cloud for speed."""
        if prefer_cloud and self._cloud_healthy:
            try:
                async for token in self.cloud.chat_stream(messages, temperature, max_tokens):
                    yield token
                return
            except Exception:
                pass

        # Fallback to local streaming
        if self._local_healthy:
            async for token in self.local.chat_stream(messages, temperature, max_tokens):
                yield token
        else:
            yield "Both LLMs are unavailable."

    # ── Helpers ──────────────────────────────────────────────────

    def _update_avg(self, key: str, new_val: float, count: int) -> None:
        old = self._stats[key]
        self._stats[key] = old + (new_val - old) / count

    async def close(self):
        await asyncio.gather(
            self.local.close(),
            self.cloud.close(),
        )
