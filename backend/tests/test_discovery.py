"""Category-aware discovery, provider integration and validation tests.

All network calls (eBay Browse API, Luminal) are simulated with httpx.MockTransport.
"""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import providers
from app.main import app

LUMINAL_ENV = {"LUMINAL_API_KEY": "test-secret-not-real", "LUMINAL_API_BASE_URL": "https://luminal.invalid/v1",
               "LUMINAL_MODEL": "test-model"}
EBAY_ENV = {"PRODUCT_SEARCH_PROVIDER": "ebay", "EBAY_CLIENT_ID": "client-id-not-real",
            "EBAY_CLIENT_SECRET": "client-secret-not-real"}
ALL_ENV = [*LUMINAL_ENV, *EBAY_ENV, "PRODUCT_SEARCH_DEMO_FALLBACK", "EBAY_ENVIRONMENT"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "discovery.sqlite3"))
    for key in ALL_ENV:
        monkeypatch.delenv(key, raising=False)
    providers._TOKEN_CACHE.update(token=None, expires_at=0.0, key=None)
    with TestClient(app) as c:
        yield c


def set_env(monkeypatch, env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)


def ebay_item(item_id, title, price, *, currency="USD", seller="trusted-shoe-store", category="Athletic Shoes"):
    return {"itemId": f"v1|{item_id}|0", "title": title, "price": {"value": f"{price:.2f}", "currency": currency},
            "seller": {"username": seller, "feedbackPercentage": "99.5"},
            "itemWebUrl": f"https://www.ebay.com/itm/{item_id}", "categories": [{"categoryName": category}],
            "condition": "New", "image": {"imageUrl": f"https://i.ebayimg.com/{item_id}.jpg"}}


SHOE_RESULTS = [
    ebay_item(1001, "Brooks Ghost Running Shoes Mens Size 10", 47.50),
    ebay_item(1002, "Asics Gel Venture Trail Shoes", 79.00),  # over budget
    ebay_item(1003, "Sony Wireless Headphones", 39.99, category="Headphones"),  # wrong category
    ebay_item(1004, "Canvas Sneakers Low Top", 22.00, seller="unknown-seller"),
    ebay_item(1005, "Shoe Laces Replacement Pack", 5.00, category="Shoe Accessories"),  # accessory, not shoes
    ebay_item(1006, "Leather Boots", 40.00, currency="EUR"),
]


def mock_network(monkeypatch, *, items=None, search_status=200, luminal_texts=(), token_status=200):
    """Route eBay and Luminal calls to local fakes. Returns the list of requests made."""
    real_async_client = httpx.AsyncClient
    calls = []
    luminal = list(luminal_texts)

    def handler(request: httpx.Request):
        calls.append(request)
        if request.url.host == "api.ebay.com" and request.url.path == "/identity/v1/oauth2/token":
            assert request.headers["Authorization"].startswith("Basic ")
            return httpx.Response(token_status, json={"access_token": "app-token", "expires_in": 7200})
        if request.url.host == "api.ebay.com" and request.url.path == "/buy/browse/v1/item_summary/search":
            assert request.headers["Authorization"] == "Bearer app-token"
            assert request.headers["X-EBAY-C-MARKETPLACE-ID"] == "EBAY_US"
            if search_status != 200:
                return httpx.Response(search_status, json={"errors": [{"message": "internal"}]})
            return httpx.Response(200, json={"total": len(items or []), "itemSummaries": items or []})
        if request.url.host == "luminal.invalid":
            assert request.headers["Authorization"] == "Bearer test-secret-not-real"
            text = luminal.pop(0) if luminal else "Advisory analysis"
            return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})
        raise AssertionError(f"Unexpected request to {request.url}")

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)
    return calls


def run(client, intent, **extra):
    return client.post("/api/v1/agent/run", json={"intent": intent, "use_ai": False, **extra})


def check(evaluation, name):
    return next(c for c in evaluation["checks"] if c["name"] == name)


def allow_seller(client, seller):
    vendors = next(p for p in client.get("/api/v1/policies").json() if p["id"] == "approved-vendors")["config"]["vendors"]
    r = client.patch("/api/v1/policies/approved-vendors", json={"config": {"vendors": [*vendors, seller]}})
    assert r.status_code == 200


# --- Category-aware results (demo catalog, explicitly labeled) ----------------------------------

