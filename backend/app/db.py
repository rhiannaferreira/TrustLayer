"""Small SQLite persistence layer for a local hackathon prototype."""
from __future__ import annotations
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

DEFAULT_POLICIES = [
    ("spending-limit", "Spending limit", {"max_amount": 80.0}),
    ("approved-vendors", "Approved vendors", {"vendors": ["AudioMart", "Approved Audio", "StrideCo Demo", "Everyday Market Demo"]}),
    ("allowed-actions", "Allowed tool actions", {"actions": ["place_order", "view_product"]}),
    ("evidence-review", "Review suspicious evidence", {"require_review_for_suspicious": True}),
    ("decision-quality", "Decision evidence quality", {"require_review_if_insufficient": False, "min_independent_sources": 1, "require_comparison_for_best": True, "require_cost_quote": True}),
]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def database_path():
    return os.getenv("TRUSTLAYER_DB_PATH", str(Path(__file__).resolve().parent.parent / "trustlayer.sqlite3"))


@contextmanager
def connect():
    conn = sqlite3.connect(database_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    Path(database_path()).parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript("""
          CREATE TABLE IF NOT EXISTS policies (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL,
            config_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, intent TEXT NOT NULL,
            request_json TEXT NOT NULL, result_json TEXT NOT NULL,
            policy_versions_json TEXT NOT NULL, review_status TEXT,
            created_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL UNIQUE,
            action_json TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(evaluation_id) REFERENCES evaluations(id)
          );
          CREATE TABLE IF NOT EXISTS live_products (
            product_id TEXT PRIMARY KEY, provider TEXT NOT NULL,
            data_json TEXT NOT NULL, retrieved_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY, evaluation_id TEXT, event_type TEXT NOT NULL,
            details_json TEXT NOT NULL, created_at TEXT NOT NULL
          );
        """)
        for pid, name, config in DEFAULT_POLICIES:
            c.execute("INSERT OR IGNORE INTO policies VALUES (?, ?, 1, ?, 1, ?)",
                      (pid, name, json.dumps(config), utc_now()))


def list_policies():
    with connect() as c:
        rows = c.execute("SELECT * FROM policies ORDER BY id").fetchall()
    return [{"id": r["id"], "name": r["name"], "enabled": bool(r["enabled"]),
             "config": json.loads(r["config_json"]), "version": r["version"],
             "updated_at": r["updated_at"]} for r in rows]


def policy_versions():
    return {p["id"]: p["version"] for p in list_policies()}


def add_audit(event_type, evaluation_id=None, details=None, *, conn=None):
    payload = (str(uuid4()), evaluation_id, event_type, json.dumps(details or {}), utc_now())
    if conn is not None:
        conn.execute("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)", payload)
    else:
        with connect() as c:
            c.execute("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)", payload)


def store_evaluation(req, result):
    with connect() as c:
        c.execute("INSERT INTO evaluations VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
                  (result["evaluation_id"], req.agent_id, req.intent,
                   req.model_dump_json(), json.dumps(result),
                   json.dumps(result["policy_versions"]), result["created_at"]))
        add_audit("EVALUATED", result["evaluation_id"],
                  {"decision": result["decision"], "checks": result["checks"]}, conn=c)


def find_evaluation(evaluation_id):
    with connect() as c:
        row = c.execute("SELECT * FROM evaluations WHERE id=?", (evaluation_id,)).fetchone()
        executed = c.execute("SELECT id FROM executions WHERE evaluation_id=?", (evaluation_id,)).fetchone()
    if not row:
        return None
    result = json.loads(row["result_json"])
    result["review_status"] = row["review_status"]
    result["executed"] = bool(executed)
    result["execution_allowed"] = (
        (result["decision"] == "ALLOW" or
         (result["decision"] == "REVIEW_REQUIRED" and row["review_status"] == "APPROVE"))
        and not bool(executed)
        and json.loads(row["policy_versions_json"]) == policy_versions()
    )
    return {"request": json.loads(row["request_json"]), "result": result,
            "policy_versions": json.loads(row["policy_versions_json"])}


def list_evaluations(limit=100):
    with connect() as c:
        rows = c.execute("SELECT id FROM evaluations ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [find_evaluation(r["id"])["result"] for r in rows]


def list_audit(limit=200):
    with connect() as c:
        rows = c.execute("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [{"id": r["id"], "evaluation_id": r["evaluation_id"], "event_type": r["event_type"],
             "details": json.loads(r["details_json"]), "created_at": r["created_at"]} for r in rows]


def save_live_products(products):
    """Store verified provider response snapshots; never accept these from the frontend."""
    with connect() as c:
        for product in products:
            provider = product.get("provider")
            if provider not in {"ebay", "serper"} or not isinstance(product.get("product_id"), str) or not product["product_id"].startswith(provider + ":"):
                raise ValueError("Only verified live retailer search snapshots are supported")
            c.execute("INSERT OR REPLACE INTO live_products VALUES (?, ?, ?, ?)",
                      (product["product_id"], provider, json.dumps(product), utc_now()))


def get_live_product(product_id, max_age_seconds=900):
    """Return recently retrieved server-side listing data or None if stale/unverified."""
    from datetime import timedelta
    with connect() as c:
        row = c.execute("SELECT * FROM live_products WHERE product_id=?", (product_id,)).fetchone()
    if not row or row["provider"] not in {"ebay", "serper"} or not product_id.startswith(row["provider"] + ":"):
        return None
    if datetime.fromisoformat(row["retrieved_at"]) < datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds):
        return None
    return json.loads(row["data_json"])
