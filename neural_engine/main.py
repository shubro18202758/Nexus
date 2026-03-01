"""
NEXUS Neural Engine — FastAPI + WebSocket server.

The bridge between the Next.js dashboard and the Python Nanobot brain.
Exposes REST endpoints + real-time WebSocket for the frontend.

Run:
    cd neural_engine
    python main.py
    # or: uvicorn main:app --host 0.0.0.0 --port 7777 --reload
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# Add parent directory to path so imports work
sys.path.insert(0, os.path.dirname(__file__))

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local"))
load_dotenv()

from nanobot.bridge import NanobotBridge
from nanobot.core import Nanobot
from nanobot.types import ChatRequest, ChatResponse, WSEvent


# ── WebSocket Manager ──────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket connections for real-time push."""

    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send(self, ws: WebSocket, data: dict):
        try:
            await ws.send_json(data)
        except Exception:
            self.disconnect(ws)


manager = ConnectionManager()
nanobot: Nanobot | None = None
bridge: NanobotBridge | None = None
boot_time = time.time()


# ── Lifespan ───────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle for the hybrid engine."""
    global nanobot, bridge

    print("\n⚡ NEXUS Three-Body Neural Engine starting up...")
    nanobot = Nanobot.get_instance()

    # Wire WebSocket broadcasting into the nanobot
    async def ws_emit(event: dict):
        await manager.broadcast(event)

    nanobot.set_broadcast(ws_emit)

    await nanobot.startup()

    # Start the bridge to official nanobot-ai
    bridge = NanobotBridge()
    bridge_ok = await bridge.startup()

    print("✅ Nanobot Three-Body brain online")
    print(f"🧠 Skills loaded: {[s.manifest().name for s in nanobot.skills.values()]}")
    print(f"🔗 Bridge: {'connected' if bridge_ok else 'standalone'}")
    print(f"🌐 Listening on http://0.0.0.0:7777")
    print(f"🔌 WebSocket at ws://0.0.0.0:7777/ws\n")

    yield

    print("\n🛑 Shutting down Hybrid Neural Engine...")
    if bridge:
        await bridge.shutdown()
    if nanobot:
        await nanobot.shutdown()
    print("Goodbye.\n")


# ── App ────────────────────────────────────────────────────

app = FastAPI(
    title="NEXUS Three-Body Neural Engine",
    description="Three-Body Orchestrator — CEO (DeepSeek R1 8B) + Alpha (Groq 8B) + Beta (Groq 70B)",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── REST Endpoints ─────────────────────────────────────────

@app.get("/")
async def root():
    return {"engine": "NEXUS Three-Body Neural Engine", "status": "online", "version": "3.0.0"}


@app.get("/api/health")
async def health():
    return {"status": "ok", "uptime_seconds": int(time.time() - boot_time)}


@app.get("/api/status")
async def status():
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)
    s = nanobot.get_status()
    return s.model_dump()


@app.get("/api/engines")
async def engines():
    """Get status of all three engines in the Three-Body Orchestrator."""
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)
    tb = nanobot.three_body
    return {
        "architecture": "three-body",
        "ceo": {
            "role": "orchestrator",
            "model": nanobot.local_llm.model,
            "online": tb.is_local_connected,
            "type": "local (Ollama)",
        },
        "alpha": {
            "role": "contract_engine_alpha",
            "model": nanobot.alpha_engine.model,
            "online": tb.is_alpha_connected,
            "type": "cloud (Groq)",
            "speciality": "fast ingestion, classification, entity extraction",
            "stats": nanobot.alpha_engine.get_stats(),
        },
        "beta": {
            "role": "contract_engine_beta",
            "model": nanobot.beta_engine.model,
            "online": tb.is_beta_connected,
            "type": "cloud (Groq)",
            "speciality": "advanced reasoning, code gen, multi-step planning",
            "stats": nanobot.beta_engine.get_stats(),
        },
        "stats": tb.get_stats(),
    }


@app.get("/api/skills")
async def list_skills():
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)
    manifests = [skill.manifest().model_dump() for skill in nanobot.skills.values()]
    return {"skills": manifests}


class ChatBody(BaseModel):
    message: str
    session_id: str = "default"
    strategy: str | None = None  # Force LLM strategy: local_only, cloud_only, cloud_aid, etc.
    context: dict[str, Any] | None = None  # Extra context for the conversation


@app.post("/api/chat")
async def chat(body: ChatBody):
    """Send a message to the Nanobot and get a response."""
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)

    request = ChatRequest(
        message=body.message,
        conversation_id=body.session_id,
        strategy=body.strategy,
    )

    response = await nanobot.process(request)
    return response.model_dump()


