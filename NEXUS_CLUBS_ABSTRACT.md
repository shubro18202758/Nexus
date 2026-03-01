# NEXUS — Cross-IIT Club Intelligence Hub
## Feature Abstract & Integration Guide
**Author:** Pratham Kumar | **Branch:** `feature/nexus-clubs`  
**Status:** Production-ready | **Date:** February 2026

---

## 1. Idea & Vision

NEXUS is a cross-IIT club intelligence layer built inside Slingshot. The core idea: every IIT student wastes hours searching for clubs across 8 different institutional websites, Instagram pages, and seniors' WhatsApp messages. NEXUS consolidates this — clubs, their events, knowledge, recruitment criteria — into one searchable, AI-powered interface.

**The differentiation from a simple directory:**
- It doesn't just list clubs. It extracts *tacit* knowledge — the stuff seniors know but isn't written anywhere (who actually gets selected, what skills matter, what the club culture is like).
- It's profile-aware — it detects which IIT the student is from and surfaces their home institution's clubs first.
- It fetches live data — every club page pulls real-time articles, upcoming events, and competition announcements directly from the web at page load time.

---

## 2. Architecture

### 2.1 Tech Stack
| Layer | Tech | Purpose |
|-------|------|---------|
| AI Orchestration | Groq (`llama-3.1-8b-instant`) | Club discovery, profiling, knowledge extraction, search synthesis |
| Web Intelligence | Tavily API | Real-time web search for live club data, events, articles |
| Database | PGlite (server-side, file-based) | Persistent club storage, knowledge base, events |
| ORM | Drizzle ORM | Type-safe DB queries |
| Frontend | Next.js 15 + Tailwind + Framer Motion | Reactive UI with section-based layout |
| Streaming | Server-Sent Events (SSE) | Real-time pipeline progress in the UI |

### 2.2 Database Schema (6 new tables appended to `src/db/schema.ts`)
```
iit_registry         → IIT metadata and seed URLs
clubs                → Club profiles (name, category, links, tags, recruiting status)
club_knowledge       → Extracted tacit knowledge items per club
club_event_aggregates → Events/competitions per club
crawl_logs           → Pipeline run history
```
**Note:** These use the project's existing `customType` vector pattern. The server-side PGlite instance (`nexus-server-db/` file path) is used — separate from the client-side IndexedDB instance.

### 2.3 Pipeline Architecture (4-stage agentic pipeline)
```
Stage 1 — DISCOVERY
  Tavily searches IIT club directories
  → Groq extracts structured club list from search results
  → Returns: [{ name, url, category }]

Stage 2 — PROFILE
  Tavily: 2 searches per club (general info + events)
  → Groq structures real profile data (links, description, tags, events)
  → Returns: ClubProfile + ClubEvent[]

Stage 3 — KNOWLEDGE EXTRACTION  
  Tavily: 4 targeted searches (recruitment, projects, events, achievements)
  → Groq extracts tacit knowledge items with confidence scores
  → Returns: KnowledgeItem[] + summary

Stage 4 — PERSISTENCE
  Upsert to clubs table (select-then-insert pattern, no UNIQUE constraint dependency)
  Insert knowledge items + events
  → Club cards appear in UI
```

### 2.4 Live Data (per page load)
When a student opens any club detail page:
```
3 parallel Tavily searches:
  1. Recent news/articles about the club
  2. Upcoming events, workshops, hackathons
  3. Competitions, challenges, quiz results

→ Displayed in Knowledge tab (articles with links) and Events tab (competitions with register links)
→ No caching — always fresh
```

---

## 3. File Structure

### Frontend (src/app/clubs/)
```
src/app/clubs/
├── page.tsx                    ← Main NEXUS page with section-based layout
└── [id]/
    └── page.tsx                ← Club detail page (Knowledge/Events/About tabs)
```

### API Routes (src/app/api/clubs/)
```
src/app/api/clubs/
├── crawl/route.ts              ← POST: trigger pipeline (SSE stream) | GET: list clubs
├── search/route.ts             ← POST: profile-aware semantic search + Groq synthesis
├── stats/route.ts              ← GET: dashboard metrics
└── [id]/
    ├── knowledge/route.ts      ← GET: knowledge items for a club
    ├── events/route.ts         ← GET: events for a club
    └── live/route.ts           ← GET: real-time Tavily articles + events
```

### Agent (src/lib/agent/)
```
src/lib/agent/
├── nexus-agent.ts              ← 4-stage pipeline, all Groq + Tavily logic
└── iit-registry.ts             ← Seed URLs for 8 IITs + category keywords
```

### Components (src/components/clubs/)
```
src/components/clubs/
├── ClubCard.tsx                ← Grid/list card (Web ↗, Insta ↗, GitHub links)
├── ClubProfile.tsx             ← Side drawer (legacy, replaced by detail page)
├── NexusCrawlPanel.tsx         ← Agent control panel with SSE log stream
└── NexusSearchBar.tsx          ← Search input + IITFilterBar component
```

### Modified Files
```
src/db/schema.ts                ← 6 new tables appended (do NOT replace, append only)
src/lib/server-db.ts            ← Table creation on init + ensureTablesExist() export
src/components/layout/app-shell.tsx ← "Clubs" nav entry with Network icon added
```

