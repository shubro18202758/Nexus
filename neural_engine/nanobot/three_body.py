"""
Three-Body Orchestrator — the brain of the NEXUS system.

Architecture:
  CEO       = DeepSeek R1 8B (local Ollama) — the orchestrator
  Alpha     = Groq llama-3.1-8b-instant     — fast ingestion, classification
  Beta      = Groq llama-3.3-70b-versatile   — advanced reasoning & execution

The CEO sits at the centre with a "Tools" dictionary. When a user
message arrives, the CEO analyses it and decides:
  1. Handle it locally (simple chat, personal context)
  2. Delegate to Alpha (scan channels, classify text, extract entities)
  3. Delegate to Beta (invoke_custom_nanobot, deep reasoning, code gen)
  4. Fan-out to both Alpha+Beta, then synthesise results

Fallback cascade: CEO → Beta → Alpha → raw error.
"""

from __future__ import annotations

import asyncio
import json
import time
from enum import Enum
from typing import Any, AsyncGenerator

from rich.console import Console

from .groq_alpha import GroqAlpha
from .groq_beta import GroqBeta
from .llm import LLM

console = Console()


# ── Delegation Targets ───────────────────────────────────────────

class Delegate(str, Enum):
    CEO = "ceo"               # Handle locally (DeepSeek R1 8B)
    ALPHA = "alpha"           # Fast ingestion (Groq 8B instant)
    BETA = "beta"             # Advanced reasoning (Groq 70B)
    ALPHA_THEN_CEO = "alpha_then_ceo"  # Alpha scans, CEO reasons
    BETA_THEN_CEO = "beta_then_ceo"    # Beta drafts, CEO refines
    FAN_OUT = "fan_out"       # Both engines, CEO picks best


# Keywords that hint at delegation targets
ALPHA_KEYWORDS = [
    "scan", "classify", "extract", "parse", "ingest", "summarise",
    "summarize", "entities", "sentiment", "priority", "events",
    "channel", "notification", "quick", "fast", "triage",
    "log", "csv", "json", "text", "category", "label",
    "sort", "filter", "tag", "inbox", "email",
]

BETA_KEYWORDS = [
    "explain", "analyze", "analyse", "compare", "plan", "strategy", "code",
    "implement", "debug", "architecture", "algorithm", "optimize",
    "design", "evaluate", "critique", "comprehensive", "in-depth",
    "multi-step", "execute", "nanobot", "complex", "generate",
    "deep", "reason", "draft", "detailed", "calculate", "research",
    "write", "function", "class", "component", "typescript",
    "python", "javascript", "react", "program", "script",
    "trade-off", "tradeoff", "migrat", "deploy", "scraper",
    "encrypt", "crypto", "proof", "theorem",
    "refactor", "database", "schema", "api", "build",
]


# ── CEO System Prompt ────────────────────────────────────────────

CEO_SYSTEM_PROMPT = """You are the CEO of the NEXUS Three-Body Orchestrator.
You are DeepSeek R1 8B running locally on the student's machine.

You have two contract engines at your command:
  * ALPHA — Groq llama-3.1-8b-instant (ultra-fast, cheap)
    Tools: scan_channel_events, classify_text, extract_entities, summarise_chunk
  * BETA  — Groq llama-3.3-70b-versatile (powerful, advanced)
    Tools: invoke_custom_nanobot, plan_execution, generate_code, deep_reason

Delegation rules:
  - Simple chat, greetings, personal context → handle yourself (CEO)
  - Scanning, classifying, parsing, entity extraction → delegate to ALPHA
  - Complex reasoning, code, multi-step planning, advanced analysis → delegate to BETA
  - If unsure, handle yourself and note uncertainty

When a user sends a message, respond conversationally AND naturally.
If you delegated work, weave the result into your response seamlessly —
the user should never feel like they're talking to a committee.

You are a university student's personal AI assistant. Be direct, helpful, proactive."""


# ── CEO Delegation Prompt (JSON) ─────────────────────────────────

CEO_DELEGATION_PROMPT = """Analyse the user's message and decide who should handle it.

Output ONLY a JSON object:
{
  "delegate": "ceo" | "alpha" | "beta",
  "reasoning": "one-line reason",
  "alpha_task": "task for alpha if delegate=alpha, else null",
  "beta_task": "task for beta if delegate=beta, else null"
}

Rules:
- "ceo": simple chat, greetings, personal context, short answers
- "alpha": scanning, classifying, parsing, entity extraction, summarisation
- "beta": complex reasoning, code generation, multi-step planning, deep analysis
"""


