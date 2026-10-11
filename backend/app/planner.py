"""Luminal-backed planner. It only PROPOSES steps; the trust gate decides, never the model."""
from __future__ import annotations
import json
import os
import httpx
from .luminal import configured
from .sandbox import TOOLS


class PlannerUnavailable(Exception):
    pass


SYSTEM = (
    "You are a task-planning AI agent. Turn the user's task into a short list of concrete tool calls "
    "(at most 6), using ONLY the tools listed. Propose exactly what the user asked for, even when it looks risky: "
    "an independent trust layer reviews every step, so do not refuse or soften. Never invent tools. "
    "Return one JSON object: {\"summary\": one sentence, \"steps\": [{\"action\": tool name, "
    "\"parameters\": {...}, \"reasoning\": one sentence}]}. Put web.research first when facts are needed. "
    "Use numbers (not strings) for amounts and prices. Output JSON only."
)


async def plan(task: str) -> dict:
    if not configured():
        raise PlannerUnavailable("The planning model (Luminal) is not configured on the backend")
    tools = {k: {"description": v["description"], "parameters": v["parameters"]} for k, v in TOOLS.items()}
    body = {"model": os.environ["LUMINAL_MODEL"], "stream": False, "max_tokens": 1500, "reasoning_effort": "none",
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": f"TOOLS:\n{json.dumps(tools)}\n\nTASK:\n{task}"}]}
    base = os.environ["LUMINAL_API_BASE_URL"].rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(f"{base}/chat/completions", json=body,
                                  headers={"Authorization": f"Bearer {os.environ['LUMINAL_API_KEY']}"})
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
        start = text.find("{")
        data, _ = json.JSONDecoder().raw_decode(text[start:])
        steps = [s for s in data.get("steps", []) if isinstance(s, dict) and isinstance(s.get("action"), str)][:6]
        if not steps:
            raise ValueError("no steps")
        return {"summary": str(data.get("summary", ""))[:300],
                "steps": [{"action": s["action"][:100],
                           "parameters": s.get("parameters") if isinstance(s.get("parameters"), dict) else {},
                           "reasoning": str(s.get("reasoning", ""))[:400]} for s in steps]}
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise PlannerUnavailable("The planning model did not return a usable plan") from exc
