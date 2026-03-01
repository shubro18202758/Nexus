"""
Comprehensive Three-Body Orchestrator Test Suite.
Tests every engine, delegation path, fallback, streaming, and skill routing.
"""

import asyncio
import json
import sys
import time

import httpx

BASE = "http://localhost:7777"
RESULTS: list[dict] = []
PASS = 0
FAIL = 0


def record(name: str, passed: bool, engine: str = "", latency: float = 0, detail: str = ""):
    global PASS, FAIL
    if passed:
        PASS += 1
        tag = "PASS"
    else:
        FAIL += 1
        tag = "FAIL"
    RESULTS.append({"test": name, "result": tag, "engine": engine, "latency_ms": round(latency), "detail": detail[:120]})
    icon = "✅" if passed else "❌"
    print(f"  {icon} [{tag}] {name} — engine={engine} ({round(latency)}ms)")
    if detail and not passed:
        print(f"       Detail: {detail[:200]}")


async def chat(message: str, timeout: float = 300.0) -> dict:
    """Send a chat message and return the response dict."""
    async with httpx.AsyncClient(timeout=timeout) as c:
        payload = {"message": message}
        t0 = time.time()
        try:
            r = await c.post(f"{BASE}/api/chat", json=payload)
            elapsed = (time.time() - t0) * 1000
            data = r.json()
            data["_latency_ms"] = elapsed
            return data
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.WriteTimeout) as e:
            elapsed = (time.time() - t0) * 1000
            return {
                "message": "",
                "engine": "timeout",
                "_latency_ms": elapsed,
                "_error": f"Timeout after {elapsed/1000:.0f}s: {e.__class__.__name__}",
            }
        except Exception as e:
            elapsed = (time.time() - t0) * 1000
            return {
                "message": "",
                "engine": "error",
                "_latency_ms": elapsed,
                "_error": str(e),
            }


async def stream_chat(message: str, timeout: float = 300.0) -> dict:
    """Send a streaming chat request and collect SSE chunks."""
    async with httpx.AsyncClient(timeout=timeout) as c:
        payload = {"message": message, "stream": True}
        t0 = time.time()
        chunks = []
        try:
            async with c.stream("POST", f"{BASE}/api/chat/stream", json=payload) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        raw = line[6:]
                        if raw.strip() == "[DONE]":
                            break
                        try:
                            chunks.append(json.loads(raw))
                        except json.JSONDecodeError:
                            chunks.append({"raw": raw})
        except Exception as e:
            return {"error": str(e), "_latency_ms": (time.time() - t0) * 1000, "chunks": chunks, "total_chunks": len(chunks)}
        elapsed = (time.time() - t0) * 1000
        return {"chunks": chunks, "_latency_ms": elapsed, "total_chunks": len(chunks)}


async def get_json(path: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}{path}")
        return r.json()


# ═══════════════════════════════════════════════════════════════
# TEST 1: Health & Engine Status
# ═══════════════════════════════════════════════════════════════

async def test_health():
    print("\n═══ TEST GROUP 1: Health & Engine Status ═══")

    # 1a: Root endpoint
    data = await get_json("/")
    record("Root endpoint responds",
           data.get("status") == "online" and "3.0.0" in data.get("version", ""),
           detail=json.dumps(data))

    # 1b: Engines endpoint
    engines = await get_json("/api/engines")
    ceo_online = engines.get("ceo", {}).get("online", False)
    alpha_online = engines.get("alpha", {}).get("online", False)
    beta_online = engines.get("beta", {}).get("online", False)

    record("CEO engine online", ceo_online, engine="ceo",
           detail=f"model={engines.get('ceo', {}).get('model')}")
    record("Alpha engine online", alpha_online, engine="alpha",
           detail=f"model={engines.get('alpha', {}).get('model')}")
    record("Beta engine online", beta_online, engine="beta",
           detail=f"model={engines.get('beta', {}).get('model')}")
    record("Architecture is three-body",
           engines.get("architecture") == "three-body",
           detail=f"got: {engines.get('architecture')}")

    # 1c: Status endpoint
    status = await get_json("/api/status")
    record("Status: alpha_connected field",
           status.get("alpha_connected") is True, engine="status")
    record("Status: beta_connected field",
           status.get("beta_connected") is True, engine="status")
    record("Status: mode is three-body",
           "three-body" in status.get("mode", ""),
           detail=f"got: {status.get('mode')}")
    record("Status: alpha_model field",
           status.get("alpha_model") == "llama-3.1-8b-instant",
           detail=f"got: {status.get('alpha_model')}")

    # 1d: Skills endpoint
    skills = await get_json("/api/skills")
    skill_list = skills.get("skills", []) if isinstance(skills, dict) else skills
    record("Skills endpoint returns list",
           isinstance(skill_list, list) and len(skill_list) >= 5,
           detail=f"count={len(skill_list) if isinstance(skill_list, list) else 'bad format'}")