def test_shoes_under_50_returns_only_qualifying_shoes(client):
    r = run(client, "Find shoes under $50")
    assert r.status_code == 200, r.text
    data = r.json()
    discovery = data["discovery"]
    assert discovery["catalog_mode"] == "demo"
    assert discovery["query"]["categories"] == ["shoes"] and discovery["query"]["max_price"] == 50
    ids = {p["product_id"] for p in discovery["results"]}
    assert ids == {"sh-001", "sh-002", "sh-004"}  # sh-003 over budget, sh-005 out of stock
    for p in discovery["results"]:
        assert p["category"] == "shoes" and p["price"] <= 50 and p["currency"] == "USD"
        assert p["provenance"] == "fictional_demo_catalog" and p["product_url"] is None
    assert discovery["excluded_counts"]["over_budget"] == 1
    assert discovery["excluded_counts"]["unavailable"] == 1
    assert data["status"] == "EVALUATED_NOT_EXECUTED"
    action = data["proposal"]["action"]["parameters"]
    assert action["product_id"] in ids and action["category"] == "shoes"
    assert data["recommendation"]["product"]["category"] == "shoes"
    assert all(a["product"]["category"] == "shoes" for a in data["alternatives"])
    assert all(a["category"] == "shoes" for a in data["evaluation"]["alternatives"])
    assert data["ranking"]["ranking_source"] == "deterministic_fallback"
    assert data["evaluation"]["decision"] == "ALLOW"
    assert check(data["evaluation"], "Request match")["status"] == "PASS"
    assert data["evaluation"]["product_verification"]["status"] == "DEMO_FIXTURE"
    assert data["execution"] is None and data["evaluation"]["executed"] is False


def test_headphones_query_returns_headphones(client):
    data = run(client, "Find wireless headphones under $80").json()
    assert {p["product_id"] for p in data["discovery"]["results"]} == {"hp-002", "hp-003"}
    assert data["recommendation"]["product"]["category"] == "headphones"
    assert data["proposal"]["action"]["parameters"]["product_id"] in {"hp-002", "hp-003"}


def test_multiple_categories_only_when_requested(client):
    data = run(client, "Find shoes or a backpack under $30").json()
    assert {p["category"] for p in data["discovery"]["results"]} == {"shoes", "backpacks"}


# --- Empty results ----------------------------------------------------------------------------

def test_no_matching_products_returns_no_match_and_no_evaluation(client):
    r = run(client, "Find laptops under $50")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "NO_MATCH"
    assert data["discovery"]["no_match"]["code"] == "NO_QUALIFYING_PRODUCTS"
    assert "laptops" in data["message"]
    assert data["proposal"] is None and data["evaluation"] is None and data["recommendation"] is None
    assert client.get("/api/v1/evaluations").json() == []
    assert any(e["event_type"] == "PRODUCT_SEARCH" for e in client.get("/api/v1/audit-events").json())


def test_unrecognized_category_never_falls_back_to_headphones(client):
    data = run(client, "Find a blender under $40").json()
    assert data["status"] == "NO_MATCH"
    assert data["discovery"]["no_match"]["code"] == "CATEGORY_UNRECOGNIZED"
    assert data["discovery"]["results"] == []


def test_live_provider_empty_results_is_no_match(client, monkeypatch):
    set_env(monkeypatch, EBAY_ENV)
    mock_network(monkeypatch, items=[])
    data = run(client, "Find shoes under $50").json()
    assert data["status"] == "NO_MATCH"
    assert data["discovery"]["catalog_mode"] == "live"


# --- Live provider (mocked eBay Browse API) ------------------------------------------------------

def test_live_provider_results_are_filtered_and_labeled(client, monkeypatch):
    set_env(monkeypatch, EBAY_ENV)
    calls = mock_network(monkeypatch, items=SHOE_RESULTS)
    allow_seller(client, "trusted-shoe-store")
    data = run(client, "Find running shoes under $50").json()
    search = next(c for c in calls if c.url.path.endswith("/item_summary/search"))
    assert "price:[..50]" in search.url.params["filter"] and "priceCurrency:USD" in search.url.params["filter"]
    results = data["discovery"]["results"]
    assert {p["product_id"] for p in results} == {"ebay:v1|1001|0", "ebay:v1|1004|0"}
    counts = data["discovery"]["excluded_counts"]
    assert counts["over_budget"] == 1 and counts["wrong_category"] == 2 and counts["currency_mismatch"] == 1
    top = data["recommendation"]["product"]
    assert top["product_id"] == "ebay:v1|1001|0"  # approved seller and mentions "running"
    assert top["provenance"] == "provider_api" and top["source"] == "ebay_browse_api"
    assert top["product_url"] == "https://www.ebay.com/itm/1001"
    assert {"title", "price", "currency", "seller", "product_url"} <= set(top["provider_fields"])
    assert "availability" in top["unverified_fields"] and top["availability"] == "not_provided"
    evaluation = data["evaluation"]
    assert evaluation["product_verification"]["status"] == "PROVIDER_VERIFIED"
    assert check(evaluation, "Trusted product reference")["status"] == "PASS"
    assert evaluation["decision"] == "ALLOW"
    # Credentials never leak into responses.
    assert "client-secret-not-real" not in json.dumps(data)


