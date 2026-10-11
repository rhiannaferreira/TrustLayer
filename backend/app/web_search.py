"""General web research via the Tavily search API.

Results are labeled as unverified web evidence. They are never treated as a priced,
purchasable listing. The API key is read from the backend environment only
(``TAVILY_API_KEY``) and is never returned in responses or errors.
"""
from __future__ import annotations
import os
from typing import Any

import httpx

from .db import utc_now

TAVILY_URL = "https://api.tavily.com/search"


class WebSearchUnavailable(Exception):
    """Web search is not configured or failed. Message is safe to show."""


def web_search_status() -> dict[str, Any]:
    configured = bool(os.getenv("TAVILY_API_KEY"))
    return {"provider": "tavily", "configured": configured, "missing": [] if configured else ["TAVILY_API_KEY"]}


async def research(query: str, *, max_results: int = 5, include_answer: bool = True) -> dict[str, Any]:
    key = os.getenv("TAVILY_API_KEY")
    if not key:
        raise WebSearchUnavailable("Web search is not configured on the backend (TAVILY_API_KEY)")
    timeout = float(os.getenv("WEB_SEARCH_TIMEOUT_SECONDS", "15"))
    body = {"query": query, "max_results": max(1, min(max_results, 10)), "include_answer": include_answer,
            "search_depth": "basic"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(TAVILY_URL, json=body, headers={"Authorization": f"Bearer {key}"})
        if response.status_code != 200:
            raise WebSearchUnavailable(f"Web search failed (HTTP {response.status_code})")
        data = response.json()
    except WebSearchUnavailable:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise WebSearchUnavailable(f"Web search unavailable ({type(exc).__name__})") from exc
    raw = data.get("results") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        raise WebSearchUnavailable("Web search returned an unexpected response shape")
    now = utc_now()
    sources = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or not isinstance(item.get("url"), str) or not isinstance(item.get("title"), str):
            continue
        content = item.get("content") if isinstance(item.get("content"), str) else ""
        sources.append({"id": f"web-{i + 1}", "title": item["title"][:300], "url": item["url"],
                        "snippet": content[:1000], "score": item.get("score") if isinstance(item.get("score"), (int, float)) else None,
                        "source": "tavily_web_search", "provenance": "web_search", "retrieved_at": now})
    answer = data.get("answer") if isinstance(data.get("answer"), str) else None
    return {"query": query, "provider": "tavily", "answer": answer, "sources": sources,
            "notes": ["Web results are unverified third-party content. Check the sources before acting on them."],
            "retrieved_at": now}
