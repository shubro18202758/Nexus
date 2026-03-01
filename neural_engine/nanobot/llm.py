"""
Ollama LLM Connector — raw DeepSeek R1 inference.
No guardrails, no system prompt filtering. Pure reasoning.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from typing import Any, AsyncGenerator

import httpx
from dotenv import load_dotenv

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "deepseek-r1:8b")


class LLM:
    """Async Ollama connector for local inference."""

    def __init__(
        self,
        base_url: str = OLLAMA_URL,
        model: str = OLLAMA_MODEL,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._client = httpx.AsyncClient(timeout=300.0)  # 5min for complex local inference
        self._connected = False

    async def check_health(self) -> bool:
        """Verify Ollama is running and model is available."""
        try:
            resp = await self._client.get(f"{self.base_url}/api/tags")
            if resp.status_code == 200:
                models = [m["name"] for m in resp.json().get("models", [])]
                self._connected = self.model in models or any(
                    self.model.split(":")[0] in m for m in models
                )
                return self._connected
        except Exception:
            pass
        self._connected = False
        return False

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
        raw: bool = True,
    ) -> str:
        """
        Send a chat completion request.
        raw=True means no safety wrapping — DeepSeek reasons freely.
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": 32768,
            },
        }

        if raw:
            # Disable any template guardrails
            payload["options"]["repeat_penalty"] = 1.0

        t0 = time.perf_counter()
        resp = await self._client.post(
            f"{self.base_url}/api/chat",
            json=payload,
        )
        resp.raise_for_status()
        result = resp.json()
        elapsed = (time.perf_counter() - t0) * 1000

        content = result.get("message", {}).get("content", "")
        return content

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.6,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Stream tokens one by one for real-time UI feedback."""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": 32768,
            },
        }

        async with self._client.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                import orjson
                chunk = orjson.loads(line)
                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield token
                if chunk.get("done", False):
                    break

    @staticmethod
    def extract_thinking(text: str) -> tuple[str, str]:
        """
        Separate DeepSeek R1's <think>...</think> reasoning from the answer.
        Returns (reasoning, answer).
        """
        think_match = re.search(r"<think>(.*?)</think>", text, re.DOTALL)
        reasoning = think_match.group(1).strip() if think_match else ""
        answer = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        return reasoning, answer

    @staticmethod
    def extract_json(text: str) -> dict | list | None:
        """Extract JSON from LLM output (handles markdown fences, preamble)."""
        # Try to find JSON in code blocks
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if json_match:
            text = json_match.group(1)

        # Strip any preamble before first { or [
        brace = text.find("{")
        bracket = text.find("[")
        if brace == -1 and bracket == -1:
            return None

        start = min(
            brace if brace != -1 else float("inf"),
            bracket if bracket != -1 else float("inf"),
        )
        text = text[int(start):]

        import orjson
        try:
            return orjson.loads(text)
        except Exception:
            return None

    async def close(self):
        await self._client.aclose()
