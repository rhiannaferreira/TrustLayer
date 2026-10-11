import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "test.sqlite3"))
    for key in ("LUMINAL_API_KEY", "LUMINAL_API_BASE_URL", "LUMINAL_MODEL"):
        monkeypatch.delenv(key, raising=False)
    with TestClient(app) as test_client:
        yield test_client


def proposal(client, scenario="valid"):
    response = client.post("/api/v1/agent/propose", json={"scenario": scenario})
    assert response.status_code == 200
    return response.json()


def evaluate(client, scenario="valid"):
    response = client.post("/api/v1/evaluations", json=proposal(client, scenario))
    assert response.status_code == 200, response.text
    return response.json()


def execute(client, result):
    return client.post("/api/v1/actions/execute", json={
        "evaluation_id": result["evaluation_id"], "action": result["action"]})


def test_valid_purchase_authorized_once(client):
    result = evaluate(client, "valid")
    assert result["decision"] == "ALLOW"
    assert execute(client, result).status_code == 200
    assert execute(client, result).status_code == 409
    assert any(x["event_type"] == "SIMULATED_EXECUTION" for x in client.get("/api/v1/audit-events").json())


def test_budget_violation_blocked(client):
    result = evaluate(client, "budget")
    assert result["decision"] == "BLOCK"
    assert execute(client, result).status_code == 403


def test_prompt_injection_review_only(client):
    result = evaluate(client, "prompt_injection")
    assert result["decision"] == "REVIEW_REQUIRED"
    assert result["evidence_flags"]
    assert execute(client, result).status_code == 403
    approved = client.post(f"/api/v1/reviews/{result['evaluation_id']}/decision", json={"decision":"APPROVE"})
    assert approved.status_code == 200
    assert execute(client, result).status_code == 200


def test_unauthorized_action_blocked(client):
    result = evaluate(client, "unauthorized")
    assert result["decision"] == "BLOCK"
    assert execute(client, result).status_code == 403


def test_cannot_change_action_after_evaluation(client):
    result = evaluate(client, "valid")
    result["action"]["parameters"]["price"] = 1
    assert execute(client, result).status_code == 403


def test_policy_change_invalidates_prior_authorization(client):
    result = evaluate(client, "valid")
    p = client.patch("/api/v1/policies/spending-limit", json={"config":{"max_amount":75}})
    assert p.status_code == 200
    assert execute(client, result).status_code == 409


def test_price_tampering_detected(client):
    req = proposal(client, "valid")
    req["action"]["parameters"]["price"] = 2.00
    response = client.post("/api/v1/evaluations", json=req)
    assert response.status_code == 200
    assert response.json()["decision"] == "BLOCK"


def test_ai_request_fails_closed_without_credentials(client):
    req = proposal(client, "valid")
    req["use_ai"] = True
    response = client.post("/api/v1/evaluations", json=req)
    assert response.status_code == 200
    assert response.json()["decision"] == "REVIEW_REQUIRED"
    assert response.json()["ai_status"] == "error"


def test_policy_review_config_is_respected(client):
    client.patch("/api/v1/policies/evidence-review", json={"config":{"require_review_for_suspicious":False}})
    result = evaluate(client, "prompt_injection")
    assert result["decision"] == "ALLOW"
    assert len(result["evidence_flags"]) == 1


def test_review_approval_updates_detail_authorization(client):
    result = evaluate(client, "prompt_injection")
    eid = result["evaluation_id"]
    assert client.get(f"/api/v1/evaluations/{eid}").json()["execution_allowed"] is False
    client.post(f"/api/v1/reviews/{eid}/decision", json={"decision":"APPROVE"})
    assert client.get(f"/api/v1/evaluations/{eid}").json()["execution_allowed"] is True
