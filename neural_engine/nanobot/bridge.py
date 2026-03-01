"""
Nanobot Bridge — syncs official nanobot-ai framework with our custom engine.

The bridge:
1. Can invoke official nanobot-ai CLI for channel gateway (WhatsApp, Telegram, etc.)
2. Forwards channel messages → custom engine API for processing
3. Syncs memory/context between official nanobot and custom engine
4. Exposes bridge status + control endpoints

Official nanobot-ai handles:        Custom engine handles:
  - Channel gateway (WhatsApp, etc.)    - Skill routing (Groq-powered)
  - CLI interface                        - Skill execution (7 skills)
  - File operations, shell commands      - Memory management
  - GitHub/web tools                     - DualLLM orchestration
                                         - WebSocket real-time updates
                                         - Dashboard API
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from rich.console import Console

console = Console()

# Official nanobot config path
NANOBOT_CONFIG = Path.home() / ".nanobot" / "config.json"
NANOBOT_MEMORY = Path.home() / ".nanobot" / "memory"

# Resolve the nanobot CLI path — lives in venv Scripts
_ENGINE_ROOT = Path(__file__).parent.parent  # neural_engine/
_NANOBOT_EXE = _ENGINE_ROOT / ".venv" / "Scripts" / "nanobot.exe"
if not _NANOBOT_EXE.exists():
    # Linux/macOS fallback
    _NANOBOT_EXE = _ENGINE_ROOT / ".venv" / "bin" / "nanobot"


class NanobotBridge:
    """
    Bridge between official nanobot-ai and the custom NEXUS engine.
    
    The official nanobot runs as a separate process (CLI tool).
    This bridge coordinates between the two systems.
    """

    def __init__(self):
        self._official_available = False
        self._gateway_process: subprocess.Popen | None = None
        self._config: dict[str, Any] = {}
        self._official_model: str = ""
        self._sync_interval = 30  # seconds between memory syncs
        self._sync_task: asyncio.Task | None = None

    async def startup(self) -> bool:
        """Check if official nanobot-ai is available and configured."""
        console.print("  [dim]Checking official nanobot-ai...[/]")

        # 1. Check if nanobot CLI is available (use full path from venv)
        nanobot_cmd = str(_NANOBOT_EXE)
        if _NANOBOT_EXE.exists():
            self._official_available = True
            console.print(f"  ✅ Official nanobot-ai: [green]CLI found[/] at {_NANOBOT_EXE.name}")
        else:
            console.print(f"  ⚠️  Official nanobot-ai: [yellow]exe not found at {nanobot_cmd}[/]")

        # 2. Load official config
        if NANOBOT_CONFIG.exists():
            try:
                self._config = json.loads(NANOBOT_CONFIG.read_text())
                model = (
                    self._config.get("agents", {})
                    .get("defaults", {})
                    .get("model", "unknown")
                )
                self._official_model = model
                console.print(f"  ✅ Official model: [green]{model}[/]")
            except Exception as e:
                console.print(f"  ⚠️  Config parse error: {e}")

        return self._official_available

    @property
    def is_available(self) -> bool:
        return self._official_available

    @property
    def official_model(self) -> str:
        return self._official_model

    # ── Official Nanobot Invocation ──────────────────────────────

    async def ask_official(self, message: str) -> str | None:
        """
        Send a message to the official nanobot-ai and get a response.
        Uses the CLI: `nanobot agent -m "message"`
        """
        if not self._official_available:
            return None

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.run(
                    [str(_NANOBOT_EXE), "agent", "-m", message],
                    capture_output=True,
                    text=True,
                    timeout=60,
                    cwd=str(Path.home() / ".nanobot"),
                ),
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
            return None
        except (subprocess.TimeoutExpired, Exception) as e:
            console.print(f"  ⚠️  Official nanobot error: {e}")
            return None

    # ── Gateway Management ───────────────────────────────────────

    async def start_gateway(self) -> bool:
        """
        Start the official nanobot gateway for channel handling.
        This enables WhatsApp, Telegram, Discord, etc.
        """
        if not self._official_available:
            console.print("  ⚠️  Cannot start gateway: official nanobot not available")
            return False

        if self._gateway_process and self._gateway_process.poll() is None:
            console.print("  ⚠️  Gateway already running")
            return True

        try:
            self._gateway_process = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.Popen(
                    [str(_NANOBOT_EXE), "gateway"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    cwd=str(Path.home() / ".nanobot"),
                ),
            )
            console.print("  ✅ Official gateway started")
            return True
        except Exception as e:
            console.print(f"  ❌ Gateway start failed: {e}")
            return False

    async def stop_gateway(self) -> None:
        """Stop the official nanobot gateway."""
        if self._gateway_process:
            self._gateway_process.terminate()
            try:
                self._gateway_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._gateway_process.kill()
            self._gateway_process = None
            console.print("  🛑 Gateway stopped")

    @property
    def is_gateway_running(self) -> bool:
        return (
            self._gateway_process is not None
            and self._gateway_process.poll() is None
        )

    # ── Memory Sync ──────────────────────────────────────────────

    async def sync_memory_to_official(
        self, session_id: str, messages: list[dict[str, str]]
    ) -> None:
        """
        Sync conversation history from our engine to official nanobot's memory.
        Official nanobot stores memory in ~/.nanobot/memory/HISTORY.md
        """
        if not NANOBOT_MEMORY.exists():
            return

        history_file = NANOBOT_MEMORY / "HISTORY.md"
        try:
            # Append our conversation to official memory
            lines = [f"\n## Session: {session_id} (synced from NEXUS engine)\n"]
            for msg in messages[-10:]:  # Last 10 messages
                role = msg.get("role", "unknown")
                content = msg.get("content", "")[:200]  # Truncate
                lines.append(f"- **{role}**: {content}\n")
            lines.append("\n---\n")

            with open(history_file, "a", encoding="utf-8") as f:
                f.writelines(lines)
        except Exception as e:
            console.print(f"  ⚠️  Memory sync error: {e}")

    async def read_official_memory(self) -> str:
        """Read the official nanobot's memory file."""
        memory_file = NANOBOT_MEMORY / "MEMORY.md"
        if memory_file.exists():
            return memory_file.read_text(encoding="utf-8")
        return ""

    # ── Status ───────────────────────────────────────────────────

    def get_status(self) -> dict[str, Any]:
        return {
            "official_available": self._official_available,
            "official_model": self._official_model,
            "gateway_running": self.is_gateway_running,
            "config_path": str(NANOBOT_CONFIG),
            "memory_path": str(NANOBOT_MEMORY),
        }

    async def shutdown(self) -> None:
        """Clean up bridge resources."""
        await self.stop_gateway()
        if self._sync_task and not self._sync_task.done():
            self._sync_task.cancel()
