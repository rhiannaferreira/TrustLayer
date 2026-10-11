"""Integration tests: existing API contract + opt-in evidence-quality review gate."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "quality.sqlite3"))
    for key in ("LUMINAL_API_KEY", "LUMINAL_API_BASE_URL", "LUMINAL_MODEL"):
        monkeypatch.delenv(key, raising=False)
    with TestClient(app) as c:
        yield c


def sample_request():
    return {
        "agent_id": "purchase-pilot",
        "intent": "Find the best wireless headphones under $80",
        "action": {"type": "place_order", "parameters": {
            "product_id": "hp-002", "price": 64.99, "vendor": "Approved Audio"
        }},
        "evidence": [{"id": "catalog-hp-002", "source": "demo_catalog",
                      "content": "Everyday Wireless Headphones; rating 4.5; listed price $64.99"}],
        "policy_id": "shopping-default",
        "use_ai": False,
    }


def strict_mode(client):
    response = client.patch("/api/v1/policies/decision-quality", json={
        "config": {"require_review_if_insufficient": True}
    })
    assert response.status_code == 200, response.text


def evaluate(client, request=None):
    response = client.post("/api/v1/evaluations", json=request or sample_request())
    assert response.status_code == 200, response.text
    return response.json()


def fixture_evidence(client, product_id="hp-002"):
    response = client.get("/api/v1/evidence-fixtures", params={"product_id": product_id})
    assert response.status_code == 200
    assert response.json()
    return [{k: item[k] for k in ("id", "source", "content")} for item in response.json()]


def test_advisory_mode_preserves_legacy_allow(client):
    result = evaluate(client)
    assert result["decision"] == "ALLOW"
    assert result["decision_quality"]["status"] == "INSUFFICIENT_EVIDENCE"
    assert result["decision_quality"]["enforced"] is False


def test_enforced_quality_requires_review_and_blocks_checkout(client):
    strict_mode(client)
    result = evaluate(client)
    assert result["decision"] == "REVIEW_REQUIRED"
    assert result["execution_allowed"] is False
    assert {item["code"] for item in result["decision_quality"]["missing"]} == {
        "INDEPENDENT_SOURCES", "COMPARATIVE_EVIDENCE", "TOTAL_COST_QUOTE"
    }
    response = client.post("/api/v1/actions/execute", json={
        "evaluation_id": result["evaluation_id"], "action": result["action"]
    })
    assert response.status_code == 403


def test_matching_demo_sources_can_satisfy_quality_check(client):
    strict_mode(client)
    req = sample_request()
    req["evidence"].extend(fixture_evidence(client))
    result = evaluate(client, req)
    assert result["decision"] == "ALLOW"
    assert result["decision_quality"]["status"] == "SUFFICIENT_FOR_DEMO"
    assert result["decision_quality"]["provenance"] == "fictional_demo_fixtures_only"
    assert result["execution_allowed"] is True


def test_user_cannot_forge_source_by_changing_label_or_content(client):
    strict_mode(client)
    req = sample_request()
    all_evidence = fixture_evidence(client)
    all_evidence[0]["content"] = "Completely made up trusted review"
    req["evidence"].extend(all_evidence)
    result = evaluate(client, req)
    assert result["decision"] == "REVIEW_REQUIRED"
    assert all_evidence[0]["id"] in result["decision_quality"]["unverified_evidence_ids"]


def test_missing_comparison_not_required_without_superlative(client):
    strict_mode(client)
    req = sample_request()
    req["intent"] = "Buy these headphones for $64.99"
    req["evidence"].extend([x for x in fixture_evidence(client) if not x["id"].startswith("comparison-")])
    result = evaluate(client, req)
    assert result["decision"] == "ALLOW"
    assert not result["decision_quality"]["missing"]


def test_invalid_config_rejected(client):
    r = client.patch("/api/v1/policies/decision-quality", json={
        "config": {"min_independent_sources": -1}
    })
    assert r.status_code == 422
    assert client.get("/api/v1/policies").status_code == 200


def test_trusted_fixture_for_wrong_product_not_counted(client):
    strict_mode(client)
    req = sample_request()
    req["evidence"].extend(fixture_evidence(client, "hp-001"))
    assert evaluate(client, req)["decision"] == "REVIEW_REQUIRED"


def test_hard_budget_failure_still_blocks_even_with_good_evidence(client):
    strict_mode(client)
    req = sample_request()
    req["action"]["parameters"] = {"product_id": "hp-001", "price": 129, "vendor": "AudioMart"}
    req["evidence"].extend(fixture_evidence(client, "hp-001"))
    result = evaluate(client, req)
    assert result["decision"] == "BLOCK"


def test_decision_quality_saved_and_returned(client):
    strict_mode(client)
    result = evaluate(client)
    r = client.get(f"/api/v1/evaluations/{result['evaluation_id']}")
    assert r.status_code == 200
    assert r.json()["decision_quality"] == result["decision_quality"]
