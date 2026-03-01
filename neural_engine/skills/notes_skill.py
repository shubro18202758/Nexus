"""
Notes/Knowledge Skill — study material search + note management.

Features:
- Search through markdown notes in a knowledge base directory
- Create new notes with auto-tagging
- Summarize documents
- Find relevant study material by topic
- Integrates with the NEXUS RAG pipeline
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import aiofiles

from nanobot.types import (
    ParameterSpec,
    SkillManifest,
    SkillMethod,
    ToolResult,
)
from skills.base import BaseSkill

NOTES_DIR = os.getenv(
    "NOTES_DIR",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "knowledge"),
)


class NotesSkill(BaseSkill):
    """Knowledge base management — read, write, and search markdown notes."""

    def __init__(self):
        super().__init__()
        self._notes_dir = Path(NOTES_DIR)

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="notes",
            description="Search, read, create, and organize study notes and knowledge base documents",
            category="knowledge",
            requires_browser=False,
            methods=[
                SkillMethod(
                    name="search",
                    description="Search notes by keyword or topic",
                    parameters={
                        "query": ParameterSpec(
                            type="string",
                            description="Search keyword or topic",
                        ),
                    },
                    example='{"query": "linear algebra eigenvalues"}',
                ),
                SkillMethod(
                    name="read_note",
                    description="Read the full content of a specific note",
                    parameters={
                        "filename": ParameterSpec(
                            type="string",
                            description="Filename of the note (e.g. 'ml-lecture-3.md')",
                        ),
                    },
                ),
                SkillMethod(
                    name="create_note",
                    description="Create a new markdown note",
                    parameters={
                        "title": ParameterSpec(
                            type="string",
                            description="Note title",
                        ),
                        "content": ParameterSpec(
                            type="string",
                            description="Note content in markdown",
                        ),
                        "tags": ParameterSpec(
                            type="array",
                            description="Tags for categorization",
                            required=False,
                            default=[],
                        ),
                    },
                    example='{"title": "ML Lecture 4 Notes", "content": "## Support Vector Machines\\n...", "tags": ["ml", "svm", "cs337"]}',
                ),
                SkillMethod(
                    name="list_notes",
                    description="List all notes, optionally filtered by tag",
                    parameters={
                        "tag": ParameterSpec(
                            type="string",
                            description="Filter by tag",
                            required=False,
                        ),
                    },
                    example='{"tag": "ml"}',
                ),
                SkillMethod(
                    name="append_to_note",
                    description="Append content to an existing note",
                    parameters={
                        "filename": ParameterSpec(
                            type="string",
                            description="Filename of the note",
                        ),
                        "content": ParameterSpec(
                            type="string",
                            description="Content to append",
                        ),
                    },
                ),
                SkillMethod(
                    name="quick_capture",
                    description="Quickly capture a thought or snippet to the daily journal",
                    parameters={
                        "text": ParameterSpec(
                            type="string",
                            description="Text to capture",
                        ),
                    },
                    example='{"text": "Remember to ask prof about assignment 3 grading"}',
                ),
            ],
        )

    async def startup(self) -> None:
        self._notes_dir.mkdir(parents=True, exist_ok=True)

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "search":
                return await self._search(params["query"])
            elif method == "read_note":
                return await self._read_note(params["filename"])
            elif method == "create_note":
                return await self._create_note(
                    params["title"],
                    params["content"],
                    params.get("tags", []),
                )
            elif method == "list_notes":
                return await self._list_notes(params.get("tag"))
            elif method == "append_to_note":
                return await self._append_to_note(
                    params["filename"], params["content"]
                )
            elif method == "quick_capture":
                return await self._quick_capture(params["text"])
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"Notes error: {e}")

    # ── Private ────────────────────────────────────────────────

    async def _search(self, query: str) -> ToolResult:
        """Full-text search across all markdown files."""
        results = []
        query_lower = query.lower()

        for path in self._notes_dir.rglob("*.md"):
            try:
                async with aiofiles.open(path, "r", encoding="utf-8") as f:
                    content = await f.read()

                if query_lower in content.lower():
                    # Find matching lines for context
                    matches = []
                    for i, line in enumerate(content.split("\n")):
                        if query_lower in line.lower():
                            matches.append({
                                "line_number": i + 1,
                                "text": line.strip()[:200],
                            })

                    results.append({
                        "filename": path.name,
                        "path": str(path.relative_to(self._notes_dir)),
                        "match_count": len(matches),
                        "matches": matches[:5],  # Top 5 matches per file
                        "title": self._extract_title(content),
                    })
            except Exception:
                continue

        results.sort(key=lambda r: r["match_count"], reverse=True)

        return self._ok({
            "query": query,
            "total_results": len(results),
            "results": results[:10],
        })

    async def _read_note(self, filename: str) -> ToolResult:
        path = self._notes_dir / filename
        if not path.exists():
            # Try searching for partial match
            matches = list(self._notes_dir.rglob(f"*{filename}*"))
            if matches:
                path = matches[0]
            else:
                return self._err(f"Note not found: {filename}")

        async with aiofiles.open(path, "r", encoding="utf-8") as f:
            content = await f.read()

        # Extract frontmatter tags if present
        tags = self._extract_tags(content)

        return self._ok({
            "filename": path.name,
            "content": content,
            "tags": tags,
            "size_bytes": len(content.encode()),
            "word_count": len(content.split()),
        })

    async def _create_note(
        self, title: str, content: str, tags: list[str] | str
    ) -> ToolResult:
        # Normalize tags — accept comma-separated string or list
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        # Sanitize filename
        filename = re.sub(r"[^\w\s-]", "", title.lower())
        filename = re.sub(r"\s+", "-", filename).strip("-")
        filename = f"{filename}.md"

        path = self._notes_dir / filename

        # Build frontmatter
        now = datetime.now().isoformat()
        frontmatter = f"---\ntitle: {title}\ndate: {now}\ntags: [{', '.join(tags)}]\n---\n\n"

        full_content = frontmatter + f"# {title}\n\n{content}\n"

        async with aiofiles.open(path, "w", encoding="utf-8") as f:
            await f.write(full_content)

        return self._ok({
            "created": True,
            "filename": filename,
            "path": str(path),
            "message": f"Note '{title}' created successfully.",
        })

    async def _list_notes(self, tag: str | None = None) -> ToolResult:
        notes = []

        for path in sorted(self._notes_dir.rglob("*.md")):
            try:
                async with aiofiles.open(path, "r", encoding="utf-8") as f:
                    content = await f.read()

                tags = self._extract_tags(content)
                title = self._extract_title(content)

                if tag and tag.lower() not in [t.lower() for t in tags]:
                    continue

                stat = path.stat()
                notes.append({
                    "filename": path.name,
                    "title": title,
                    "tags": tags,
                    "size_bytes": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
            except Exception:
                continue

        return self._ok({
            "count": len(notes),
            "filter_tag": tag,
            "notes": notes,
        })

    async def _append_to_note(self, filename: str, content: str) -> ToolResult:
        path = self._notes_dir / filename
        if not path.exists():
            return self._err(f"Note not found: {filename}")

        async with aiofiles.open(path, "a", encoding="utf-8") as f:
            await f.write(f"\n\n{content}")

        return self._ok(f"Appended to '{filename}' successfully.")

    async def _quick_capture(self, text: str) -> ToolResult:
        """Append to today's daily journal."""
        today = datetime.now().strftime("%Y-%m-%d")
        journal_dir = self._notes_dir / "journal"
        journal_dir.mkdir(exist_ok=True)

        filename = f"{today}.md"
        path = journal_dir / filename

        now = datetime.now().strftime("%H:%M")
        entry = f"\n- **{now}** — {text}"

        if not path.exists():
            header = f"---\ntitle: Journal {today}\ndate: {today}\ntags: [journal, daily]\n---\n\n# {today}\n"
            async with aiofiles.open(path, "w", encoding="utf-8") as f:
                await f.write(header + entry + "\n")
        else:
            async with aiofiles.open(path, "a", encoding="utf-8") as f:
                await f.write(entry + "\n")

        return self._ok({
            "captured": True,
            "journal": filename,
            "message": f"Quick capture saved to journal: {text[:60]}...",
        })

    # ── Helpers ────────────────────────────────────────────────

    def _extract_title(self, content: str) -> str:
        """Extract title from frontmatter or first heading."""
        # Frontmatter title
        m = re.search(r"^title:\s*(.+)$", content, re.MULTILINE)
        if m:
            return m.group(1).strip()
        # First heading
        m = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if m:
            return m.group(1).strip()
        return "Untitled"

    def _extract_tags(self, content: str) -> list[str]:
        """Extract tags from frontmatter."""
        m = re.search(r"^tags:\s*\[([^\]]*)\]", content, re.MULTILINE)
        if m:
            raw = m.group(1)
            return [t.strip().strip("'\"") for t in raw.split(",") if t.strip()]
        return []
