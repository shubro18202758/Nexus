"""
Shared types for the Nanobot engine.
All Pydantic models used across the system.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Agent States ──────────────────────────────────────────────────
class AgentState(str, Enum):
    IDLE = "idle"
    THINKING = "thinking"
    TOOL_CALLING = "tool_calling"
    EXECUTING = "executing"
    RESPONDING = "responding"
    ERROR = "error"


class SkillStatus(str, Enum):
    READY = "ready"
    BUSY = "busy"
    ERROR = "error"
    DISABLED = "disabled"


# ── Messages ──────────────────────────────────────────────────────
class Message(BaseModel):
    role: str  # "user" | "assistant" | "system" | "tool"
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolCall(BaseModel):
    skill: str  # which skill to invoke
    method: str  # which method on the skill
    params: dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""  # LLM's reasoning for choosing this tool


class ToolResult(BaseModel):
    success: bool
    data: Any = None
    error: str | None = None
    duration_ms: float = 0


# ── Skill Definition ─────────────────────────────────────────────
class SkillManifest(BaseModel):
    """Describes a skill's capabilities for the LLM router."""
    name: str
    description: str
    methods: list[SkillMethod]
    requires_browser: bool = False
    category: str = "general"  # "communication", "productivity", "automation", "knowledge"


class SkillMethod(BaseModel):
    name: str
    description: str
    parameters: dict[str, ParameterSpec] = Field(default_factory=dict)
    returns: str = "string"
    example: str = ""


class ParameterSpec(BaseModel):
    type: str  # "string" | "number" | "boolean" | "array" | "object"
    description: str
    required: bool = True
    default: Any = None


# ── WebSocket Events ─────────────────────────────────────────────
class WSEvent(BaseModel):
    """Events pushed to the frontend via WebSocket."""

    type: str  # "state_change" | "thought" | "tool_start" | "tool_result" | "message" | "error"
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


# ── API Models ────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    conversation_id: str = "default"
    context: dict[str, Any] = Field(default_factory=dict)
    strategy: str | None = None  # Force LLM strategy: "local_only", "cloud_only", "cloud_aid", etc.


class ChatResponse(BaseModel):
    message: str
    reasoning: str = ""
    tools_used: list[str] = Field(default_factory=list)
    state: AgentState = AgentState.IDLE
    duration_ms: float = 0
    engine: str = ""  # which LLM engine handled this: "local", "cloud", "cloud+local_refined", etc.


class StatusResponse(BaseModel):
    state: AgentState
    active_skills: list[str]
    browser_alive: bool
    ollama_connected: bool
    groq_connected: bool = False
    alpha_connected: bool = False
    beta_connected: bool = False
    uptime_seconds: float
    local_model: str = ""
    cloud_model: str = ""
    alpha_model: str = ""
    mode: str = "degraded"  # "three-body", "ceo-only", "cloud-only", "degraded"
    llm_stats: dict[str, Any] = Field(default_factory=dict)
    router_stats: dict[str, Any] = Field(default_factory=dict)


class SkillListResponse(BaseModel):
    skills: list[SkillManifest]
