"""Small SQLite persistence layer for a local hackathon prototype."""
from __future__ import annotations
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

DEFAULT_POLICIES = [
    ("spending-limit", "Spending limit", {"max_amount": 80.0}),
    ("approved-vendors", "Approved vendors", {"vendors": ["AudioMart", "Approved Audio", "StrideMart", "PackWorks", "CompuHub"]}),
    ("allowed-actions", "Allowed tool actions", {"actions": ["place_order", "view_product"]}),
    ("evidence-review", "Review suspicious evidence", {"require_review_for_suspicious": True}),
    ("decision-quality", "Decision evidence quality", {"require_review_if_insufficient": False, "min_independent_sources": 1, "require_comparison_for_best": True, "require_cost_quote": True}),
]


# Each visitor gets a private sandbox (workspace): their own policies, evaluations, reviews and
# audit history. The API sets the workspace per request from the X-TrustLayer-Workspace header;
# requests without it share the "default" workspace. Product listings stay global.
DEFAULT_WORKSPACE = "default"
_WORKSPACE_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_workspace: ContextVar[str] = ContextVar("trustlayer_workspace", default=DEFAULT_WORKSPACE)


def valid_workspace(value: str) -> bool:
    return bool(_WORKSPACE_ID.fullmatch(value))


def current_workspace() -> str:
    return _workspace.get()


def use_workspace(workspace_id: str):
    return _workspace.set(workspace_id)


def reset_workspace(token) -> None:
    _workspace.reset(token)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def database_path():
    configured = os.getenv("TRUSTLAYER_DB_PATH")
    if configured:
        return configured
    if os.getenv("VERCEL"):
        # Vercel functions only allow writes under /tmp; data resets on cold starts.
        return "/tmp/trustlayer.sqlite3"
    return str(Path(__file__).resolve().parent.parent / "trustlayer.sqlite3")


_initialized = set()


def database_url():
    return os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or None


def storage_backend():
    return "postgres" if database_url() else "sqlite"


class _PgConn:
    """Minimal sqlite-style facade over a psycopg connection so one code path serves both stores."""

    def __init__(self, conn):
        self._conn = conn

    @staticmethod
    def _translate(sql):
        sql = sql.replace("?", "%s")
        if re.match(r"\s*INSERT OR IGNORE", sql, re.I):
            sql = re.sub(r"INSERT OR IGNORE", "INSERT", sql, count=1, flags=re.I) + " ON CONFLICT DO NOTHING"
        elif re.match(r"\s*INSERT OR REPLACE INTO product_listings", sql, re.I):
            sql = re.sub(r"INSERT OR REPLACE", "INSERT", sql, count=1, flags=re.I) + (
                " ON CONFLICT (product_id) DO UPDATE SET provider=EXCLUDED.provider, search_id=EXCLUDED.search_id,"
                " record_json=EXCLUDED.record_json, retrieved_at=EXCLUDED.retrieved_at")
        return sql

    def execute(self, sql, params=()):
        if sql.strip().upper().startswith(("PRAGMA", "BEGIN")):
            return self._conn.cursor()
        cur = self._conn.cursor()
        cur.execute(self._translate(sql), tuple(params))
        return cur

    def executescript(self, script):
        for stmt in script.split(";"):
            if stmt.strip():
                self.execute(stmt)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


