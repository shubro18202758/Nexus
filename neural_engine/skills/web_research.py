"""
Web Research Skill — real-time web search and content extraction.

Features:
- Search the web (via DuckDuckGo or browser scraping)
- Extract content from URLs
- Summarize web pages
- Multi-hop research (search → read → synthesize)
- No API key needed — uses Playwright browser
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from urllib.parse import quote_plus

from nanobot.types import (
    ParameterSpec,
    SkillManifest,
    SkillMethod,
    ToolResult,
)
from skills.base import BaseSkill

DUCKDUCKGO_URL = "https://duckduckgo.com/?q="


class WebResearchSkill(BaseSkill):
    """Web search and content extraction via headless browser."""

    def __init__(self):
        super().__init__()
        self._browser_mgr: Any = None
        self._llm: Any = None

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="web_research",
            description="Search the web, extract content from URLs, and summarize web pages",
            category="knowledge",
            requires_browser=True,
            methods=[
                SkillMethod(
                    name="search",
                    description="Search the web for a query and return top results",
                    parameters={
                        "query": ParameterSpec(
                            type="string",
                            description="Search query",
                        ),
                        "count": ParameterSpec(
                            type="number",
                            description="Number of results to return",
                            required=False,
                            default=5,
                        ),
                    },
                    example='{"query": "IIT Bombay placement statistics 2025"}',
                ),
                SkillMethod(
                    name="extract_content",
                    description="Extract the main text content from a URL",
                    parameters={
                        "url": ParameterSpec(
                            type="string",
                            description="URL to extract content from",
                        ),
                    },
                    example='{"url": "https://en.wikipedia.org/wiki/Machine_learning"}',
                ),
                SkillMethod(
                    name="summarize_url",
                    description="Extract and summarize the content of a web page using LLM",
                    parameters={
                        "url": ParameterSpec(
                            type="string",
                            description="URL to summarize",
                        ),
                        "focus": ParameterSpec(
                            type="string",
                            description="What aspect to focus the summary on",
                            required=False,
                            default="",
                        ),
                    },
                    example='{"url": "https://arxiv.org/abs/2301.00001", "focus": "key contributions and methodology"}',
                ),
                SkillMethod(
                    name="research",
                    description="Multi-hop research: search → read top results → synthesize an answer",
                    parameters={
                        "question": ParameterSpec(
                            type="string",
                            description="Research question to investigate",
                        ),
                        "depth": ParameterSpec(
                            type="number",
                            description="How many sources to read (1-5)",
                            required=False,
                            default=3,
                        ),
                    },
                    example='{"question": "What are the latest developments in quantum computing?", "depth": 3}',
                ),
            ],
        )

    async def startup(self) -> None:
        from browser.manager import BrowserManager
        from nanobot.llm import LLM

        self._browser_mgr = BrowserManager.get_instance()
        self._llm = LLM()

    async def shutdown(self) -> None:
        pass

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "search":
                return await self._search(params["query"], params.get("count", 5))
            elif method == "extract_content":
                return await self._extract_content(params["url"])
            elif method == "summarize_url":
                return await self._summarize_url(
                    params["url"], params.get("focus", "")
                )
            elif method == "research":
                return await self._research(
                    params["question"], params.get("depth", 3)
                )
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"Web research error: {e}")

    # ── Private ────────────────────────────────────────────────

    async def _search(self, query: str, count: int) -> ToolResult:
        """Search via DuckDuckGo HTML results."""
        page = await self._browser_mgr.get_page(
            "research", DUCKDUCKGO_URL + quote_plus(query)
        )
        await asyncio.sleep(2)

        results = await page.evaluate(f"""
            () => {{
                const items = document.querySelectorAll('.results .result, article[data-testid="result"]');
                const out = [];
                for (const item of Array.from(items).slice(0, {count})) {{
                    const titleEl = item.querySelector('h2 a, a[data-testid="result-title-a"]');
                    const snippetEl = item.querySelector('.result__snippet, span[data-testid="result-snippet"]');
                    const linkEl = titleEl;
                    if (titleEl) {{
                        out.push({{
                            title: titleEl.innerText.trim(),
                            url: linkEl ? linkEl.href : '',
                            snippet: snippetEl ? snippetEl.innerText.trim() : '',
                        }});
                    }}
                }}
                return out;
            }}
        """)

        return self._ok({
            "query": query,
            "result_count": len(results),
            "results": results,
        })

    async def _extract_content(self, url: str) -> ToolResult:
        """Extract main text from a URL."""
        page = await self._browser_mgr.get_page("research", url)
        await asyncio.sleep(3)

        content = await page.evaluate("""
            () => {
                // Remove noise elements
                const selectors = ['nav', 'header', 'footer', '.sidebar', '.ad', '.menu', 'script', 'style'];
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                }
                
                // Try article body first
                const article = document.querySelector('article, [role="main"], main, .content, .post-content');
                if (article) return article.innerText.slice(0, 8000);
                
                // Fallback to body
                return document.body.innerText.slice(0, 8000);
            }
        """)

        title = await page.title()

        return self._ok({
            "url": url,
            "title": title,
            "content": content,
            "word_count": len(content.split()),
        })

    async def _summarize_url(self, url: str, focus: str) -> ToolResult:
        """Extract content and summarize with LLM."""
        # First extract
        extract_result = await self._extract_content(url)
        if not extract_result.success:
            return extract_result

        content = extract_result.data.get("content", "")
        title = extract_result.data.get("title", "")

        if not content:
            return self._err("No content extracted from URL.")

        focus_str = f"\nFocus on: {focus}" if focus else ""

        prompt = f"""Summarize the following web page content concisely.{focus_str}

Title: {title}
URL: {url}

Content:
{content[:6000]}

Provide a clear, structured summary with key points."""

        response = await self._llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        _, answer = self._llm.extract_thinking(response)

        return self._ok({
            "url": url,
            "title": title,
            "summary": answer,
        })

    async def _research(self, question: str, depth: int) -> ToolResult:
        """Multi-hop research: search → read → synthesize."""
        depth = min(max(depth, 1), 5)

        # Step 1: Search
        search_result = await self._search(question, depth + 2)
        if not search_result.success:
            return search_result

        results = search_result.data.get("results", [])
        if not results:
            return self._err("No search results found.")

        # Step 2: Extract content from top N results
        sources = []
        for result in results[:depth]:
            url = result.get("url", "")
            if not url:
                continue
            try:
                extract = await self._extract_content(url)
                if extract.success:
                    sources.append({
                        "title": result.get("title", ""),
                        "url": url,
                        "content": extract.data.get("content", "")[:3000],
                    })
            except Exception:
                continue

        if not sources:
            return self._err("Could not extract content from any results.")

        # Step 3: Synthesize with LLM
        source_text = "\n\n---\n\n".join(
            f"Source: {s['title']} ({s['url']})\n{s['content']}"
            for s in sources
        )

        prompt = f"""Based on the following sources, provide a comprehensive answer to the question.

Question: {question}

Sources:
{source_text[:12000]}

Instructions:
- Synthesize information from all sources
- Cite which source each claim comes from
- Be thorough but concise
- If sources disagree, note the disagreement"""

        response = await self._llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        _, answer = self._llm.extract_thinking(response)

        return self._ok({
            "question": question,
            "sources_consulted": len(sources),
            "sources": [{"title": s["title"], "url": s["url"]} for s in sources],
            "answer": answer,
        })
