"""Agents, API keys, decisions, review queue and stats for the trust gate."""
from __future__ import annotations
import hashlib
import json
import secrets
from typing import Any
from uuid import uuid4
from . import db
from .trust import ACTIONS


def _row_agent(r) -> dict[str, Any]:
    return {"id": r["id"], "name": r["name"], "domain": r["domain"], "scopes": json.loads(r["scopes_json"]),
            "limits": json.loads(r["limits_json"]), "has_key": bool(r["key_hash"]), "key_prefix": r["key_prefix"],
            "enabled": bool(r["enabled"]), "created_at": r["created_at"]}


def list_agents():
    with db.connect() as c:
        return [_row_agent(r) for r in c.execute("SELECT * FROM agents ORDER BY created_at, id").fetchall()]


def get_agent(agent_id: str):
    with db.connect() as c:
        r = c.execute("SELECT * FROM agents WHERE id=?", (agent_id,)).fetchone()
    return _row_agent(r) if r else None


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def issue_key(agent_id: str) -> str:
    key = "tl_" + secrets.token_urlsafe(24)
    with db.connect() as c:
        c.execute("UPDATE agents SET key_hash=?, key_prefix=? WHERE id=?", (_hash(key), key[:9], agent_id))
        db.add_audit("API_KEY_ISSUED", details={"agent_id": agent_id, "prefix": key[:9]}, conn=c)
    return key


def agent_for_key(key: str):
    with db.connect() as c:
        r = c.execute("SELECT * FROM agents WHERE key_hash=?", (_hash(key),)).fetchone()
    a = _row_agent(r) if r else None
    return a if a and a["enabled"] else None


def create_agent(name: str, scopes: list[str], limits: dict) -> dict:
    agent_id = "agent-" + uuid4().hex[:8]
    with db.connect() as c:
        c.execute("INSERT INTO agents VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?)",
                  (agent_id, name, "custom", json.dumps([s for s in scopes if s in ACTIONS]), json.dumps(limits), db.utc_now()))
        db.add_audit("AGENT_CREATED", details={"agent_id": agent_id, "name": name, "scopes": scopes}, conn=c)
    return get_agent(agent_id)


def update_agent(agent_id: str, *, scopes=None, limits=None, enabled=None):
    cur = get_agent(agent_id)
    if not cur:
        return None
    scopes = cur["scopes"] if scopes is None else [s for s in scopes if s in ACTIONS]
    limits = cur["limits"] if limits is None else {**cur["limits"], **limits}
    enabled = cur["enabled"] if enabled is None else enabled
    with db.connect() as c:
        c.execute("UPDATE agents SET scopes_json=?, limits_json=?, enabled=? WHERE id=?",
                  (json.dumps(scopes), json.dumps(limits), int(enabled), agent_id))
        db.add_audit("AGENT_POLICY_UPDATED", details={"agent_id": agent_id, "scopes": scopes, "limits": limits, "enabled": enabled}, conn=c)
    return get_agent(agent_id)


def save_decision(result: dict, *, source: str, task_id: str | None = None, execution: dict | None = None):
    status = "PENDING" if result["decision"] == "REVIEW" else None
    with db.connect() as c:
        c.execute("INSERT INTO trust_decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                  (result["evaluation_id"], result["agent_id"], task_id, result["decision"], status, source,
                   json.dumps(result), json.dumps(execution) if execution else None, result["created_at"]))
        db.add_audit("TRUST_DECISION", result["evaluation_id"],
                     {"agent_id": result["agent_id"], "action": result["action"], "decision": result["decision"],
                      "risk_score": result["risk_score"], "reason": result["reason"], "source": source}, conn=c)


def _row_decision(r) -> dict:
    d = json.loads(r["result_json"])
    d.update({"review_status": r["review_status"], "source": r["source"], "task_id": r["task_id"],
              "execution": json.loads(r["execution_json"]) if r["execution_json"] else None})
    return d


def get_decision(decision_id: str):
    with db.connect() as c:
        r = c.execute("SELECT * FROM trust_decisions WHERE id=?", (decision_id,)).fetchone()
    return _row_decision(r) if r else None


def list_decisions(limit=100, pending_only=False):
    sql = "SELECT * FROM trust_decisions" + (" WHERE review_status='PENDING'" if pending_only else "") + " ORDER BY created_at DESC LIMIT ?"
    with db.connect() as c:
        return [_row_decision(r) for r in c.execute(sql, (limit,)).fetchall()]


def record_review(decision_id: str, verdict: str, reviewer: str, execution: dict | None):
    with db.connect() as c:
        cur = c.execute("UPDATE trust_decisions SET review_status=?, execution_json=? WHERE id=? AND review_status='PENDING'",
                        ("APPROVED" if verdict == "APPROVE" else "REJECTED", json.dumps(execution) if execution else None, decision_id))
        if cur.rowcount != 1:
            return False
        db.add_audit("REVIEW_" + ("APPROVED" if verdict == "APPROVE" else "REJECTED"), decision_id,
                     {"reviewer": reviewer, "executed": bool(execution)}, conn=c)
    return True


def stats() -> dict:
    with db.connect() as c:
        rows = c.execute("SELECT decision, review_status, agent_id FROM trust_decisions").fetchall()
    total = len(rows)
    by = {"ALLOW": 0, "REVIEW": 0, "BLOCK": 0}
    for r in rows:
        by[r["decision"]] = by.get(r["decision"], 0) + 1
    return {"total": total, "allowed": by["ALLOW"], "held_for_review": by["REVIEW"], "blocked": by["BLOCK"],
            "pending_reviews": sum(1 for r in rows if r["review_status"] == "PENDING"),
            "agents_seen": len({r["agent_id"] for r in rows}), "storage": db.storage_backend()}