---

## 4. Environment Variables Required

```env
GROQ_API_KEY=gsk_...        # Free at console.groq.com — use llama-3.1-8b-instant
TAVILY_API_KEY=tvly-...     # Free tier: 1000 searches/month — app.tavily.com
```

Both keys go in `.env.local` at the project root. Neither is committed to git.

---

## 5. Integration Steps (for teammate)

### Step 1 — Add environment variables
```bash
echo "GROQ_API_KEY=gsk_your_key" >> .env.local
echo "TAVILY_API_KEY=tvly_your_key" >> .env.local
```

### Step 2 — Append schema tables
Append the 6 new tables from `src/db/schema.ts` to your existing schema file. Do NOT replace — the tables must coexist with existing ones.

### Step 3 — Extend server-db.ts
Add the `ensureTablesExist()` function and call it in the server DB initialization block. The clubs tables are created via raw SQL `CREATE TABLE IF NOT EXISTS` statements.

### Step 4 — Add nav entry
In `src/components/layout/app-shell.tsx`:
```tsx
import { Network } from "lucide-react";
// In your nav array:
{ name: "Clubs", href: "/clubs", icon: Network }
```

### Step 5 — Copy all new files
Copy all files from the `src/app/clubs/`, `src/app/api/clubs/`, `src/lib/agent/`, `src/components/clubs/` directories without replacing any existing files outside these directories.

### Step 6 — Restart dev server
```bash
rm -rf nexus-server-db .next
npm run dev
```

### Step 7 — Run the pipeline
Navigate to `/clubs` → click "Run Nexus Agent" → select an IIT → set max clubs (5 recommended) → Launch. Watch the SSE log stream. Club cards appear after save confirmations.

---

## 6. Known Constraints

| Constraint | Detail |
|-----------|--------|
| Groq rate limit | Free tier: 6000 req/min on llama-3.1-8b-instant. Pipeline adds 800ms delay between clubs. |
| Tavily free tier | 1000 searches/month. Each club costs ~7 searches (discovery + profile + knowledge + live). |
| Chrome/Stagehand | Not used. All web intelligence via Tavily HTTP API — works in any environment including Codespaces, CI, serverless. |
| PGlite server DB | Stored at `nexus-server-db/` in project root. Must be in `.gitignore`. Recreated on first pipeline run. |
| Next.js 15 params | All dynamic route handlers use `await params` (Promise-based). Page components use `useParams()` hook (synchronous). |

---

## 7. Key Design Decisions

**Why Tavily over Stagehand/Playwright?**  
Chrome cannot run in GitHub Codespaces (no dbus, no display server). Tavily is a pure HTTP API that returns pre-rendered search results and page content — equivalent capability, zero infra requirements.

**Why Groq over OpenAI?**  
Free tier with generous limits. `llama-3.1-8b-instant` is fast enough for streaming UX and cheap enough for multi-search pipelines.

**Why not drizzle-kit push?**  
The project uses manual `CREATE TABLE IF NOT EXISTS` in the server DB provider. Maintaining that pattern ensures zero breaking changes to existing tables.

**Why select-then-insert instead of ON CONFLICT?**  
PGlite's `onConflictDoUpdate` requires the UNIQUE constraint to exist in the physical table. Since we can't guarantee migration state, we use a select → update or insert pattern instead.

**Why SSE for pipeline progress?**  
The pipeline takes 30-90 seconds for 5 clubs. SSE lets us stream each stage's progress (discovery → profiling → knowledge → saved) in real time so the user sees activity instead of a spinner.

---

## 8. Usage Flow

1. Student opens `/clubs` → home IIT section loads (if profile has university set)
2. Clicks "Run Nexus Agent" → selects IIT, sets max clubs (5-10), launches
3. SSE log streams: `Discovered 5 clubs → Processing Robotics Club → Extracted 8 knowledge items → ✅ Saved`
4. Club cards appear in section grid (Technical / Cultural / etc.)
5. Click any card → navigates to `/clubs/[id]`
6. Club detail page loads DB data + fires 3 parallel Tavily searches for live content
7. Knowledge tab shows extracted insights + recent web articles with links
8. Events tab shows upcoming hackathons, competitions, workshops with register links
9. Search bar at top → type any query → profile-aware Groq synthesis answers with club recommendations

---

## 9. Validation Checklist

- [ ] `GROQ_API_KEY` and `TAVILY_API_KEY` in `.env.local`
- [ ] 6 new tables visible in schema (iit_registry, clubs, club_knowledge, club_event_aggregates, crawl_logs)
- [ ] "Clubs" appears in sidebar navigation
- [ ] Pipeline runs without "Save failed" errors
- [ ] Club cards appear after pipeline completes
- [ ] Clicking a card navigates to `/clubs/[id]`
- [ ] Knowledge tab shows items (DB) + articles (live web)
- [ ] Events tab shows competitions/hackathons with links
- [ ] Search returns relevant results with AI-synthesized answer
- [ ] Home IIT auto-detected if university is set in student profile

---

*Built by Pratham Kumar for Slingshot — Cross-IIT Club Intelligence Layer*