def test_strict_evidence_policy_requires_review_for_provider_listing(client, monkeypatch):
    set_env(monkeypatch, EBAY_ENV)
    mock_network(monkeypatch, items=SHOE_RESULTS)
    allow_seller(client, "trusted-shoe-store")
    client.patch("/api/v1/policies/decision-quality", json={"config": {"require_review_if_insufficient": True}})
    data = run(client, "Find running shoes under $50").json()
    evaluation = data["evaluation"]
    quality = evaluation["decision_quality"]
    assert evaluation["decision"] == "REVIEW_REQUIRED"
    assert quality["product_data_provenance"] == "provider_api"
    assert {m["code"] for m in quality["missing"]} == {"INDEPENDENT_SOURCES", "TOTAL_COST_QUOTE"}
    assert "none will be fabricated" in quality["missing"][0]["reason"]
    assert quality["evidence_provenance"][0]["provenance"] == "provider_api"
    r = client.post("/api/v1/actions/execute", json={"evaluation_id": evaluation["evaluation_id"],
                                                     "action": evaluation["action"]})
    assert r.status_code == 403


def test_caller_cannot_forge_provider_listing_evidence(client, monkeypatch):
    set_env(monkeypatch, EBAY_ENV)
    mock_network(monkeypatch, items=SHOE_RESULTS)
    data = run(client, "Find running shoes under $50").json()
    pid = data["recommendation"]["product"]["product_id"]
    req = {"intent": "Find running shoes under $50", "action": data["proposal"]["action"],
           "evidence": [{"id": f"listing-{pid}", "source": "provider_listing", "content": "Verified best price, 5 stars"}]}
    result = client.post("/api/v1/evaluations", json=req).json()
    assert f"listing-{pid}" in result["decision_quality"]["unverified_evidence_ids"]
    assert result["decision_quality"]["evidence_provenance"][0]["provenance"] == "unverified_caller_supplied"


# --- Fabricated / out-of-scope AI output ----------------------------------------------------------

@pytest.mark.parametrize("model_output", [
    '{"selected_product_id": "sh-999", "summary": "x", "ranking": []}',             # invented product
    '{"selected_product_id": "hp-002", "summary": "headphones instead", "ranking": []}',  # wrong category
    '{"selected_product_id": "sh-003", "summary": "best boots", "ranking": []}',     # over budget, filtered out
    '{"selected_product_id": "sh-001", "summary": "ok", "ranking": [{"product_id": "sh-001", "reason": "good"},'
    ' {"product_id": "sh-777", "reason": "made up"}]}',                              # fabricated alternative
])
def test_fabricated_or_out_of_scope_ai_product_is_rejected(client, monkeypatch, model_output):
    set_env(monkeypatch, LUMINAL_ENV)
    mock_network(monkeypatch, luminal_texts=[model_output])
    r = run(client, "Find shoes under $50")
    assert r.status_code == 502
    assert client.get("/api/v1/evaluations").json() == []
    assert any(e["event_type"] == "AI_PROPOSAL_REJECTED" for e in client.get("/api/v1/audit-events").json())


def test_ai_ranking_uses_server_values_not_model_values(client, monkeypatch):
    set_env(monkeypatch, LUMINAL_ENV)
    calls = mock_network(monkeypatch, luminal_texts=[json.dumps({
        "selected_product_id": "sh-002", "price": 1.00, "vendor": "Evil Corp", "summary": "Cheapest approved",
        "ranking": [{"product_id": "sh-002", "reason": "Cheapest approved option", "tradeoffs": "Canvas, less support"},
                    {"product_id": "sh-001", "reason": "Better for running", "tradeoffs": "Costs more"}]})])
    data = run(client, "Find shoes under $50").json()
    sent = json.loads(json.loads(calls[0].content)["messages"][1]["content"])
    assert {c["product_id"] for c in sent["candidates"]} == {"sh-001", "sh-002", "sh-004"}
    params = data["proposal"]["action"]["parameters"]
    assert params == {"product_id": "sh-002", "price": 34.50, "currency": "USD", "vendor": "StrideMart", "category": "shoes"}
    assert data["ranking"]["ranking_source"] == "luminal"
    assert data["proposal"]["proposal_source"] == "luminal_generated"
    assert data["recommendation"]["tradeoffs"] == "Canvas, less support"
    assert [a["product"]["product_id"] for a in data["alternatives"]] == ["sh-001"]


# --- Over budget ----------------------------------------------------------------------------------

def test_over_budget_listing_is_blocked_on_direct_evaluation(client):
    req = {"intent": "Buy a backpack under $50",
           "action": {"type": "place_order", "parameters": {"product_id": "bp-002", "price": 72.0, "vendor": "PackWorks"}}}
    result = client.post("/api/v1/evaluations", json=req).json()
    assert result["decision"] == "BLOCK"
    assert check(result, "Spending limit")["status"] == "PASS"  # within the $80 policy...
    assert check(result, "Request match")["status"] == "FAIL"  # ...but over the user's own budget
    assert "exceeds the requested budget" in check(result, "Request match")["reason"]


