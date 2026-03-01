"""
Form Filler Skill — auto-fill web forms using student profile data via Playwright.

Features:
- Auto-fill any web form (hackathons, internships, university forms)
- Matches form fields to student profile intelligently using LLM
- Handles multi-page forms
- Can fill and optionally auto-submit
- Uses persistent browser context for authenticated forms
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx

from nanobot.types import (
    ParameterSpec,
    SkillManifest,
    SkillMethod,
    ToolResult,
)
from skills.base import BaseSkill

NEXUS_API = os.getenv("NEXUS_API_URL", "http://localhost:3000")


class FormFillerSkill(BaseSkill):
    """Auto-fill web forms using student profile + LLM field mapping."""

    def __init__(self):
        super().__init__()
        self._browser_mgr: Any = None
        self._llm: Any = None
        self._student_profile: dict | None = None

    def manifest(self) -> SkillManifest:
        return SkillManifest(
            name="form_filler",
            description="Auto-fill web forms (hackathons, internships, applications) using student profile",
            category="automation",
            requires_browser=True,
            methods=[
                SkillMethod(
                    name="fill_form",
                    description="Navigate to a URL and auto-fill visible form fields",
                    parameters={
                        "url": ParameterSpec(
                            type="string",
                            description="URL of the form to fill",
                        ),
                        "context": ParameterSpec(
                            type="string",
                            description="Additional context (e.g. 'hackathon registration', 'internship application')",
                            required=False,
                            default="",
                        ),
                        "auto_submit": ParameterSpec(
                            type="boolean",
                            description="Whether to auto-submit after filling",
                            required=False,
                            default=False,
                        ),
                    },
                    example='{"url": "https://unstop.com/hackathon/form", "context": "ML hackathon registration", "auto_submit": false}',
                ),
                SkillMethod(
                    name="analyze_form",
                    description="Analyze a form's fields without filling them",
                    parameters={
                        "url": ParameterSpec(
                            type="string",
                            description="URL of the form to analyze",
                        ),
                    },
                    example='{"url": "https://forms.google.com/d/e/xxx"}',
                ),
                SkillMethod(
                    name="fill_current_page",
                    description="Fill the form on the currently open page in a browser context",
                    parameters={
                        "context_name": ParameterSpec(
                            type="string",
                            description="Browser context name where the form is open",
                            required=False,
                            default="forms",
                        ),
                        "auto_submit": ParameterSpec(
                            type="boolean",
                            description="Whether to auto-submit after filling",
                            required=False,
                            default=False,
                        ),
                    },
                ),
                SkillMethod(
                    name="refresh_profile",
                    description="Reload student profile from NEXUS database",
                    parameters={},
                ),
            ],
        )

    async def startup(self) -> None:
        from browser.manager import BrowserManager
        from nanobot.llm import LLM

        self._browser_mgr = BrowserManager.get_instance()
        self._llm = LLM()
        await self._load_profile()

    async def shutdown(self) -> None:
        if self._browser_mgr:
            await self._browser_mgr.save_state("forms")

    async def execute(self, method: str, params: dict[str, Any]) -> ToolResult:
        try:
            if method == "fill_form":
                return await self._fill_form(
                    params["url"],
                    params.get("context", ""),
                    params.get("auto_submit", False),
                )
            elif method == "analyze_form":
                return await self._analyze_form(params["url"])
            elif method == "fill_current_page":
                return await self._fill_current_page(
                    params.get("context_name", "forms"),
                    params.get("auto_submit", False),
                )
            elif method == "refresh_profile":
                await self._load_profile()
                return self._ok({"profile": self._student_profile})
            else:
                return self._err(f"Unknown method: {method}")
        except Exception as e:
            return self._err(f"Form filler error: {e}")

    # ── Private ────────────────────────────────────────────────

    async def _load_profile(self) -> None:
        """Load student profile from NEXUS database."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{NEXUS_API}/api/student", timeout=10.0
                )
                if resp.status_code == 200:
                    self._student_profile = resp.json()
                    return
        except Exception:
            pass

        # Minimal fallback
        self._student_profile = {
            "name": os.getenv("STUDENT_NAME", ""),
            "email": os.getenv("STUDENT_EMAIL", ""),
            "university": os.getenv("STUDENT_UNIVERSITY", ""),
            "major": os.getenv("STUDENT_MAJOR", ""),
            "year": os.getenv("STUDENT_YEAR", ""),
        }

    async def _extract_form_fields(self, page: Any) -> list[dict]:
        """Extract all fillable form fields from a page."""
        fields = await page.evaluate("""
            () => {
                const fields = [];
                const inputs = document.querySelectorAll(
                    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
                    'textarea, select'
                );
                for (const el of inputs) {
                    const label = el.labels?.[0]?.innerText ||
                        el.getAttribute('aria-label') ||
                        el.getAttribute('placeholder') ||
                        el.getAttribute('name') ||
                        el.id || '';
                    
                    const field = {
                        type: el.tagName.toLowerCase() === 'select' ? 'select' : 
                              (el.getAttribute('type') || 'text'),
                        label: label.trim(),
                        name: el.getAttribute('name') || '',
                        id: el.id || '',
                        placeholder: el.getAttribute('placeholder') || '',
                        required: el.required,
                        value: el.value || '',
                        options: [],
                    };
                    
                    if (el.tagName.toLowerCase() === 'select') {
                        field.options = Array.from(el.options).map(o => ({
                            value: o.value,
                            text: o.text,
                        }));
                    }
                    
                    // Also check for radio buttons and checkboxes
                    if (field.type === 'radio' || field.type === 'checkbox') {
                        const group = document.querySelectorAll(`input[name="${el.name}"]`);
                        field.options = Array.from(group).map(r => ({
                            value: r.value,
                            text: r.labels?.[0]?.innerText || r.value,
                        }));
                    }
                    
                    fields.push(field);
                }
                
                // Also check for Google Forms style fields
                const gFormItems = document.querySelectorAll('[data-params]');
                for (const item of gFormItems) {
                    const title = item.querySelector('[role="heading"]');
                    if (title) {
                        fields.push({
                            type: 'google_form_field',
                            label: title.innerText.trim(),
                            name: '',
                            id: item.getAttribute('data-item-id') || '',
                        });
                    }
                }
                
                return fields;
            }
        """)

        return fields

    async def _map_fields_to_profile(
        self, fields: list[dict], context: str
    ) -> dict[str, str]:
        """Use LLM to intelligently map form fields to student profile data."""
        prompt = f"""You are a form-filling assistant. Map form fields to the student's profile data.

Student Profile:
{json.dumps(self._student_profile, indent=2)}

Context: {context}

Form Fields:
{json.dumps(fields, indent=2)}

Return a JSON object where keys are field identifiers (use 'id' if available, else 'name', else 'label')
and values are what to fill in. Only include fields you can confidently fill.
Use the student's real data. For fields not in the profile, use reasonable defaults or skip.
For select/radio fields, choose the best matching option value.

Return ONLY valid JSON, no explanation."""

        response = await self._llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )

        mapping = self._llm.extract_json(response)
        return mapping or {}

    async def _fill_form(
        self, url: str, context: str, auto_submit: bool
    ) -> ToolResult:
        page = await self._browser_mgr.get_page("forms", url)
        await asyncio.sleep(3)  # Let page fully render

        # Extract fields
        fields = await self._extract_form_fields(page)
        if not fields:
            return self._err("No form fields found on the page.")

        # Map fields to profile
        mapping = await self._map_fields_to_profile(fields, context)
        if not mapping:
            return self._err("Could not map any fields to your profile.")

        # Fill fields
        filled = []
        failed = []

        for field_id, value in mapping.items():
            try:
                # Try various selector strategies
                selectors = [
                    f"#{field_id}",
                    f"[name='{field_id}']",
                    f"[aria-label='{field_id}']",
                    f"[placeholder='{field_id}']",
                ]

                element = None
                for sel in selectors:
                    try:
                        element = await page.query_selector(sel)
                        if element:
                            break
                    except Exception:
                        continue

                if not element:
                    # Try by label text
                    try:
                        element = await page.query_selector(
                            f"label:has-text('{field_id}') + input, "
                            f"label:has-text('{field_id}') + textarea, "
                            f"label:has-text('{field_id}') + select"
                        )
                    except Exception:
                        pass

                if element:
                    tag = await element.evaluate("el => el.tagName.toLowerCase()")
                    input_type = await element.evaluate(
                        "el => el.getAttribute('type') || 'text'"
                    )

                    if tag == "select":
                        await element.select_option(value=str(value))
                    elif input_type in ("radio", "checkbox"):
                        await element.check()
                    else:
                        await element.click()
                        await element.fill("")
                        await element.fill(str(value))

                    filled.append({"field": field_id, "value": str(value)[:50]})
                else:
                    failed.append({"field": field_id, "reason": "Element not found"})
            except Exception as e:
                failed.append({"field": field_id, "reason": str(e)[:100]})

        # Screenshot for verification
        screenshot_path = await self._browser_mgr.screenshot("forms", "filled_form")

        result: dict[str, Any] = {
            "url": url,
            "fields_found": len(fields),
            "fields_filled": len(filled),
            "fields_failed": len(failed),
            "filled": filled,
            "failed": failed,
            "screenshot": screenshot_path,
        }

        if auto_submit and filled:
            try:
                submit = await page.query_selector(
                    'button[type="submit"], input[type="submit"]'
                )
                if submit:
                    await submit.click()
                    await asyncio.sleep(2)
                    result["submitted"] = True
                    result["submit_screenshot"] = await self._browser_mgr.screenshot(
                        "forms", "post_submit"
                    )
            except Exception as e:
                result["submitted"] = False
                result["submit_error"] = str(e)

        return self._ok(result)

    async def _analyze_form(self, url: str) -> ToolResult:
        page = await self._browser_mgr.get_page("forms", url)
        await asyncio.sleep(3)

        fields = await self._extract_form_fields(page)
        screenshot_path = await self._browser_mgr.screenshot("forms", "form_analysis")

        # Categorize fields
        fillable = [f for f in fields if self._can_fill(f)]
        needs_input = [f for f in fields if not self._can_fill(f)]

        return self._ok({
            "url": url,
            "total_fields": len(fields),
            "auto_fillable": len(fillable),
            "needs_manual_input": len(needs_input),
            "fields": fields,
            "screenshot": screenshot_path,
        })

    async def _fill_current_page(
        self, context_name: str, auto_submit: bool
    ) -> ToolResult:
        ctx = await self._browser_mgr.get_context(context_name)
        pages = ctx.pages
        if not pages:
            return self._err(f"No pages open in context '{context_name}'")

        page = pages[-1]  # Use the most recent page
        url = page.url

        fields = await self._extract_form_fields(page)
        if not fields:
            return self._err("No form fields on current page.")

        mapping = await self._map_fields_to_profile(fields, "")

        filled_count = 0
        for field_id, value in mapping.items():
            try:
                el = await page.query_selector(
                    f"#{field_id}, [name='{field_id}']"
                )
                if el:
                    await el.fill(str(value))
                    filled_count += 1
            except Exception:
                pass

        return self._ok({
            "url": url,
            "fields_filled": filled_count,
            "total_fields": len(fields),
        })

    def _can_fill(self, field: dict) -> bool:
        """Check if we have data for this field in the student profile."""
        if not self._student_profile:
            return False
        label = (field.get("label", "") + field.get("placeholder", "")).lower()
        keywords = {
            "name", "email", "university", "college", "gpa", "cgpa",
            "major", "branch", "year", "phone", "github", "linkedin",
            "resume", "portfolio", "website",
        }
        return any(kw in label for kw in keywords)
