"""
Base Skill — abstract class all Nanobot skills inherit from.
Drop a new .py file into skills/ that subclasses BaseSkill,
and the Nanobot auto-discovers it on startup.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from nanobot.types import SkillManifest, SkillMethod, SkillStatus, ToolResult


class BaseSkill(ABC):
    """
    Every skill must implement:
    1. manifest() — declare what methods it exposes
    2. execute(method, params) — run a specific method
    3. startup() / shutdown() — lifecycle hooks
    """

    def __init__(self):
        self._status: SkillStatus = SkillStatus.READY

    @property
    def status(self) -> SkillStatus:
        return self._status

    @abstractmethod
    def manifest(self) -> SkillManifest:
        """Return a description of this skill's capabilities."""
        ...

    @abstractmethod
    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        """Execute a specific method with given parameters."""
        ...

    async def startup(self) -> None:
        """Called when the Nanobot initializes. Override to set up resources."""
        pass

    async def shutdown(self) -> None:
        """Called when the Nanobot shuts down. Override to clean up."""
        pass

    @property
    def name(self) -> str:
        return self.manifest().name

    def _ok(self, data: Any = None) -> ToolResult:
        """Helper — return success result."""
        return ToolResult(success=True, data=data)

    def _err(self, error: str) -> ToolResult:
        """Helper — return error result."""
        return ToolResult(success=False, error=error)
