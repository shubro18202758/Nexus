"""
Conversation memory for the Nanobot.
Maintains per-session history with sliding window.
Persists to disk so conversations survive server restarts.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from .types import Message

MEMORY_DIR = Path(__file__).parent.parent / "memory_store"


class Memory:
    """Persistent conversation store with automatic trimming."""

    def __init__(self, max_turns: int = 50):
        self.max_turns = max_turns
        self._sessions: dict[str, list[Message]] = defaultdict(list)
        self._context: dict[str, dict[str, Any]] = defaultdict(dict)
        self._dirty: set[str] = set()  # Sessions that need saving

        # Ensure memory directory exists and load existing sessions
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        self._load_all()

    def _load_all(self) -> None:
        """Load all persisted sessions from disk."""
        sessions_file = MEMORY_DIR / "sessions.json"
        if not sessions_file.exists():
            return

        try:
            with open(sessions_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            for session_id, messages in data.get("sessions", {}).items():
                self._sessions[session_id] = [
                    Message(role=m["role"], content=m["content"], metadata=m.get("metadata", {}))
                    for m in messages
                ]
            for session_id, ctx in data.get("contexts", {}).items():
                self._context[session_id] = ctx
        except Exception:
            pass  # Corrupted file — start fresh

    def _save(self, session_id: str) -> None:
        """Persist a session to disk."""
        try:
            # Load existing data
            sessions_file = MEMORY_DIR / "sessions.json"
            data: dict[str, Any] = {"sessions": {}, "contexts": {}}
            if sessions_file.exists():
                with open(sessions_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

            # Update this session
            if session_id in self._sessions:
                data["sessions"][session_id] = [
                    {"role": m.role, "content": m.content, "metadata": m.metadata or {}}
                    for m in self._sessions[session_id]
                ]
            else:
                data["sessions"].pop(session_id, None)

            if session_id in self._context:
                data["contexts"][session_id] = self._context[session_id]
            else:
                data["contexts"].pop(session_id, None)

            with open(sessions_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, default=str)
        except Exception:
            pass  # Non-critical — don't crash the engine for persistence failure

    def add(self, session_id: str, role: str, content: str, **metadata: Any) -> None:
        msgs = self._sessions[session_id]
        msgs.append(
            Message(role=role, content=content, metadata=metadata)
        )
        # Trim oldest if over limit (keep system messages)
        if len(msgs) > self.max_turns * 2:
            system = [m for m in msgs if m.role == "system"]
            rest = [m for m in msgs if m.role != "system"]
            self._sessions[session_id] = system + rest[-(self.max_turns * 2):]

        # Persist every 3 messages to avoid excessive I/O
        self._dirty.add(session_id)
        if len(self._dirty) >= 1:
            for sid in list(self._dirty):
                self._save(sid)
            self._dirty.clear()

    def get_history(self, session_id: str) -> list[dict[str, str]]:
        """Return messages in Ollama-compatible format."""
        return [
            {"role": m.role, "content": m.content}
            for m in self._sessions[session_id]
        ]

    def get_context(self, session_id: str) -> dict[str, Any]:
        return self._context[session_id]

    def set_context(self, session_id: str, key: str, value: Any) -> None:
        self._context[session_id][key] = value
        self._save(session_id)

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self._context.pop(session_id, None)
        self._save(session_id)

    def list_sessions(self) -> list[str]:
        return list(self._sessions.keys())
