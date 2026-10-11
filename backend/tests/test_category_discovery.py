"""Category and budget isolation tests. No live API credentials required."""
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app.catalog import PRODUCTS
from app.discovery import search_demo_products


def test_shoe_search_is_category_and_budget_safe():
    products = search_demo_products("Find me good shoes for less than $50", PRODUCTS)
    assert len(products) >= 2
    assert all(p["category"] == "shoes" and p["price"] < 50 for p in products)
    assert not any(p["product_id"].startswith("hp-") for p in products)


def test_headphones_stay_in_headphones_category():
    products = search_demo_products("Best wireless headphones under $80", PRODUCTS)
    assert products and all(p["category"] == "headphones" for p in products)


def test_unsupported_and_unaffordable_queries_return_no_match():
    assert search_demo_products("Find shoes under $10", PRODUCTS) == []
    assert search_demo_products("Find jackets under $50", PRODUCTS) == []


def test_mismatched_hardcoded_headphone_is_blocked(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "match.sqlite"))
    with TestClient(app) as c:
        response = c.post("/api/v1/evaluations", json={
            "agent_id": "purchase-pilot", "intent": "Find shoes under $50",
            "action": {"type": "place_order", "parameters": {"product_id": "hp-002", "price": 64.99, "vendor": "Approved Audio"}},
            "evidence": [], "policy_id": "shopping-default", "use_ai": False,
        })
        assert response.status_code == 200
        body = response.json()
        assert body["decision"] == "BLOCK"
        assert body["execution_allowed"] is False
        assert any(item["name"] == "Request alignment" and item["status"] == "FAIL" for item in body["checks"])


def test_shoe_alternatives_do_not_include_headphones(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "shoes.sqlite"))
    with TestClient(app) as c:
        response = c.post("/api/v1/evaluations", json={
            "agent_id": "purchase-pilot", "intent": "Find shoes under $50",
            "action": {"type": "place_order", "parameters": {"product_id": "sh-001", "price": 44.95, "vendor": "StrideCo Demo"}},
            "evidence": [], "policy_id": "shopping-default", "use_ai": False,
        })
        assert response.status_code == 200
        body = response.json()
        assert all(p["product_id"].startswith("sh-") and p["price"] < 50 for p in body["alternatives"])


def test_ai_rejects_wrong_category_choice(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "wrong.sqlite"))
    monkeypatch.setenv("LUMINAL_API_KEY", "fake-testing-key")
    monkeypatch.setenv("LUMINAL_API_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("LUMINAL_MODEL", "test-model")
    real = httpx.AsyncClient
    def fake(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(lambda request: httpx.Response(200, json={"choices": [{"message": {"content": '{"product_id":"hp-002","reason":"bad selection"}'}}]}))
        return real(*args, **kwargs)
    monkeypatch.setattr(httpx, "AsyncClient", fake)
    with TestClient(app) as c:
        result = c.post("/api/v1/agent/run", json={"intent":"Find shoes under $50"})
        assert result.status_code == 502
        assert c.get("/api/v1/evaluations").json() == []
