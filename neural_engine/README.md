# Nanobot Neural Engine
# =====================
# Persistent AI agent daemon for NEXUS Student OS
# Runs alongside the Next.js frontend as the "brain"

## Quick Start
```bash
cd neural_engine
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
playwright install chromium
python main.py
```

## Architecture
```
neural_engine/
├── main.py               # FastAPI + WebSocket server (port 7777)
├── nanobot/
│   ├── core.py           # Agent brain — reasoning loop + tool dispatch
│   ├── llm.py            # Ollama connector (DeepSeek R1 raw)
│   ├── memory.py         # Conversation + session memory
│   ├── router.py         # Skill router (intent → tool mapping)
│   └── types.py          # Shared Pydantic models
├── skills/
│   ├── base.py           # BaseSkill — all skills inherit this
│   ├── whatsapp.py       # WhatsApp R/W (persistent Playwright session)
│   ├── email_skill.py    # Gmail/Outlook integration
│   ├── calendar_skill.py # Google Calendar + iCal
│   ├── notes_skill.py    # Markdown knowledge base
│   ├── form_filler.py    # Auto-fill forms on any website
│   └── reminder.py       # Deadline alerts + proactive nudges
├── browser/
│   ├── manager.py        # Persistent browser context manager
│   └── stealth.py        # Anti-detection patches
└── mcp/
    └── server.py         # MCP tool server for external integrations
```

## Communication
- **REST**: `POST /api/chat` — send command, get response
- **WebSocket**: `ws://localhost:7777/ws` — real-time bidirectional stream
- **MCP**: Standard Model Context Protocol tool server

## Design Principles
1. **Persistent** — browser sessions survive restarts (stored in `./browser_data/`)
2. **Modular** — drop a Python file into `skills/` to add a new capability
3. **Local-first** — DeepSeek R1 8b via Ollama, no cloud dependency
4. **Raw** — no guardrails on the model, pure reasoning
5. **Observable** — every step emits status via WebSocket for UI feedback
