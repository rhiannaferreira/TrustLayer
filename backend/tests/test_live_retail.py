"""Offline tests; no eBay or Luminal credentials required.

Run after upgrade: cd backend && python -m pytest -q
"""
import httpx
from fastapi.testclient import TestClient
from app import retail, db
from app.main import app


LISTINGS = [
    {"itemId": "v1|desk1|0", "title": "Modern Office Computer Desk with Drawers", "price": {"value": "239.99", "currency": "USD"},
     "itemWebUrl": "https://www.ebay.com/itm/desk1", "seller": {"username": "real-shop-a"},
     "image": {"imageUrl": "https://i.ebayimg.com/images/desk1.jpg"}, "condition": "New"},
    {"itemId": "v1|desk2|0", "title": "Minimalist Desk for Home Office", "price": {"value": "185", "currency": "USD"},
     "itemWebUrl": "https://www.ebay.com/itm/desk2", "seller": {"username": "real-shop-b"}},
    {"itemId": "v1|lamp|0", "title": "Modern Desk Lamp", "price": {"value": "25", "currency": "USD"},
     "itemWebUrl": "https://www.ebay.com/itm/lamp"},
    {"itemId": "v1|over|0", "title": "Executive Computer Desk", "price": {"value": "499", "currency": "USD"},
     "itemWebUrl": "https://www.ebay.com/itm/over"},
    {"itemId": "v1|wrong|0", "title": "Premium Studio Headphones", "price": {"value": "49", "currency": "USD"},
     "itemWebUrl": "https://www.ebay.com/itm/wrong"},
]


def test_arbitrary_category_and_budget_parse():
    q = retail.parse_search("Find me a desk that is around $250")
    assert q["search_terms"] == "desk"
    assert q["max_price"] == 250
    assert q["strict_price"] is False
    assert retail.title_matches("Office Computer Desk", q)
    assert not retail.title_matches("Modern Desk Lamp", q)


def test_strict_budget_parse():
    q = retail.parse_search("Find me a desk under $50")
    assert q["max_price"] == 50
    assert q["strict_price"] is True


def test_real_provider_search_returns_only_verified_same_item_under_budget(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "retail.sqlite"))
    monkeypatch.setenv("PRODUCT_SEARCH_PROVIDER", "ebay")
    monkeypatch.setenv("EBAY_CLIENT_ID", "fake-app-id")
    monkeypatch.setenv("EBAY_CLIENT_SECRET", "fake-secret")
    retail._TOKEN = None
    calls = []
    def handler(request):
        calls.append(request)
        if request.url.path.endswith("/oauth2/token"):
            return httpx.Response(200, json={"access_token": "test-token", "expires_in": 3600})
        if request.url.path.endswith("/item_summary/search"):
            assert request.url.params.get("q") == "desk"
            assert "priceCurrency:USD" in request.url.params.get("filter", "")
            return httpx.Response(200, json={"itemSummaries": LISTINGS})
        return httpx.Response(404)
    real_client = httpx.AsyncClient
    def fake_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)
    monkeypatch.setattr(httpx, "AsyncClient", fake_client)
    with TestClient(app) as client:
        r = client.post("/api/v1/agent/run", json={
            "intent": "Find me a desk that is around $250", "use_ai": False, "rank_with_ai": False
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "EVALUATED_NOT_EXECUTED"
        assert body["discovery"]["provider"] == "ebay"
        assert body["discovery"]["catalog_mode"] == "live"
        products = body["discovery"]["results"]
        assert len(products) == 2
        assert all(p["price"] <= 250 and "desk" in p["title"].lower() for p in products)
        assert body["recommendation"]["product"]["provenance"] == "live_retailer_listing"
        assert len(body["alternatives"]) == 1
        assert body["proposal"]["action"]["parameters"]["vendor"] == "eBay"
        assert body["evaluation"]["decision"] == "BLOCK"  # default policy is $80, not $250
        checks = {c["name"]: c["status"] for c in body["evaluation"]["checks"]}
        assert checks["Trusted product reference"] == "PASS"
        assert checks["Request alignment"] == "PASS"
        assert checks["Spending limit"] == "FAIL"
        assert body["execution"] is None
        saved = db.get_live_product(body["recommendation"]["product"]["product_id"])
        assert saved and saved["title"]
    assert len(calls) >= 2


def test_missing_provider_credentials_returns_503_not_demo(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "no-creds.sqlite"))
    monkeypatch.setenv("PRODUCT_SEARCH_PROVIDER", "ebay")
    monkeypatch.delenv("EBAY_CLIENT_ID", raising=False)
    monkeypatch.delenv("EBAY_CLIENT_SECRET", raising=False)
    retail._TOKEN = None
    with TestClient(app) as client:
        r = client.post("/api/v1/agent/run", json={"intent": "Find me a desk around $250", "use_ai": False})
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "PRODUCT_SEARCH_UNAVAILABLE"


def test_fabricated_listing_not_authorized(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "fake.sqlite"))
    with TestClient(app) as client:
        r = client.post("/api/v1/evaluations", json={
            "agent_id": "purchase-pilot", "intent": "Find me a desk around $250",
            "action": {"type": "place_order", "parameters": {
                "product_id": "ebay:v1|invented|0", "price": 1.0, "vendor": "eBay"}},
            "evidence": [], "policy_id": "shopping-default", "use_ai": False,
        })
        assert r.status_code == 200
        assert r.json()["decision"] == "BLOCK"
        assert any(c["name"] == "Trusted product reference" and c["status"] == "FAIL"
                   for c in r.json()["checks"])