@contextmanager
def connect():
    path = database_path()
    if path not in _initialized:
        # Serverless hosts may skip the lifespan hook or start with an empty /tmp.
        init_db()
    conn = _open()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _open():
    url = database_url()
    if url:
        import psycopg
        from psycopg.rows import dict_row
        return _PgConn(psycopg.connect(url, row_factory=dict_row, connect_timeout=10, prepare_threshold=None))
    conn = sqlite3.connect(database_path(), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
          CREATE TABLE IF NOT EXISTS policies (
            workspace_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER NOT NULL,
            config_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, id)
          );
          CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, intent TEXT NOT NULL,
            request_json TEXT NOT NULL, result_json TEXT NOT NULL,
            policy_versions_json TEXT NOT NULL, review_status TEXT,
            created_at TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT 'default'
          );
          CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL UNIQUE,
            action_json TEXT NOT NULL, created_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS product_listings (
            product_id TEXT PRIMARY KEY, provider TEXT NOT NULL, search_id TEXT NOT NULL,
            record_json TEXT NOT NULL, retrieved_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY, evaluation_id TEXT, event_type TEXT NOT NULL,
            details_json TEXT NOT NULL, created_at TEXT NOT NULL,
            workspace_id TEXT NOT NULL DEFAULT 'default'
          );
          CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL,
            scopes_json TEXT NOT NULL, limits_json TEXT NOT NULL, key_hash TEXT,
            key_prefix TEXT, enabled INTEGER NOT NULL, created_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS trust_decisions (
            id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, task_id TEXT, decision TEXT NOT NULL,
            review_status TEXT, source TEXT NOT NULL, result_json TEXT NOT NULL,
            execution_json TEXT, created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS evaluations_by_workspace ON evaluations (workspace_id, created_at);
          CREATE INDEX IF NOT EXISTS audit_by_workspace ON audit_events (workspace_id, created_at)
"""


def init_db():
    path = database_path()
    _initialized.add(path)
    if not database_url():
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        _migrate_to_workspaces(c)
        c.executescript(SCHEMA)
        seed_policies(c, DEFAULT_WORKSPACE)
        from .trust import AGENTS
        for aid, a in AGENTS.items():
            c.execute("INSERT OR IGNORE INTO agents VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, ?)",
                      (aid, a["name"], a["domain"], json.dumps(a["scopes"]), json.dumps(a["limits"]), utc_now()))


def _columns(c, table):
    if database_url():
        rows = c.execute("SELECT column_name FROM information_schema.columns WHERE table_name=?", (table,)).fetchall()
        return {r["column_name"] for r in rows}
    return {r["name"] for r in c.execute(f"PRAGMA table_info({table})").fetchall()}


def _migrate_to_workspaces(c):
    """Upgrade a database created before workspaces existed; its data joins the default workspace."""
    if "id" in _columns(c, "policies") and "workspace_id" not in _columns(c, "policies"):
        c.executescript("""
          ALTER TABLE policies RENAME TO policies_before_workspaces;
          CREATE TABLE policies (
            workspace_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER NOT NULL,
            config_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, id)
          );
          INSERT INTO policies SELECT 'default', id, name, enabled, config_json, version, updated_at
            FROM policies_before_workspaces;
          DROP TABLE policies_before_workspaces
        """)
    for table in ("evaluations", "audit_events"):
        cols = _columns(c, table)
        if cols and "workspace_id" not in cols:
            c.execute(f"ALTER TABLE {table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'")


def seed_policies(c, workspace_id):
    """Give a workspace the default policies the first time it is used."""
    for pid, name, config in DEFAULT_POLICIES:
        c.execute("INSERT OR IGNORE INTO policies (workspace_id, id, name, enabled, config_json, version, updated_at)"
                  " VALUES (?, ?, ?, 1, ?, 1, ?)", (workspace_id, pid, name, json.dumps(config), utc_now()))


def list_policies():
    workspace_id = current_workspace()
    query = "SELECT * FROM policies WHERE workspace_id=? ORDER BY id"
    with connect() as c:
        rows = c.execute(query, (workspace_id,)).fetchall()
        # Seed only when something is missing: callers such as execute read policies while another
        # connection holds the write lock, so the common path must stay read-only.
        if {r["id"] for r in rows} < {pid for pid, _, _ in DEFAULT_POLICIES}:
            seed_policies(c, workspace_id)
            rows = c.execute(query, (workspace_id,)).fetchall()
    return [{"id": r["id"], "name": r["name"], "enabled": bool(r["enabled"]),
             "config": json.loads(r["config_json"]), "version": r["version"],
             "updated_at": r["updated_at"]} for r in rows]


def policy_versions():
    return {p["id"]: p["version"] for p in list_policies()}


def add_audit(event_type, evaluation_id=None, details=None, *, conn=None):
    sql = ("INSERT INTO audit_events (id, evaluation_id, event_type, details_json, created_at, workspace_id)"
           " VALUES (?, ?, ?, ?, ?, ?)")
    payload = (str(uuid4()), evaluation_id, event_type, json.dumps(details or {}), utc_now(), current_workspace())
    if conn is not None:
        conn.execute(sql, payload)
    else:
        with connect() as c:
            c.execute(sql, payload)


def store_evaluation(req, result):
    with connect() as c:
        c.execute("INSERT INTO evaluations (id, agent_id, intent, request_json, result_json, policy_versions_json,"
                  " review_status, created_at, workspace_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                  (result["evaluation_id"], req.agent_id, req.intent,
                   req.model_dump_json(), json.dumps(result),
                   json.dumps(result["policy_versions"]), result["created_at"], current_workspace()))
        add_audit("EVALUATED", result["evaluation_id"],
                  {"decision": result["decision"], "checks": result["checks"]}, conn=c)


def find_evaluation(evaluation_id):
    with connect() as c:
        row = c.execute("SELECT * FROM evaluations WHERE id=? AND workspace_id=?",
                        (evaluation_id, current_workspace())).fetchone()
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
        rows = c.execute("SELECT id FROM evaluations WHERE workspace_id=? ORDER BY created_at DESC LIMIT ?",
                         (current_workspace(), limit)).fetchall()
    return [find_evaluation(r["id"])["result"] for r in rows]


def list_audit(limit=200):
    with connect() as c:
        rows = c.execute("SELECT * FROM audit_events WHERE workspace_id=? ORDER BY created_at DESC LIMIT ?",
                         (current_workspace(), limit)).fetchall()
    return [{"id": r["id"], "evaluation_id": r["evaluation_id"], "event_type": r["event_type"],
             "details": json.loads(r["details_json"]), "created_at": r["created_at"]} for r in rows]


def save_listings(search_id, records):
    """Persist server-retrieved provider listings so later checks never rely on caller-supplied values."""
    with connect() as c:
        for r in records:
            c.execute("INSERT OR REPLACE INTO product_listings VALUES (?, ?, ?, ?, ?)",
                      (r["product_id"], r["provider"], search_id, json.dumps({**r, "search_id": search_id}),
                       r["retrieved_at"]))


def get_listing(product_id):
    if not isinstance(product_id, str):
        return None
    with connect() as c:
        row = c.execute("SELECT record_json FROM product_listings WHERE product_id=?", (product_id,)).fetchone()
    return json.loads(row["record_json"]) if row else None


def listings_for_search(search_id):
    with connect() as c:
        rows = c.execute("SELECT record_json FROM product_listings WHERE search_id=?", (search_id,)).fetchall()
    return [json.loads(r["record_json"]) for r in rows]
