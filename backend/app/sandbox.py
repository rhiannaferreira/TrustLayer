"""Sandbox tools. Only ALLOWED (or human-approved) actions ever reach these.

Everything here is clearly labelled: web research is a real Tavily lookup; the database tool runs
against a throwaway in-memory demo database; email, deletion, payment and purchase are simulated
and contact no external system.
"""
from __future__ import annotations
import sqlite3
from typing import Any
from .web_search import WebSearchUnavailable, research

TOOLS: dict[str, dict[str, Any]] = {
    "web.research": {"mode": "live", "description": "Search the web (Tavily) and return a short answer with sources.",
                     "parameters": {"query": "string"}},
    "db.run_query": {"mode": "sandbox", "description": "Run one SQL statement on the demo database (tables: customers, orders).",
                     "parameters": {"sql": "string", "environment": "production|staging|dev"}},
    "data.read_records": {"mode": "simulated", "description": "Read customer records.",
                          "parameters": {"fields": "list of field names", "record_count": "number", "purpose": "string"}},
    "workplace.send_email": {"mode": "simulated", "description": "Send an email.",
                             "parameters": {"recipients": "list of addresses", "subject": "string", "contains_confidential": "boolean", "company_domain": "@company.com"}},
    "workplace.delete_files": {"mode": "simulated", "description": "Delete files.",
                               "parameters": {"file_count": "number", "path": "string", "backed_up": "boolean"}},
    "commerce.purchase": {"mode": "simulated", "description": "Buy an item.",
                          "parameters": {"item": "string", "price": "number in USD", "vendor": "string"}},
    "finance.pay_invoice": {"mode": "simulated", "description": "Pay an invoice (needs an invoice as evidence).",
                            "parameters": {"amount": "number in USD", "payee": "string"}},
    "finance.transfer_funds": {"mode": "simulated", "description": "Send money to an account.",
                               "parameters": {"amount": "number in USD", "payee": "string"}},
    "data.export_records": {"mode": "simulated", "description": "Export records to a destination.",
                            "parameters": {"fields": "list", "record_count": "number", "destination": "string", "purpose": "string"}},
    "workplace.grant_access": {"mode": "simulated", "description": "Grant a user a role.",
                               "parameters": {"user": "string", "role": "viewer|editor|admin|owner"}},
    "health.suggest_medication": {"mode": "simulated", "description": "Suggest a medication.",
                                  "parameters": {"drug": "string", "daily_dose_mg": "number"}},
}


def _demo_db() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.executescript("""
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, country TEXT, plan TEXT);
      INSERT INTO customers VALUES (1,'Ada Lovelace','UK','pro'),(2,'Grace Hopper','US','team'),
        (3,'Alan Turing','UK','free'),(4,'Katherine Johnson','US','pro');
      CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, total REAL, month TEXT);
      INSERT INTO orders VALUES (1,1,120.0,'2026-09'),(2,2,480.0,'2026-09'),(3,4,60.0,'2026-10');
    """)
    return c


async def execute(action: str, params: dict[str, Any]) -> dict[str, Any]:
    mode = TOOLS.get(action, {}).get("mode", "simulated")
    try:
        if action == "web.research":
            r = await research(str(params.get("query", "")), max_results=4)
            return {"status": "executed", "mode": mode, "summary": (r.get("answer") or "")[:600],
                    "sources": [{"title": s["title"], "url": s["url"], "snippet": s.get("snippet", "")[:300]} for s in r["sources"][:4]]}
        if action == "db.run_query":
            conn = _demo_db()
            cur = conn.execute(str(params.get("sql", "")))
            rows = cur.fetchmany(20)
            cols = [d[0] for d in cur.description] if cur.description else []
            return {"status": "executed", "mode": mode, "columns": cols, "rows": rows,
                    "summary": f"Ran on a throwaway demo database; {len(rows)} row(s) returned." if cols else
                               f"Ran on a throwaway demo database; {cur.rowcount} row(s) changed (discarded afterwards)."}
    except WebSearchUnavailable as exc:
        return {"status": "error", "mode": mode, "summary": str(exc)}
    except sqlite3.Error as exc:
        return {"status": "error", "mode": mode, "summary": f"SQL error: {exc}"}
    return {"status": "executed", "mode": "simulated",
            "summary": f"Simulated {action}. No real system was contacted."}
