import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.trust import SCENARIOS


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "trust.sqlite3"))
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda s: s["id"])
def test_scenarios_reach_expected_decision(client, scenario):
    r = client.post("/api/v1/trust/evaluate", json=scenario["request"])
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] == scenario["expected"], body["reason"]
    assert body["execution_allowed"] == (scenario["expected"] == "ALLOW")


def test_decisions_are_audited(client):
    client.post("/api/v1/trust/evaluate", json=SCENARIOS[0]["request"])
    assert len(client.get("/api/v1/trust/decisions").json()) == 1


def _fake_plan(monkeypatch, steps):
    import app.main as m

    async def fake(task):
        return {"summary": "test plan", "steps": steps}
    monkeypatch.setattr(m, "plan_task", fake)


def test_task_runs_allowed_and_holds_the_rest(client, monkeypatch):
    _fake_plan(monkeypatch, [
        {"action": "db.run_query", "parameters": {"sql": "SELECT count(*) FROM customers", "environment": "production"}, "reasoning": "count customers"},
        {"action": "db.run_query", "parameters": {"sql": "DROP TABLE customers", "environment": "production"}, "reasoning": "x"},
        {"action": "finance.transfer_funds", "parameters": {"amount": 10, "payee": "Acme Supplies"}, "reasoning": "x"},
        {"action": "workplace.delete_files", "parameters": {"file_count": 50, "backed_up": True}, "reasoning": "x"},
    ])
    r = client.post("/api/v1/tasks", json={"task": "count customers and clean up"}).json()
    decisions = [s["decision"]["decision"] for s in r["steps"]]
    assert decisions == ["ALLOW", "BLOCK", "BLOCK", "REVIEW"]
    assert r["steps"][0]["execution"]["rows"] == [[4]]
    assert r["steps"][1]["execution"] is None and r["steps"][3]["execution"] is None
    pending = client.get("/api/v1/trust/decisions?pending=true").json()
    assert len(pending) == 1
    rev = client.post(f"/api/v1/trust/decisions/{pending[0]['evaluation_id']}/review", json={"decision": "APPROVE", "reviewer": "rhi"}).json()
    assert rev["review_status"] == "APPROVED" and rev["execution"]["status"] == "executed"
    assert client.post(f"/api/v1/trust/decisions/{pending[0]['evaluation_id']}/review", json={"decision": "REJECT"}).status_code == 409
    stats = client.get("/api/v1/trust/stats").json()
    assert stats["total"] == 4 and stats["blocked"] == 2 and stats["pending_reviews"] == 0


def test_api_key_flow(client):
    created = client.post("/api/v1/agents", json={"name": "Support bot", "scopes": ["commerce.purchase", "bogus"], "limits": {"budget": 50}}).json()
    key = created["api_key"]
    assert key.startswith("tl_") and created["scopes"] == ["commerce.purchase"]
    h = {"Authorization": f"Bearer {key}"}
    assert client.post("/api/v1/gate/check", json={"action": "commerce.purchase", "parameters": {"price": 30, "vendor": "Staples"}}).status_code == 401
    ok = client.post("/api/v1/gate/check", headers=h, json={"action": "commerce.purchase", "parameters": {"price": 30, "vendor": "Staples"}}).json()
    assert ok["decision"] == "REVIEW"  # vendor allowlist empty for a new agent
    over = client.post("/api/v1/gate/check", headers=h, json={"action": "commerce.purchase", "parameters": {"price": 80, "vendor": "Staples"}}).json()
    assert over["decision"] == "BLOCK"
    nope = client.post("/api/v1/gate/check", headers=h, json={"action": "finance.transfer_funds", "parameters": {"amount": 5}}).json()
    assert nope["decision"] == "BLOCK"
    poll = client.get(f"/api/v1/gate/decisions/{ok['decision_id']}", headers=h).json()
    assert poll["allowed"] is False and poll["review_status"] == "PENDING"
    client.patch(f"/api/v1/agents/{created['id']}", json={"enabled": False})
    assert client.post("/api/v1/gate/check", headers=h, json={"action": "commerce.purchase", "parameters": {}}).status_code == 401


def test_admin_token_protects_management(client, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_ADMIN_TOKEN", "s3cret")
    assert client.post("/api/v1/agents", json={"name": "x1"}).status_code == 401
    assert client.post("/api/v1/agents", json={"name": "x1"}, headers={"X-Admin-Token": "s3cret"}).status_code == 200
