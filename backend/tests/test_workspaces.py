import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from app import db
from app.main import app

ACME = {"X-TrustLayer-Workspace": "acme-sandbox-1"}
GLOBEX = {"X-TrustLayer-Workspace": "globex-sandbox-2"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "test.sqlite3"))
    for key in ("LUMINAL_API_KEY", "LUMINAL_API_BASE_URL", "LUMINAL_MODEL"):
        monkeypatch.delenv(key, raising=False)
    with TestClient(app) as test_client:
        yield test_client


def evaluate(client, headers, scenario):
    # An intent with no stated budget, so only the workspace's spending limit decides on price.
    body = {"scenario": scenario, "intent": "Find the best premium wireless headphones"}
    proposal = client.post("/api/v1/agent/propose", json=body, headers=headers).json()
    response = client.post("/api/v1/evaluations", json=proposal, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def limit(client, headers):
    policies = client.get("/api/v1/policies", headers=headers).json()
    return next(p for p in policies if p["id"] == "spending-limit")["config"]["max_amount"]


def test_each_workspace_has_its_own_rules(client):
    r = client.patch("/api/v1/policies/spending-limit", json={"config": {"max_amount": 150}}, headers=ACME)
    assert r.status_code == 200, r.text
    assert limit(client, ACME) == 150
    assert limit(client, GLOBEX) == 80
    assert limit(client, {}) == 80

    # The $129 budget scenario is allowed under Acme's rules and blocked under everyone else's.
    assert evaluate(client, ACME, "budget")["decision"] == "ALLOW"
    assert evaluate(client, GLOBEX, "budget")["decision"] == "BLOCK"
    assert evaluate(client, {}, "budget")["decision"] == "BLOCK"


def test_history_and_audit_stay_private(client):
    acme_eval = evaluate(client, ACME, "valid")
    evaluate(client, GLOBEX, "prompt_injection")

    acme_ids = [e["evaluation_id"] for e in client.get("/api/v1/evaluations", headers=ACME).json()]
    globex_ids = [e["evaluation_id"] for e in client.get("/api/v1/evaluations", headers=GLOBEX).json()]
    assert acme_ids == [acme_eval["evaluation_id"]]
    assert acme_eval["evaluation_id"] not in globex_ids and len(globex_ids) == 1

    assert client.get(f"/api/v1/evaluations/{acme_eval['evaluation_id']}", headers=GLOBEX).status_code == 404
    acme_audit = client.get("/api/v1/audit-events", headers=ACME).json()
    assert acme_audit and all(e["evaluation_id"] in (None, acme_eval["evaluation_id"]) for e in acme_audit)
    assert all(e["evaluation_id"] != acme_eval["evaluation_id"]
               for e in client.get("/api/v1/audit-events", headers=GLOBEX).json())


def test_cannot_review_or_execute_another_workspaces_evaluation(client):
    held = evaluate(client, ACME, "prompt_injection")
    assert held["decision"] == "REVIEW_REQUIRED"
    r = client.post(f"/api/v1/reviews/{held['evaluation_id']}/decision", json={"decision": "APPROVE"}, headers=GLOBEX)
    assert r.status_code == 404

    allowed = evaluate(client, ACME, "valid")
    body = {"evaluation_id": allowed["evaluation_id"], "action": allowed["action"]}
    assert client.post("/api/v1/actions/execute", json=body, headers=GLOBEX).status_code == 404
    assert client.post("/api/v1/actions/execute", json=body, headers=ACME).status_code == 200


def test_policy_change_in_one_workspace_does_not_invalidate_another(client):
    allowed = evaluate(client, GLOBEX, "valid")
    client.patch("/api/v1/policies/spending-limit", json={"config": {"max_amount": 150}}, headers=ACME)
    body = {"evaluation_id": allowed["evaluation_id"], "action": allowed["action"]}
    assert client.post("/api/v1/actions/execute", json=body, headers=GLOBEX).status_code == 200


def test_workspace_header_is_validated(client):
    assert client.get("/api/v1/policies", headers={"X-TrustLayer-Workspace": "short"}).status_code == 400
    assert client.get("/api/v1/policies", headers={"X-TrustLayer-Workspace": "bad id with spaces"}).status_code == 400
    assert client.get("/api/v1/sandbox", headers=ACME).json() == {"workspace_id": "acme-sandbox-1", "shared": False}
    assert client.get("/api/v1/sandbox").json() == {"workspace_id": "default", "shared": True}


def test_database_from_before_workspaces_is_upgraded(tmp_path, monkeypatch):
    path = tmp_path / "old.sqlite3"
    old = sqlite3.connect(path)
    old.executescript("""
      CREATE TABLE policies (id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL,
        config_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE evaluations (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, intent TEXT NOT NULL,
        request_json TEXT NOT NULL, result_json TEXT NOT NULL, policy_versions_json TEXT NOT NULL,
        review_status TEXT, created_at TEXT NOT NULL);
      CREATE TABLE audit_events (id TEXT PRIMARY KEY, evaluation_id TEXT, event_type TEXT NOT NULL,
        details_json TEXT NOT NULL, created_at TEXT NOT NULL);
    """)
    old.execute("INSERT INTO policies VALUES ('spending-limit', 'Spending limit', 1, ?, 3, 'then')",
                (json.dumps({"max_amount": 120.0}),))
    old.execute("INSERT INTO evaluations VALUES ('eval-old', 'a', 'i', '{}', '{}', '{}', NULL, 'then')")
    old.commit()
    old.close()

    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(path))
    db.init_db()
    policies = {p["id"]: p for p in db.list_policies()}
    assert policies["spending-limit"]["config"]["max_amount"] == 120.0
    assert policies["spending-limit"]["version"] == 3
    assert set(policies) == {pid for pid, _, _ in db.DEFAULT_POLICIES}
    with db.connect() as c:
        assert c.execute("SELECT workspace_id FROM evaluations WHERE id='eval-old'").fetchone()[0] == "default"
