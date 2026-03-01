"""
Skill Router — maps user intent to the right skill + method.

Uses the LOCAL AI model (DeepSeek R1 8B via Ollama) for intent classification.
100% local — no cloud API keys consumed for routing.
"""

from __future__ import annotations

import json
import time
from typing import Any

from rich.console import Console

from .llm import LLM
from .types import SkillManifest, ToolCall

console = Console()

ROUTER_PROMPT = """You are a tool-routing AI. Given the user's request and available tools, decide which tool to invoke.

## Available Tools
{tools_json}

## Rules
1. Pick the BEST tool + method for the request. If no tool fits, set skill to "none".
2. Extract parameters from the user message.
3. Respond with ONLY a JSON object — no markdown, no explanation.

## Output Format
{{
  "skill": "<skill_name>",
  "method": "<method_name>",
  "params": {{ ... }},
  "reasoning": "<one sentence explaining your choice>"
}}

If the request is a normal conversation (no tool needed):
{{
  "skill": "none",
  "method": "chat",
  "params": {{}},
  "reasoning": "This is a conversational request."
}}"""


class SkillRouter:
    """
    100% local router — uses DeepSeek R1 8B (Ollama) for skill classification.
    
    The router uses the LOCAL AI model to classify user intent and route
    to the appropriate skill. No cloud API keys are consumed for routing.
    """

    def __init__(
        self,
        local_llm: LLM | None = None,
        manifests: list[SkillManifest] | None = None,
    ):
        self.local_llm = local_llm
        self.manifests = manifests or []
        self._tools_json = self._build_tools_description()
        self._route_count = 0
        self._local_routes = 0
        self._avg_route_ms = 0.0

    def _build_tools_description(self) -> str:
        tools = []
        for m in self.manifests:
            tool = {
                "skill": m.name,
                "description": m.description,
                "category": m.category,
                "methods": [
                    {
                        "name": method.name,
                        "description": method.description,
                        "parameters": {
                            k: {"type": v.type, "description": v.description, "required": v.required}
                            for k, v in method.parameters.items()
                        },
                        "example": method.example,
                    }
                    for method in m.methods
                ],
            }
            tools.append(tool)
        return json.dumps(tools, indent=2)

    def update_manifests(self, manifests: list[SkillManifest]) -> None:
        self.manifests = manifests
        self._tools_json = self._build_tools_description()

    def get_stats(self) -> dict[str, Any]:
        return {
            "total_routes": self._route_count,
            "local_routes": self._local_routes,
            "avg_route_ms": round(self._avg_route_ms, 1),
        }

    async def route(self, user_message: str, context: str = "") -> ToolCall:
        """
        Determine which skill to invoke for the given message.
        
        Strategy: Groq first (fast + JSON mode), local fallback.
        """
        t0 = time.perf_counter()
        system = ROUTER_PROMPT.format(tools_json=self._tools_json)

        prompt = user_message
        if context:
            prompt = f"Context: {context}\n\nUser request: {user_message}"

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]

        response = None
        engine = "none"

        # Use local LLM (DeepSeek R1 8B via Ollama) — 100% local routing
        if self.local_llm:
            try:
                response = await self.local_llm.chat(
                    messages=messages,
                    temperature=0.1,
                    max_tokens=512,
                )
                engine = "local"
                self._local_routes += 1
            except Exception as e:
                console.print(f"  ❌ Local routing failed: {e}")

        # Update stats
        elapsed = (time.perf_counter() - t0) * 1000
        self._route_count += 1
        self._avg_route_ms += (elapsed - self._avg_route_ms) / self._route_count
        console.print(f"  🎯 Routed via [cyan]{engine}[/] in [green]{elapsed:.0f}ms[/]")

        # Parse the response
        if response:
            # DeepSeek R1 wraps output in <think>...</think> — strip before
            # JSON extraction so stray "{" inside reasoning is ignored.
            if self.local_llm:
                _, cleaned = self.local_llm.extract_thinking(response)
                parsed = self.local_llm.extract_json(cleaned)
            else:
                parsed = None

            if parsed and isinstance(parsed, dict):
                console.print(
                    f"  🎯 Router selected: {parsed.get('skill')}.{parsed.get('method')}"
                )
                return ToolCall(
                    skill=parsed.get("skill", "none"),
                    method=parsed.get("method", "chat"),
                    params=parsed.get("params", {}),
                    reasoning=parsed.get("reasoning", ""),
                )
            else:
                console.print(f"  ⚠️  Router response unparseable — raw: {response[:200]}")

        # Fallback — treat as conversation
        return ToolCall(
            skill="none",
            method="chat",
            params={},
            reasoning="Could not parse tool routing response.",
        )