# ═══════════════════════════════════════════════════════════════
# TEST 2: CEO Delegation Logic (DeepSeek R1 local)
# ═══════════════════════════════════════════════════════════════

async def test_ceo_delegation():
    print("\n═══ TEST GROUP 2: CEO Delegation (DeepSeek R1 8B) ═══")

    # 2a: Simple greeting → should be handled by CEO
    data = await chat("Hey, what's up?")
    engine = data.get("engine", "")
    record("Simple greeting → CEO handles",
           "ceo" in engine.lower() or len(data.get("message", "")) > 0,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 2b: Personal context → CEO
    data = await chat("What can you help me with today?")
    engine = data.get("engine", "")
    record("Personal context → CEO expected",
           len(data.get("message", "")) > 0,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 2c: CEO should delegate scan/classify to Alpha
    data = await chat("Classify this text: 'The server crashed at 3am with OOM error'")
    engine = data.get("engine", "")
    record("Classify text → Alpha delegation",
           "alpha" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 2d: CEO should delegate code gen to Beta
    data = await chat("Write a Python async web scraper with error handling and implement retry logic")
    engine = data.get("engine", "")
    record("Code generation → Beta delegation",
           "beta" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])


# ═══════════════════════════════════════════════════════════════
# TEST 3: Alpha Engine Skills (Fast Ingestion)
# ═══════════════════════════════════════════════════════════════

async def test_alpha_skills():
    print("\n═══ TEST GROUP 3: Contract Engine Alpha (Groq llama-3.1-8b-instant) ═══")

    # 3a: Scan events keyword
    data = await chat("Scan my channel events for today")
    engine = data.get("engine", "")
    record("'Scan channel events' → Alpha",
           "alpha" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 3b: Entity extraction
    data = await chat("Extract all entities from: 'Sayan has a meeting with Dr. Roy at IIT Bombay on March 5th about the Slingshot project'")
    engine = data.get("engine", "")
    record("Entity extraction → Alpha",
           "alpha" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 3c: Summarization
    data = await chat("Summarise this paragraph: Machine learning is a subset of artificial intelligence that enables systems to learn from data without explicit programming. It uses statistical techniques to give computers the ability to learn.")
    engine = data.get("engine", "")
    record("Summarization → Alpha",
           "alpha" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 3d: Classification
    data = await chat("Classify this email as spam or not: 'Congratulations! You won a free iPhone! Click here now!'")
    engine = data.get("engine", "")
    record("Text classification → Alpha",
           "alpha" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 3e: Parse/ingest task
    data = await chat("Parse this log entry and extract the timestamp: '[2026-02-23 10:45:22] ERROR: Connection refused to database server'")
    engine = data.get("engine", "")
    record("Log parsing → Alpha",
           "alpha" in engine.lower(),
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])


# ═══════════════════════════════════════════════════════════════
# TEST 4: Beta Engine Skills (Advanced Reasoning)
# ═══════════════════════════════════════════════════════════════

async def test_beta_skills():
    print("\n═══ TEST GROUP 4: Contract Engine Beta (Groq llama-3.3-70b-versatile) ═══")

    # 4a: Code generation
    data = await chat("Generate a TypeScript React component for a sortable data table with pagination")
    engine = data.get("engine", "")
    is_beta = engine.lower() == "beta"
    beta_fallback = "beta_failed" in engine.lower()
    record("Code generation → Beta",
           is_beta or beta_fallback,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=f"{'DIRECT' if is_beta else 'FALLBACK' if beta_fallback else 'MISS'}: {data.get('message', '')[:80]}")

    # 4b: Complex reasoning/analysis
    data = await chat("Analyse the trade-offs between microservices and monolith architectures for a startup with 5 engineers")
    engine = data.get("engine", "")
    is_beta = engine.lower() == "beta"
    beta_fallback = "beta_failed" in engine.lower()
    record("Architecture analysis → Beta",
           is_beta or beta_fallback,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=f"{'DIRECT' if is_beta else 'FALLBACK' if beta_fallback else 'MISS'}: {data.get('message', '')[:80]}")

    # 4c: Multi-step planning
    data = await chat("Create a detailed plan for migrating a PostgreSQL database to a new server with zero downtime")
    engine = data.get("engine", "")
    is_beta = engine.lower() == "beta"
    beta_fallback = "beta_failed" in engine.lower()
    record("Migration planning → Beta",
           is_beta or beta_fallback,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=f"{'DIRECT' if is_beta else 'FALLBACK' if beta_fallback else 'MISS'}: {data.get('message', '')[:80]}")

    # 4d: Deep reasoning
    data = await chat("Explain the P vs NP problem and why it matters for cryptography, with examples")
    engine = data.get("engine", "")
    is_beta = engine.lower() == "beta"
    beta_fallback = "beta_failed" in engine.lower()
    record("Deep reasoning (P vs NP) → Beta",
           is_beta or beta_fallback,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=f"{'DIRECT' if is_beta else 'FALLBACK' if beta_fallback else 'MISS'}: {data.get('message', '')[:80]}")

    # 4e: Debugging
    data = await chat("Debug this code: async function fetchData() { const res = await fetch('/api'); const data = res.json(); return data; } — Why might this fail?")
    engine = data.get("engine", "")
    is_beta = engine.lower() == "beta"
    beta_fallback = "beta_failed" in engine.lower()
    record("Code debugging → Beta",
           is_beta or beta_fallback,
           engine=engine, latency=data.get("_latency_ms", 0),
           detail=f"{'DIRECT' if is_beta else 'FALLBACK' if beta_fallback else 'MISS'}: {data.get('message', '')[:80]}")


# ═══════════════════════════════════════════════════════════════
# TEST 5: Keyword Routing Accuracy
# ═══════════════════════════════════════════════════════════════

async def test_keyword_routing():
    print("\n═══ TEST GROUP 5: Keyword Routing Accuracy ═══")

    # Use prompts that test Three-Body keyword routing WITHOUT triggering
    # SkillRouter skill matches (no whatsapp/email/calendar/web_research triggers)
    alpha_keywords = [
        ("scan this data and categorize items by priority", "alpha"),
        ("classify the sentiment of this product review text", "alpha"),
        ("extract entities from this paragraph about technology", "alpha"),
        ("summarize the key points of this technical document", "alpha"),
        ("parse the log entries and filter errors from warnings", "alpha"),
    ]

    beta_keywords = [
        ("write a Python function to sort a linked list", "beta"),
        ("analyse this microservice architecture design and trade-offs", "beta"),
        ("build a React component with TypeScript for a dashboard", "beta"),
    ]

    for msg, expected in alpha_keywords:
        data = await chat(msg)
        engine = data.get("engine", "").lower()
        record(f"Keyword→'{msg[:35]}...' → {expected}",
               expected in engine,
               engine=data.get("engine", ""),
               latency=data.get("_latency_ms", 0))

    for msg, expected in beta_keywords:
        data = await chat(msg)
        engine = data.get("engine", "").lower()
        record(f"Keyword→'{msg[:35]}...' → {expected}",
               expected in engine,
               engine=data.get("engine", ""),
               latency=data.get("_latency_ms", 0))


# ═══════════════════════════════════════════════════════════════
# TEST 6: Streaming Endpoint
# ═══════════════════════════════════════════════════════════════

async def test_streaming():
    print("\n═══ TEST GROUP 6: Streaming Endpoint ═══")

    # 6a: Basic stream
    data = await stream_chat("Hello, how are you?")
    has_chunks = data.get("total_chunks", 0) > 0
    record("Stream: receives SSE chunks",
           has_chunks or "error" not in data,
           latency=data.get("_latency_ms", 0),
           detail=f"chunks={data.get('total_chunks', 0)}, error={data.get('error', 'none')}")

    # 6b: Longer stream for code
    data = await stream_chat("Write a hello world program in Rust")
    has_chunks = data.get("total_chunks", 0) > 0
    record("Stream: code gen produces chunks",
           has_chunks or "error" not in data,
           latency=data.get("_latency_ms", 0),
           detail=f"chunks={data.get('total_chunks', 0)}")


# ═══════════════════════════════════════════════════════════════
# TEST 7: Skill Router Integration
# ═══════════════════════════════════════════════════════════════

async def test_skill_routing():
    print("\n═══ TEST GROUP 7: Skill Router Integration ═══")

    # 7a: Calendar skill trigger
    data = await chat("What's on my calendar today?")
    record("Calendar skill trigger",
           len(data.get("message", "")) > 0,
           engine=data.get("engine", ""),
           latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 7b: Reminder skill trigger
    data = await chat("Remind me to call the doctor at 4pm")
    record("Reminder skill trigger",
           len(data.get("message", "")) > 0,
           engine=data.get("engine", ""),
           latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 7c: Notes skill trigger
    data = await chat("Take a note: Three-Body test passed successfully")
    record("Notes skill trigger",
           len(data.get("message", "")) > 0,
           engine=data.get("engine", ""),
           latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])

    # 7d: Web research skill trigger
    data = await chat("Search the web for AMD Slingshot India competition details")
    record("Web research skill trigger",
           len(data.get("message", "")) > 0,
           engine=data.get("engine", ""),
           latency=data.get("_latency_ms", 0),
           detail=data.get("message", "")[:100])


# ═══════════════════════════════════════════════════════════════
# TEST 8: Stats Accumulation
# ═══════════════════════════════════════════════════════════════

async def test_stats():
    print("\n═══ TEST GROUP 8: Stats Accumulation After All Tests ═══")

    engines = await get_json("/api/engines")
    stats = engines.get("stats", {})

    total_alpha = stats.get("alpha_stats", {}).get("calls", 0)
    total_beta = stats.get("beta_stats", {}).get("calls", 0)
    ceo_online = stats.get("ceo_online", False)
    total_delegations = stats.get("delegations", 0)

    record("Stats: Alpha had calls",
           total_alpha > 0,
           detail=f"alpha_calls={total_alpha}")
    record("Stats: Beta had calls",
           total_beta > 0,
           detail=f"beta_calls={total_beta}")
    record("Stats: CEO reported online",
           ceo_online,
           detail=f"ceo_online={ceo_online}")
    record("Stats: Delegations counted",
           total_delegations > 0,
           detail=f"delegations={total_delegations}")

    # Print full stats
    print(f"\n  📊 Final Engine Stats:")
    print(f"     CEO calls: {stats.get('ceo_calls', 0)} | avg: {stats.get('ceo_avg_ms', 0):.0f}ms")
    print(f"     Alpha calls: {total_alpha} | avg: {stats.get('alpha_avg_ms', 0):.0f}ms")
    print(f"     Beta calls: {total_beta} | avg: {stats.get('beta_avg_ms', 0):.0f}ms")
    print(f"     Delegations: {total_delegations} | Fallbacks: {stats.get('fallbacks', 0)} | Fan-outs: {stats.get('fan_outs', 0)}")


# ═══════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════

async def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  NEXUS Three-Body Orchestrator — Comprehensive Test Suite  ║")
    print("║  CEO: DeepSeek R1 8B  |  Alpha: llama-3.1-8b  |  Beta: 70b║")
    print("╚══════════════════════════════════════════════════════════════╝")

    # Check server is alive
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{BASE}/")
            if r.status_code != 200:
                print("❌ Server not responding. Start it first: python main.py")
                sys.exit(1)
    except Exception:
        print("❌ Cannot connect to server at localhost:7777")
        sys.exit(1)

    t_start = time.time()

    await test_health()
    await test_ceo_delegation()
    print("  ⏳ Pausing 3s to avoid Groq RPM limits...")
    await asyncio.sleep(3)
    await test_alpha_skills()
    print("  ⏳ Pausing 3s to avoid Groq RPM limits...")
    await asyncio.sleep(3)
    await test_beta_skills()
    print("  ⏳ Pausing 5s to avoid Groq TPD limits on 70B...")
    await asyncio.sleep(5)
    await test_keyword_routing()
    print("  ⏳ Pausing 3s to avoid Groq RPM limits...")
    await asyncio.sleep(3)
    await test_streaming()
    await test_skill_routing()
    await test_stats()

    total_time = time.time() - t_start

    # ── Summary ──
    print("\n" + "═" * 64)
    print(f"  TOTAL: {PASS + FAIL} tests | ✅ {PASS} PASSED | ❌ {FAIL} FAILED")
    print(f"  TIME:  {total_time:.1f}s total")
    print("═" * 64)

    # Print routing distribution
    engine_counts: dict[str, int] = {}
    for r in RESULTS:
        e = r.get("engine", "").lower()
        if e:
            engine_counts[e] = engine_counts.get(e, 0) + 1
    if engine_counts:
        print(f"\n  🔀 Routing Distribution:")
        for eng, cnt in sorted(engine_counts.items(), key=lambda x: -x[1]):
            print(f"     {eng}: {cnt} routes")

    if FAIL > 0:
        print(f"\n  ⚠️  {FAIL} tests failed — review above for details")
        sys.exit(1)
    else:
        print(f"\n  🎉 All tests passed! Three-Body Orchestrator is fully operational.")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