@app.post("/api/chat/stream")
async def chat_stream(body: ChatBody):
    """
    Send a message and get a real SSE streaming response.
    Performs routing + tool execution first, then streams
    the final LLM response token-by-token as Server-Sent Events.
    """
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)

    async def _generate_sse():
        """Async generator producing SSE events."""
        t0 = time.time()
        session_id = body.session_id or "default"
        nanobot.memory.add(session_id, "user", body.message)

        if body.context:
            for k, v in body.context.items():
                nanobot.memory.set_context(session_id, k, v)

        tools_used: list[str] = []
        reasoning_trace = ""
        history = nanobot.memory.get_history(session_id)

        from nanobot.core import NANOBOT_SYSTEM_PROMPT, MAX_TOOL_TURNS

        messages = [
            {"role": "system", "content": NANOBOT_SYSTEM_PROMPT},
            *history,
        ]

        # ── Phase 1: Routing + tool execution (non-streaming) ──
        for _turn in range(MAX_TOOL_TURNS):
            if nanobot.router and nanobot.skills:
                yield f"data: {json.dumps({'type': 'status', 'text': 'Routing...', 'state': 'thinking'})}\n\n"

                context_str = str(nanobot.memory.get_context(session_id))
                tool_call = await nanobot.router.route(body.message, context_str)

                if tool_call.skill != "none" and tool_call.skill in nanobot.skills:
                    yield f"data: {json.dumps({'type': 'tool_start', 'skill': tool_call.skill, 'method': tool_call.method, 'reasoning': tool_call.reasoning})}\n\n"

                    skill = nanobot.skills[tool_call.skill]
                    tt0 = time.time()
                    result = await skill.execute(tool_call.method, tool_call.params)
                    result.duration_ms = (time.time() - tt0) * 1000

                    tools_used.append(f"{tool_call.skill}.{tool_call.method}")
                    reasoning_trace += f"\n[Tool: {tool_call.skill}.{tool_call.method}] {tool_call.reasoning}"

                    yield f"data: {json.dumps({'type': 'tool_result', 'skill': tool_call.skill, 'method': tool_call.method, 'success': result.success, 'duration_ms': result.duration_ms, 'preview': str(result.data)[:200] if result.data else result.error})}\n\n"

                    tool_output = (
                        f"Tool {tool_call.skill}.{tool_call.method} result: "
                        f"{'SUCCESS' if result.success else 'ERROR'}\n"
                        f"{result.data if result.success else result.error}"
                    )
                    nanobot.memory.add(session_id, "tool", tool_output)
                    messages.append({"role": "assistant", "content": f"[Using tool: {tool_call.skill}.{tool_call.method}]"})
                    messages.append({"role": "user", "content": tool_output})
                    break
                else:
                    break
            else:
                break

        # ── Phase 2: Stream LLM response token-by-token ──
        yield f"data: {json.dumps({'type': 'status', 'text': 'Generating response...', 'state': 'responding'})}\n\n"

        full_response = ""
        async for token in nanobot.dual_llm.chat_stream(messages, temperature=0.4, max_tokens=4096):
            full_response += token
            yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        # Extract thinking from full response (DeepSeek R1 format)
        thinking, answer = nanobot.local_llm.extract_thinking(full_response)
        if not answer:
            answer = full_response

        nanobot.memory.add(session_id, "assistant", answer)

        elapsed_ms = (time.time() - t0) * 1000
        yield f"data: {json.dumps({'type': 'done', 'message': answer, 'reasoning': thinking or reasoning_trace, 'tools_used': tools_used, 'duration_ms': elapsed_ms})}\n\n"

    return StreamingResponse(
        _generate_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/skill/{skill_name}/{method_name}")
async def invoke_skill(skill_name: str, method_name: str, params: dict | None = None):
    """Directly invoke a specific skill method."""
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)

    if skill_name not in nanobot.skills:
        return JSONResponse(
            {"error": f"Skill '{skill_name}' not found"},
            status_code=404,
        )

    skill = nanobot.skills[skill_name]
    result = await skill.execute(method_name, params or {})
    return {
        "success": result.success,
        "data": result.data,
        "error": result.error,
    }


@app.get("/api/memory/{session_id}")
async def get_memory(session_id: str = "default"):
    """Get conversation memory for a session."""
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)

    messages = nanobot.memory.get_history(session_id)
    return {"session_id": session_id, "messages": messages}


@app.delete("/api/memory/{session_id}")
async def clear_memory(session_id: str = "default"):
    """Clear conversation memory for a session."""
    if not nanobot:
        return JSONResponse({"error": "Nanobot not initialized"}, status_code=503)

    nanobot.memory.clear(session_id)
    return {"cleared": True, "session_id": session_id}


# ── Bridge Endpoints ───────────────────────────────────────

@app.get("/api/bridge/status")
async def bridge_status():
    """Get the bridge status between custom engine and official nanobot."""
    if not bridge:
        return {"bridge": "not_initialized"}
    return bridge.get_status()