class ThreeBody:
    """
    Three-Body Orchestrator.

    Replaces DualLLM with a CEO-driven delegation architecture.
    Maintains backward compatibility with DualLLM's chat() interface.
    """

    def __init__(
        self,
        ceo: LLM | None = None,
        alpha: GroqAlpha | None = None,
        beta: GroqBeta | None = None,
    ):
        self.ceo = ceo or LLM()
        self.alpha = alpha or GroqAlpha()
        self.beta = beta or GroqBeta()

        self._ceo_healthy = False
        self._alpha_healthy = False
        self._beta_healthy = False

        self._stats = {
            "ceo_calls": 0,
            "alpha_calls": 0,
            "beta_calls": 0,
            "delegations": 0,
            "fallbacks": 0,
            "fan_outs": 0,
            "ceo_avg_ms": 0.0,
            "alpha_avg_ms": 0.0,
            "beta_avg_ms": 0.0,
        }

    # ── Lifecycle ────────────────────────────────────────────────

    async def startup(self) -> dict[str, bool]:
        """Check health of all three engines in parallel."""
        ceo_task = self.ceo.check_health()
        alpha_task = self.alpha.check_health()
        beta_task = self.beta.check_health()

        self._ceo_healthy, self._alpha_healthy, self._beta_healthy = (
            await asyncio.gather(ceo_task, alpha_task, beta_task)
        )

        if self._ceo_healthy:
            console.print(f"  ✅ CEO (local):  [green]{self.ceo.model}[/]")
        else:
            console.print(f"  ⚠️  CEO (local):  [yellow]offline[/]")

        if self._alpha_healthy:
            console.print(f"  ✅ Alpha (Groq): [green]{self.alpha.model}[/]")
        else:
            console.print(f"  ⚠️  Alpha (Groq): [yellow]offline[/]")

        if self._beta_healthy:
            console.print(f"  ✅ Beta (Groq):  [green]{self.beta.model}[/]")
        else:
            console.print(f"  ⚠️  Beta (Groq):  [yellow]offline[/]")

        return {
            "ceo": self._ceo_healthy,
            "alpha": self._alpha_healthy,
            "beta": self._beta_healthy,
        }

    @property
    def is_local_connected(self) -> bool:
        return self._ceo_healthy and self.ceo.is_connected

    @property
    def is_cloud_connected(self) -> bool:
        """At least one Groq engine is up."""
        return self._alpha_healthy or self._beta_healthy

    @property
    def is_alpha_connected(self) -> bool:
        return self._alpha_healthy

    @property
    def is_beta_connected(self) -> bool:
        return self._beta_healthy

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "ceo_online": self.is_local_connected,
            "alpha_online": self.is_alpha_connected,
            "beta_online": self.is_beta_connected,
            "alpha_stats": self.alpha.get_stats(),
            "beta_stats": self.beta.get_stats(),
        }

    # ── CEO Delegation ───────────────────────────────────────────

    def _classify_delegate(self, message: str) -> tuple[Delegate, float]:
        """
        Quick keyword-based pre-classification.
        Returns (delegate, confidence) where confidence is 0.0-1.0.
        High confidence means keywords clearly matched.
        """
        msg_lower = message.lower()
        word_count = len(message.split())

        # Very short messages → CEO handles directly
        if word_count < 5:
            return Delegate.CEO, 0.9

        alpha_score = sum(1 for kw in ALPHA_KEYWORDS if kw in msg_lower)
        beta_score = sum(1 for kw in BETA_KEYWORDS if kw in msg_lower)
        max_score = max(alpha_score, beta_score, 1)
        spread = abs(alpha_score - beta_score)

        if alpha_score > beta_score and alpha_score >= 1:
            conf = min(1.0, 0.5 + spread * 0.15)
            return Delegate.ALPHA, conf
        elif beta_score > alpha_score and beta_score >= 1:
            conf = min(1.0, 0.5 + spread * 0.15)
            return Delegate.BETA, conf
        elif alpha_score == beta_score and alpha_score >= 1:
            # Tied — prefer the engine whose keyword appears FIRST (primary intent)
            first_alpha = min(
                (msg_lower.find(kw) for kw in ALPHA_KEYWORDS if kw in msg_lower),
                default=len(msg_lower),
            )
            first_beta = min(
                (msg_lower.find(kw) for kw in BETA_KEYWORDS if kw in msg_lower),
                default=len(msg_lower),
            )
            if first_alpha <= first_beta:
                return Delegate.ALPHA, 0.55
            else:
                return Delegate.BETA, 0.55
        elif word_count > 40:
            # Long messages → Beta for deep reasoning
            return Delegate.BETA, 0.5
        else:
            return Delegate.CEO, 0.4

    async def _smart_delegate(self, message: str) -> dict[str, Any]:
        """
        Smart two-tier delegation:
          1. Fast keyword classification (instant, 0ms)
          2. CEO confirmation ONLY if keywords are ambiguous (conf < 0.6)

        This avoids the 50-120s CEO overhead on every request.
        """
        delegate, confidence = self._classify_delegate(message)

        # High-confidence keyword match → skip CEO entirely (fast path)
        if confidence >= 0.6:
            console.print(
                f"  ⚡ Fast-path: [cyan]{delegate.value}[/] "
                f"(keyword conf={confidence:.2f})"
            )
            return {
                "delegate": delegate.value,
                "reasoning": f"keyword classification (conf={confidence:.2f})",
                "alpha_task": message if delegate == Delegate.ALPHA else None,
                "beta_task": message if delegate == Delegate.BETA else None,
            }

        # Low confidence — ask CEO if it's online (with 20s timeout)
        if self._ceo_healthy:
            try:
                delegation_messages = [
                    {"role": "system", "content": CEO_DELEGATION_PROMPT},
                    {"role": "user", "content": message},
                ]
                raw = await asyncio.wait_for(
                    self.ceo.chat(delegation_messages, temperature=0.1, max_tokens=256),
                    timeout=20.0,
                )
                parsed = self.ceo.extract_json(raw)
                if parsed and isinstance(parsed, dict) and "delegate" in parsed:
                    console.print(
                        f"  🧠 CEO routed: [cyan]{parsed['delegate']}[/] "
                        f"reason=[dim]{parsed.get('reasoning', '')}[/]"
                    )
                    return parsed
            except asyncio.TimeoutError:
                console.print("  ⏰ CEO delegation timed out (20s), using keyword fallback")
            except Exception as e:
                console.print(f"  ⚠️  CEO delegation failed: {e}")

        # Fall through to keyword result
        console.print(
            f"  🔤 Keyword fallback: [cyan]{delegate.value}[/] "
            f"(conf={confidence:.2f})"
        )
        return {
            "delegate": delegate.value,
            "reasoning": f"keyword fallback (conf={confidence:.2f})",
            "alpha_task": message if delegate == Delegate.ALPHA else None,
            "beta_task": message if delegate == Delegate.BETA else None,
        }

    # ── Main Chat Method (DualLLM-compatible interface) ──────────

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
        strategy: Any = None,
        classify_message: str | None = None,
        **kwargs,
    ) -> tuple[str, str]:
        """
        Three-Body chat — CEO orchestrates, delegates to Alpha/Beta.

        Returns: (response_text, engine_used)
        Maintains full backward compatibility with DualLLM.chat()
        """
        # Extract the original user message for classification
        if classify_message:
            user_msg = classify_message
        else:
            user_msg = ""
            for m in messages:
                if m.get("role") == "user" and not m.get("content", "").startswith("Tool "):
                    user_msg = m["content"]
                    break
            if not user_msg:
                user_msg = messages[-1]["content"] if messages else ""

        # Handle forced strategies from the old DualLLM interface
        if strategy:
            strat_str = strategy.value if hasattr(strategy, "value") else str(strategy)
            if strat_str == "local_only":
                return await self._call_ceo(messages, temperature, max_tokens), "ceo"
            elif strat_str == "cloud_only":
                return await self._call_beta_chat(messages, temperature, max_tokens), "beta"

        # Smart two-tier delegation (keyword fast-path, CEO only if ambiguous)
        t0 = time.perf_counter()
        decision = await self._smart_delegate(user_msg)
        delegate = decision.get("delegate", "ceo")
        reasoning = decision.get("reasoning", "")

        # Execute delegation
        if delegate == "alpha":
            return await self._delegate_alpha(
                messages, decision.get("alpha_task", user_msg),
                temperature, max_tokens,
            )
        elif delegate == "beta":
            return await self._delegate_beta(
                messages, decision.get("beta_task", user_msg),
                temperature, max_tokens,
            )
        else:
            # CEO handles directly
            return await self._handle_ceo(messages, temperature, max_tokens)

    # ── Delegation Strategies ────────────────────────────────────

    async def _handle_ceo(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> tuple[str, str]:
        """CEO handles the message directly. Fallback cascade if CEO fails."""
        try:
            result = await self._call_ceo(messages, temp, max_tok)
            return result, "ceo"
        except Exception:
            self._stats["fallbacks"] += 1
            console.print("  ⚡ CEO failed, falling back to Beta")
            try:
                result = await self._call_beta_chat(messages, temp, max_tok)
                return result, "beta(fallback)"
            except Exception:
                console.print("  ⚡ Beta failed, falling back to Alpha")
                try:
                    result = await self._call_alpha_chat(messages, temp, max_tok)
                    return result, "alpha(fallback)"
                except Exception:
                    return "All three engines are unavailable.", "error"

    async def _delegate_alpha(
        self,
        messages: list[dict[str, str]],
        task: str,
        temp: float,
        max_tok: int,
    ) -> tuple[str, str]:
        """
        Delegate to Alpha for fast ingestion/classification.
        Returns Alpha's output directly — no CEO synthesis overhead.
        """
        self._stats["delegations"] += 1
        self._stats["alpha_calls"] += 1

        try:
            t0 = time.perf_counter()
            alpha_result = await self.alpha.chat(
                [
                    {"role": "system", "content": "You are a fast ingestion engine. Process the request efficiently and conversationally."},
                    {"role": "user", "content": task},
                ],
                temperature=0.2,
                max_tokens=max_tok,
            )
            elapsed = (time.perf_counter() - t0) * 1000
            self._update_avg("alpha_avg_ms", elapsed, self._stats["alpha_calls"])
            return alpha_result, "alpha"

        except Exception as e:
            console.print(f"  ⚠️  Alpha delegation failed: {e}")
            self._stats["fallbacks"] += 1
            # Fallback: try Beta, then CEO
            try:
                result = await self._call_beta_chat(messages, temp, max_tok)
                return result, "beta(alpha_failed)"
            except Exception:
                try:
                    result = await self._call_ceo(messages, temp, max_tok)
                    return result, "ceo(alpha_failed)"
                except Exception:
                    return "All engines unavailable.", "error"

    async def _delegate_beta(
        self,
        messages: list[dict[str, str]],
        task: str,
        temp: float,
        max_tok: int,
    ) -> tuple[str, str]:
        """
        Delegate to Beta for advanced reasoning.
        Returns Beta's output directly — no CEO synthesis overhead.
        Includes smart 429 retry: if rate-limited, waits for the retry-after
        period (up to 180s) and retries ONCE before falling back to CEO.
        """
        self._stats["delegations"] += 1
        self._stats["beta_calls"] += 1

        for attempt in range(2):  # max 2 attempts (original + 1 retry)
            try:
                t0 = time.perf_counter()
                beta_result = await self.beta.invoke_custom_nanobot(task)
                elapsed = (time.perf_counter() - t0) * 1000
                self._update_avg("beta_avg_ms", elapsed, self._stats["beta_calls"])
                return beta_result, "beta"

            except Exception as e:
                err_str = str(e)
                # Check if this is a 429 rate-limit error with a retry-after hint
                if "429" in err_str and attempt == 0:
                    wait_secs = self._parse_retry_after(err_str)
                    if 0 < wait_secs <= 180:  # Wait up to 3 minutes
                        console.print(
                            f"  ⏳ Beta 429 rate-limited — waiting {wait_secs:.0f}s then retrying..."
                        )
                        await asyncio.sleep(wait_secs)
                        continue  # retry
                # Non-retryable error or retry exhausted
                console.print(f"  ⚠️  Beta delegation failed: {e}")
                self._stats["fallbacks"] += 1
                break

        # Fallback cascade: CEO → Alpha → error
        try:
            result = await self._call_ceo(messages, temp, max_tok)
            return result, "ceo(beta_failed)"
        except Exception:
            try:
                result = await self._call_alpha_chat(messages, temp, max_tok)
                return result, "alpha(beta_failed)"
            except Exception:
                return "All engines unavailable.", "error"

    @staticmethod
    def _parse_retry_after(err_msg: str) -> float:
        """Extract wait seconds from Groq 429 error message.
        Looks for patterns like '2m13.055999999s' or '45.5s'.
        """
        import re
        # Match time patterns: 2m13.05s, 45.5s, 120s, etc.
        m = re.search(r'(\d+)m([\d.]+)s', err_msg)
        if m:
            return int(m.group(1)) * 60 + float(m.group(2))
        m = re.search(r'in\s+([\d.]+)s', err_msg)
        if m:
            return float(m.group(1))
        return 0.0

    # ── Raw Engine Calls ─────────────────────────────────────────

    async def _call_ceo(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> str:
        """Call the CEO (local DeepSeek R1 8B via Ollama)."""
        t0 = time.perf_counter()
        try:
            result = await self.ceo.chat(messages, temp, max_tok)
            elapsed = (time.perf_counter() - t0) * 1000
            self._stats["ceo_calls"] += 1
            self._update_avg("ceo_avg_ms", elapsed, self._stats["ceo_calls"])
            self._ceo_healthy = True
            return result
        except Exception as e:
            self._ceo_healthy = False
            raise

    async def _call_alpha_chat(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> str:
        """Call Alpha engine directly for chat."""
        t0 = time.perf_counter()
        try:
            result = await self.alpha.chat(messages, temp, max_tok)
            elapsed = (time.perf_counter() - t0) * 1000
            self._alpha_healthy = True
            return result
        except Exception as e:
            self._alpha_healthy = False
            raise

    async def _call_beta_chat(
        self, messages: list[dict[str, str]], temp: float, max_tok: int
    ) -> str:
        """Call Beta engine directly for chat."""
        t0 = time.perf_counter()
        try:
            result = await self.beta.chat(messages, temp, max_tok)
            elapsed = (time.perf_counter() - t0) * 1000
            self._beta_healthy = True
            return result
        except Exception as e:
            self._beta_healthy = False
            raise

    # ── Routing (for SkillRouter — prefers Alpha for speed) ──────

    async def route(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 512,
    ) -> str:
        """
        Routing uses the fastest available engine.
        Priority: Alpha (8B instant) → Beta → CEO (slow local).
        """
        # Alpha is ideal for routing — fast and cheap
        if self._alpha_healthy:
            try:
                return await self.alpha.chat(
                    messages, temperature, max_tokens, json_mode=True,
                )
            except Exception:
                pass

        # Beta fallback for routing
        if self._beta_healthy:
            try:
                return await self.beta.chat(
                    messages, temperature, max_tokens, json_mode=True,
                )
            except Exception:
                pass

        # CEO (local) as last resort for routing — slow but works offline
        try:
            return await self.ceo.chat(messages, temperature, max_tokens)
        except Exception:
            return '{"skill": "none", "method": "chat", "params": {}, "reasoning": "All engines unavailable"}'

    # ── Streaming (prefers Beta for quality) ─────────────────────

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
        prefer_cloud: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens — prefers Beta for quality, Alpha for speed."""
        if prefer_cloud:
            # Try Beta first (higher quality streaming)
            if self._beta_healthy:
                try:
                    async for token in self.beta.chat_stream(messages, temperature, max_tokens):
                        yield token
                    return
                except Exception:
                    pass

            # Alpha fallback for streaming
            if self._alpha_healthy:
                try:
                    async for token in self.alpha.chat_stream(messages, temperature, max_tokens):
                        yield token
                    return
                except Exception:
                    pass

        # Local CEO streaming
        if self._ceo_healthy:
            async for token in self.ceo.chat_stream(messages, temperature, max_tokens):
                yield token
        else:
            yield "All three engines are unavailable."

    # ── Specialised Delegations (for skills/tools to call) ───────

    async def scan_channel(self, raw_text: str) -> str:
        """Delegate channel scanning to Alpha."""
        if self._alpha_healthy:
            return await self.alpha.scan_channel_events(raw_text)
        # Fallback to Beta
        if self._beta_healthy:
            return await self.beta.chat(
                [{"role": "user", "content": f"Parse these channel events into JSON:\n{raw_text}"}],
                json_mode=True,
            )
        return '{"error": "No engine available for channel scanning"}'

    async def deep_analysis(self, question: str, context: str = "") -> str:
        """Delegate deep reasoning to Beta."""
        if self._beta_healthy:
            return await self.beta.deep_reason(question, context)
        # Fallback to CEO
        if self._ceo_healthy:
            msgs = [
                {"role": "system", "content": "Think deeply about this question."},
                {"role": "user", "content": f"{context}\n\n{question}" if context else question},
            ]
            return await self.ceo.chat(msgs)
        return "No engine available for deep analysis."

    async def generate_plan(self, goal: str, constraints: str = "") -> str:
        """Delegate execution planning to Beta."""
        if self._beta_healthy:
            return await self.beta.plan_execution(goal, constraints)
        return '{"error": "Beta engine unavailable for planning"}'

    # ── Helpers ──────────────────────────────────────────────────

    def _update_avg(self, key: str, new_val: float, count: int) -> None:
        if count <= 0:
            return
        old = self._stats[key]
        self._stats[key] = old + (new_val - old) / count

    async def close(self):
        await asyncio.gather(
            self.ceo.close(),
            self.alpha.close(),
            self.beta.close(),
        )
