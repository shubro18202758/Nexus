"""
Contract Engine Alpha — Fast Ingestion & Classification.

Model: llama-3.1-8b-instant (via Groq)
Key:   GROQ_API_KEY (Alpha key)

Purpose:
  - Ultra-fast text classification (~200ms)
  - Channel event scanning & parsing
  - Lightweight NLP tasks (sentiment, entity extraction)
  - Keeps the CEO's VRAM free for reasoning

The CEO (DeepSeek R1 8B local) delegates bulk ingestion to Alpha
when parsing massive text chunks, classifying events, or doing
lightweight NLP that doesn't need deep reasoning.
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

GROQ_ALPHA_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_ALPHA_MODEL = os.getenv("GROQ_ALPHA_MODEL", "llama-3.1-8b-instant")


class GroqAlpha:
    """
    Contract Engine Alpha — fast, cheap, disposable inference.

    Specialises in:
      1. scan_channel_events — parse raw channel dumps into structured events
      2. classify_text — fast sentiment/intent/priority classification
      3. extract_entities — pull names, dates, amounts from text
      4. summarise_chunk — condense long text for the CEO to reason over
    """

    def __init__(
        self,
        api_key: str = GROQ_ALPHA_KEY,
        model: str = GROQ_ALPHA_MODEL,
    ):
        self.model = model
        self.api_key = api_key
        self._client = AsyncGroq(api_key=api_key) if api_key else None
        self._connected = False
        self._last_error: str | None = None
        self._stats = {
            "calls": 0,
            "avg_ms": 0.0,
            "scan_calls": 0,
            "classify_calls": 0,
        }

    async def check_health(self) -> bool:
        """Verify Alpha engine is reachable."""
        if not self._client:
            self._connected = False
            self._last_error = "No API key configured (GROQ_API_KEY)"
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
        temperature: float = 0.2,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> str:
        """Raw chat completion on Alpha engine."""
        if not self._client:
            raise RuntimeError("Alpha engine not configured (missing GROQ_API_KEY)")

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

    # ── Specialised Tools (CEO delegates to these) ───────────────

    async def scan_channel_events(self, raw_text: str, channel: str = "unknown") -> str:
        """
        Parse a massive raw text dump from a channel into structured events.
        The CEO calls this to offload text parsing from local VRAM.

        Returns JSON array of structured events.
        """
        self._stats["scan_calls"] += 1
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a precise text parser. Given raw text from a communication channel, "
                    "extract all discrete events/messages into structured JSON.\n\n"
                    "Output ONLY a JSON object with this schema:\n"
                    '{"events": [{"timestamp": "...", "sender": "...", "type": "message|notification|alert|reminder", '
                    '"content": "...", "priority": "low|medium|high|urgent", '
                    '"entities": {"people": [], "dates": [], "amounts": [], "locations": []}}]}\n\n'
                    "Rules:\n"
                    "- Extract ALL events, don't skip any\n"
                    "- Classify priority based on urgency cues (deadlines, !!, URGENT, etc.)\n"
                    "- Extract entities (people names, dates, money amounts, places)\n"
                    "- If no timestamp is visible, use null\n"
                    "- Be thorough but fast"
                ),
            },
            {
                "role": "user",
                "content": f"Channel: {channel}\n\nRaw text:\n{raw_text}",
            },
        ]
        return await self.chat(messages, temperature=0.1, max_tokens=4096, json_mode=True)

    async def classify_text(self, text: str, categories: list[str] | None = None) -> str:
        """
        Fast classification of text into categories.
        CEO uses this for quick triage without burning local compute.
        """
        self._stats["classify_calls"] += 1
        cats = categories or ["urgent", "important", "routine", "spam", "personal", "academic", "social"]
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a fast text classifier. Classify the given text.\n"
                    f"Categories: {', '.join(cats)}\n\n"
                    "Output ONLY a JSON object:\n"
                    '{"category": "...", "confidence": 0.0-1.0, "reasoning": "one sentence"}'
                ),
            },
            {"role": "user", "content": text},
        ]
        return await self.chat(messages, temperature=0.1, max_tokens=256, json_mode=True)

    async def extract_entities(self, text: str) -> str:
        """Extract named entities from text. Fast and cheap."""
        messages = [
            {
                "role": "system",
                "content": (
                    "Extract all named entities from the text.\n"
                    "Output ONLY JSON:\n"
                    '{"people": [], "organizations": [], "dates": [], "locations": [], '
                    '"amounts": [], "emails": [], "phones": [], "urls": []}'
                ),
            },
            {"role": "user", "content": text},
        ]
        return await self.chat(messages, temperature=0.0, max_tokens=1024, json_mode=True)

    async def summarise_chunk(self, text: str, max_words: int = 100) -> str:
        """
        Condense a long text for the CEO to reason over.
        Keeps the CEO's context window clean.
        """
        messages = [
            {
                "role": "system",
                "content": (
                    f"Summarise the following text in {max_words} words or fewer. "
                    "Be factual, preserve key details (names, dates, numbers). "
                    "Output plain text only."
                ),
            },
            {"role": "user", "content": text},
        ]
        return await self.chat(messages, temperature=0.2, max_tokens=512)

    async def close(self):
        if self._client:
            await self._client.close()