@app.post("/api/bridge/ask")
async def bridge_ask(body: ChatBody):
    """Forward a message to the official nanobot-ai and get its response."""
    if not bridge or not bridge.is_available:
        return JSONResponse(
            {"error": "Official nanobot-ai not available"},
            status_code=503,
        )
    response = await bridge.ask_official(body.message)
    if response:
        return {"source": "official_nanobot", "message": response}
    return JSONResponse(
        {"error": "Official nanobot did not respond"},
        status_code=502,
    )


@app.post("/api/bridge/gateway/start")
async def start_gateway():
    """Start the official nanobot gateway for channel handling."""
    if not bridge:
        return JSONResponse({"error": "Bridge not initialized"}, status_code=503)
    ok = await bridge.start_gateway()
    return {"started": ok, "gateway_running": bridge.is_gateway_running}


@app.post("/api/bridge/gateway/stop")
async def stop_gateway():
    """Stop the official nanobot gateway."""
    if not bridge:
        return JSONResponse({"error": "Bridge not initialized"}, status_code=503)
    await bridge.stop_gateway()
    return {"stopped": True}


@app.post("/api/bridge/sync")
async def sync_memory_bridge(session_id: str = "default"):
    """Sync conversation memory from custom engine to official nanobot."""
    if not bridge or not nanobot:
        return JSONResponse({"error": "Bridge or Nanobot not initialized"}, status_code=503)
    messages = nanobot.memory.get_history(session_id)
    await bridge.sync_memory_to_official(session_id, messages)
    return {"synced": True, "session_id": session_id, "message_count": len(messages)}


# ── WebSocket ──────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """
    Real-time bidirectional communication with the Next.js frontend.
    
    Client → Server messages:
        {"type": "chat", "message": "...", "session_id": "..."}
        {"type": "ping"}
    
    Server → Client messages:
        {"type": "state_change", "state": "thinking|tool_calling|executing|responding"}
        {"type": "token", "content": "..."}
        {"type": "tool_call", "skill": "...", "method": "...", "params": {...}}
        {"type": "tool_result", "skill": "...", "success": true, "data": {...}}
        {"type": "response", "content": "...", "tools_used": [...]}
        {"type": "error", "message": "..."}
        {"type": "reminder_fired", "reminder": {...}}
        {"type": "pong"}
    """
    await manager.connect(ws)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send(ws, {"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await manager.send(ws, {"type": "pong"})

            elif msg_type == "chat":
                if not nanobot:
                    await manager.send(
                        ws, {"type": "error", "message": "Nanobot not ready"}
                    )
                    continue

                request = ChatRequest(
                    message=msg.get("message", ""),
                    conversation_id=msg.get("session_id", "default"),
                    strategy=msg.get("strategy"),
                )

                # Process in background so WS stays responsive
                asyncio.create_task(_handle_chat_ws(ws, request))

            elif msg_type == "skill":
                # Direct skill invocation via WS
                skill_name = msg.get("skill", "")
                method = msg.get("method", "")
                params = msg.get("params", {})

                if nanobot and skill_name in nanobot.skills:
                    result = await nanobot.skills[skill_name].execute(
                        method, params
                    )
                    await manager.send(ws, {
                        "type": "skill_result",
                        "skill": skill_name,
                        "method": method,
                        "success": result.success,
                        "data": result.data,
                        "error": result.error,
                    })
                else:
                    await manager.send(ws, {
                        "type": "error",
                        "message": f"Skill '{skill_name}' not found",
                    })

            elif msg_type == "status":
                if nanobot:
                    s = nanobot.get_status()
                    await manager.send(ws, {
                        "type": "status",
                        **s.model_dump(),
                    })

    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        manager.disconnect(ws)


async def _handle_chat_ws(ws: WebSocket, request: ChatRequest):
    """Handle a chat request with real-time updates over WebSocket."""
    try:
        # State: thinking
        await manager.send(ws, {
            "type": "state_change",
            "state": "thinking",
            "session_id": request.conversation_id,
        })

        response = await nanobot.process(request)

        # Final response
        await manager.send(ws, {
            "type": "response",
            "message": response.message,
            "reasoning": response.reasoning,
            "tools_used": response.tools_used,
            "engine": response.engine,
            "duration_ms": response.duration_ms,
            "session_id": request.conversation_id,
        })

        # State: idle
        await manager.send(ws, {
            "type": "state_change",
            "state": "idle",
            "session_id": request.conversation_id,
        })

    except Exception as e:
        await manager.send(ws, {
            "type": "error",
            "message": str(e),
            "session_id": request.conversation_id,
        })


# ── Entry Point ────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("NANOBOT_PORT", "7777"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=[os.path.dirname(__file__)],
        log_level="info",
    )
