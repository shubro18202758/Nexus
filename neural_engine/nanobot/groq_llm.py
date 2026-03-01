"""
Groq Cloud LLM Connector — blazing-fast inference for routing & aid.

Uses the Groq SDK (llama-3.3-70b-versatile) to:
1. Power the skill router (fast, accurate intent classification)
2. Aid the local 8B model on complex tasks (refinement, validation)
3. Serve as fallback when Ollama is overloaded or fails

This does NOT replace the local model — it augments it.
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

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


class GroqLLM:
    """Async Groq cloud connector — fast inference for routing & complex tasks."""

    def __init__(
        self,
        api_key: str = GROQ_API_KEY,
        model: str = GROQ_MODEL,
    ):
        self.model = model
        self.api_key = api_key
        self._client = AsyncGroq(api_key=api_key)
        self._connected = False
        self._last_error: str | None = None

    async def check_health(self) -> bool:
        """Verify Groq API is reachable and key is valid."""
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

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
        json_mode: bool = False,
    ) -> str:
        """
        Send a chat completion request to Groq.
        json_mode=True forces JSON output (for routing).
        """
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
        temperature: float = 0.6,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens for real-time UI feedback."""
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

    @staticmethod
    def extract_json(text: str) -> dict | list | None:
        """Extract JSON from LLM output."""
        import orjson

        # Try direct parse first (Groq with json_mode is clean)
        try:
            return orjson.loads(text)
        except Exception:
            pass

        # Try to find JSON in code blocks
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if json_match:
            text = json_match.group(1)

        # Strip preamble before first { or [
        brace = text.find("{")
        bracket = text.find("[")
        if brace == -1 and bracket == -1:
            return None

        start = min(
            brace if brace != -1 else float("inf"),
            bracket if bracket != -1 else float("inf"),
        )
        text = text[int(start):]

        try:
            return orjson.loads(text)
        except Exception:
            return None

    async def close(self):
        await self._client.close()