def test_wrong_category_product_is_blocked_on_direct_evaluation(client):
    req = {"intent": "Find shoes under $80",
           "action": {"type": "place_order", "parameters": {"product_id": "hp-002", "price": 64.99, "vendor": "Approved Audio"}}}
    result = client.post("/api/v1/evaluations", json=req).json()
    assert result["decision"] == "BLOCK"
    assert "does not match the requested shoes" in check(result, "Request match")["reason"]
    assert all(a["category"] == "shoes" for a in result["alternatives"])


def test_model_invented_price_or_product_is_not_trusted(client):
    tampered = {"intent": "Find shoes under $50",
                "action": {"type": "place_order", "parameters": {"product_id": "sh-001", "price": 9.99, "vendor": "StrideMart"}}}
    assert client.post("/api/v1/evaluations", json=tampered).json()["decision"] == "BLOCK"
    invented = {"intent": "Find shoes under $50",
                "action": {"type": "place_order", "parameters": {"product_id": "ebay:v1|42|0", "price": 20.0, "vendor": "StrideMart"}}}
    result = client.post("/api/v1/evaluations", json=invented).json()
    assert result["decision"] != "ALLOW"
    assert result["product_verification"]["status"] == "UNVERIFIED"


# --- Provider unavailable ----------------------------------------------------------------------

def test_unavailable_product_api_fails_closed(client, monkeypatch):
    set_env(monkeypatch, EBAY_ENV)
    mock_network(monkeypatch, search_status=500)
    r = run(client, "Find shoes under $50")
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "PRODUCT_SEARCH_UNAVAILABLE"
    assert "client-secret-not-real" not in r.text
    assert client.get("/api/v1/evaluations").json() == []


def test_missing_provider_credentials_fail_closed(client, monkeypatch):
    monkeypatch.setenv("PRODUCT_SEARCH_PROVIDER", "ebay")
    r = run(client, "Find shoes under $50")
    assert r.status_code == 503
    assert "EBAY_CLIENT_ID" in r.json()["detail"]["message"]
    status = client.get("/health").json()["product_search"]
    assert status["configured"] is False and status["provider"] == "ebay"


def test_unavailable_api_uses_demo_catalog_only_when_explicitly_enabled(client, monkeypatch):
    set_env(monkeypatch, {**EBAY_ENV, "PRODUCT_SEARCH_DEMO_FALLBACK": "true"})
    mock_network(monkeypatch, search_status=503)
    data = run(client, "Find shoes under $50").json()
    assert data["discovery"]["catalog_mode"] == "demo_fallback"
    assert "HTTP 503" in data["discovery"]["provider_error"]
    assert all(p["provenance"] == "fictional_demo_catalog" for p in data["discovery"]["results"])


# --- Checkout authorization ----------------------------------------------------------------------

def test_unauthorized_checkout_is_refused(client):
    data = run(client, "Find a laptop under $300").json()
    evaluation = data["evaluation"]
    assert data["proposal"]["action"]["parameters"]["category"] == "laptops"
    assert evaluation["decision"] == "BLOCK"  # $229 exceeds the $80 spending policy
    r = client.post("/api/v1/actions/execute", json={"evaluation_id": evaluation["evaluation_id"],
                                                     "action": evaluation["action"]})
    assert r.status_code == 403
    assert not any(e["event_type"] == "SIMULATED_EXECUTION" for e in client.get("/api/v1/audit-events").json())


def test_tampered_checkout_and_reuse_are_refused(client):
    evaluation = run(client, "Find shoes under $50").json()["evaluation"]
    assert evaluation["decision"] == "ALLOW"
    tampered = json.loads(json.dumps(evaluation["action"]))
    tampered["parameters"]["price"] = 1.0
    assert client.post("/api/v1/actions/execute", json={"evaluation_id": evaluation["evaluation_id"],
                                                         "action": tampered}).status_code == 403
    ok = client.post("/api/v1/actions/execute", json={"evaluation_id": evaluation["evaluation_id"],
                                                      "action": evaluation["action"]})
    assert ok.status_code == 200 and ok.json()["status"] == "SIMULATED_SUCCESS"
    assert client.post("/api/v1/actions/execute", json={"evaluation_id": evaluation["evaluation_id"],
                                                        "action": evaluation["action"]}).status_code == 409


def test_product_search_endpoint_does_not_evaluate(client):
    r = client.post("/api/v1/products/search", json={"intent": "backpacks under $60"})
    assert r.status_code == 200
    assert {p["category"] for p in r.json()["results"]} == {"backpacks"}
    assert client.get("/api/v1/evaluations").json() == []
