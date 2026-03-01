"""
Contract Engine Beta — Advanced Reasoning & Multi-Step Execution.

Model: llama-3.3-70b-versatile (via Groq)
Key:   GROQ_NANOBOT_KEY (Beta key)

Purpose:
  - High-power 70B model for advanced multi-step logical drafting
  - System-level execution planning
  - Complex code generation and analysis
  - Deep reasoning that the local 8B can't handle alone

The CEO (DeepSeek R1 8B local) delegates heavy-duty reasoning to Beta
when tasks require multi-step planning, code generation, or advanced
logical analysis that exceeds the 8B model's capabilities.
"""

from __future__ import annotations

import os
import re
import time
from typing import Any, AsyncGenerator

from dotenv import load_dotenv
from groq import AsyncGroq

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env.local"))
load_dotenv()

GROQ_BETA_KEY = os.getenv("GROQ_NANOBOT_KEY", "").strip('"')
GROQ_BETA_MODEL = os.getenv("GROQ_BETA_MODEL", "llama-3.3-70b-versatile")


class GroqBeta:
    """
    Contract Engine Beta — the heavy artillery.

    Specialises in:
      1. invoke_custom_nanobot — advanced multi-step task execution
      2. plan_execution — break complex tasks into executable steps
      3. generate_code — write and analyze code
      4. deep_reason — handle complex logical chains the 8B can't
    """

    def __init__(
        self,
        api_key: str = GROQ_BETA_KEY,
        model: str = GROQ_BETA_MODEL,
    ):
        self.model = model
        self.api_key = api_key
        self._client = AsyncGroq(api_key=api_key) if api_key else None
        self._connected = False
        self._last_error: str | None = None
        self._stats = {
            "calls": 0,
            "avg_ms": 0.0,
            "plan_calls": 0,
            "code_calls": 0,
            "reason_calls": 0,
        }

    async def check_health(self) -> bool:
        """Verify Beta engine is reachable."""
        if not self._client:
            self._connected = False
            self._last_error = "No API key configured (GROQ_NANOBOT_KEY)"
            return False
        try:
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
                temperature=0,
            )
            self._connected = True
            self._last_error = None
            return True
        except Exception as e:
            self._connected = False
            self._last_error = str(e)
            return False

    @property
    def is_connected(self) -> bool:
        return self._connected

    def get_stats(self) -> dict[str, Any]:
        return {**self._stats, "online": self._connected, "model": self.model}

    # ── Core Chat ────────────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.4,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> str:
        """Raw chat completion on Beta engine."""
        if not self._client:
            raise RuntimeError("Beta engine not configured (missing GROQ_NANOBOT_KEY)")

        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        t0 = time.perf_counter()
        try:
            resp = await self._client.chat.completions.create(**kwargs)
            elapsed = (time.perf_counter() - t0) * 1000
            self._stats["calls"] += 1
            old_avg = self._stats["avg_ms"]
            self._stats["avg_ms"] = old_avg + (elapsed - old_avg) / self._stats["calls"]
            content = resp.choices[0].message.content or ""
            self._connected = True
            return content
        except Exception as e:
            self._connected = False
            self._last_error = str(e)
            raise

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.4,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens for real-time feedback from the heavy model."""
        if not self._client:
            raise RuntimeError("Beta engine not configured (missing GROQ_NANOBOT_KEY)")
        try:
            stream = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
            self._connected = True
        except Exception as e:
            self._connected = False
            self._last_error = str(e)
            raise

    # ── Specialised Tools (CEO delegates to these) ───────────────

    async def invoke_custom_nanobot(self, task: str, context: str = "") -> str:
        """
        Advanced multi-step task execution.
        The CEO calls this when it needs the 70B model's full power
        for system-level executions, complex drafting, or multi-step logic.
        """
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an advanced AI execution engine (70B parameters). "
                    "The local CEO AI has delegated a complex task to you because it "
                    "requires advanced reasoning beyond an 8B model's capability.\n\n"
                    "Execute the task thoroughly:\n"
                    "- Break it into logical steps\n"
                    "- Show your reasoning\n"
                    "- Provide concrete, actionable output\n"
                    "- If the task involves code, write complete, runnable code\n"
                    "- If the task involves planning, provide a detailed plan with milestones\n\n"
                    "Be comprehensive but concise. The CEO will use your output directly."
                ),
            },
        ]
        if context:
            messages.append({"role": "user", "content": f"Context:\n{context}"})
        messages.append({"role": "user", "content": f"Task:\n{task}"})

        return await self.chat(messages, temperature=0.3, max_tokens=4096)

    async def plan_execution(self, goal: str, constraints: str = "") -> str:
        """
        Break a complex goal into an executable step-by-step plan.
        CEO uses this when it needs to orchestrate multi-skill workflows.
        """
        self._stats["plan_calls"] += 1
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a strategic planning AI. Create a detailed execution plan.\n\n"
                    "Output ONLY a JSON object:\n"
                    '{"goal": "...", "steps": [{"step": 1, "action": "...", '
                    '"skill": "skill_name or null", "method": "method_name or null", '
                    '"params": {}, "depends_on": [], "estimated_ms": 0}], '
                    '"total_estimated_ms": 0, "risk_factors": []}'
                ),
            },
            {
                "role": "user",
                "content": f"Goal: {goal}" + (f"\nConstraints: {constraints}" if constraints else ""),
            },
        ]
        return await self.chat(messages, temperature=0.2, max_tokens=4096, json_mode=True)

    async def generate_code(self, spec: str, language: str = "python") -> str:
        """
        Generate production-quality code based on a specification.
        CEO delegates code-heavy tasks here.
        """
        self._stats["code_calls"] += 1
        messages = [
            {
                "role": "system",
                "content": (
                    f"You are an expert {language} developer. Write production-quality code.\n"
                    "Rules:\n"
                    "- Include type hints and docstrings\n"
                    "- Handle edge cases and errors\n"
                    "- Follow best practices and idioms\n"
                    "- Output the code in a markdown code block\n"
                    "- Add brief comments for complex logic"
                ),
            },
            {"role": "user", "content": spec},
        ]
        return await self.chat(messages, temperature=0.2, max_tokens=4096)

    async def deep_reason(self, question: str, context: str = "") -> str:
        """
        Handle complex logical reasoning chains.
        CEO calls this when 8B local model can't handle the reasoning depth.
        """
        self._stats["reason_calls"] += 1
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a deep reasoning AI. Think through the problem step-by-step.\n"
                    "- Consider all angles and edge cases\n"
                    "- Provide clear logical chains\n"
                    "- Cite your reasoning at each step\n"
                    "- Reach a definitive conclusion\n"
                    "- Be thorough but avoid unnecessary verbosity"
                ),
            },
        ]
        if context:
            messages.append({"role": "user", "content": f"Background context:\n{context}"})
        messages.append({"role": "user", "content": question})

        return await self.chat(messages, temperature=0.3, max_tokens=4096)

    async def close(self):
        if self._client:
            await self._client.close()
