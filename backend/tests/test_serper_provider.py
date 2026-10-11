"""Offline Serper integration tests. All Serper results are simulated; no network or API key is required."""
from __future__ import annotations
import httpx
from fastapi.testclient import TestClient
from app.main import app
from app import db
from app.serper import normalize_result, search_serper
from app.retail import parse_search

FAKE_RESULTS = [
    {"title": "Modern Office Computer Desk with Drawers", "price": "$239.99", "source": "DeskStore",
     "link": "https://www.deskstore.example/products/desk-a", "imageUrl": "https://images.example/desk.jpg", "rating": 4.6},
    {"title": "Compact Desk for Home Office", "price": "$179.00", "source": "OfficeStore",
     "link": "https://www.officestore.example/desk-b", "rating": 4.3},
    {"title": "Modern Desk Lamp", "price": "$20", "source": "DeskStore", "link": "https://www.deskstore.example/lamp"},
    {"title": "Premium Desk", "price": "$479.00", "source": "DeskStore", "link": "https://www.deskstore.example/high"},
    {"title": "Computer Desk", "price": "$129.00", "source": "DeskStore", "link": "javascript:alert(1)"},
    {"title": "Office Desk", "price": "£99.00", "source": "DeskStore", "link": "https://www.deskstore.example/wrong-currency"},
]


def test_desk_search_returns_real_shaped_products_with_alt_and_policy_block(tmp_path, monkeypatch):
    monkeypatch.setenv("PRODUCT_SEARCH_PROVIDER", "serper")
    monkeypatch.setenv("SERPER_API_KEY", "fake-test-key")
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "serper.sqlite"))
    base_client = httpx.AsyncClient
    seen = []
    def fake_client(*args, **kwargs):
        def handler(req):
            seen.append(req)
            assert req.url.path == '/shopping'
            assert req.headers['X-API-KEY'] == 'fake-test-key'
            import json
            assert json.loads(req.content)['q'] == 'desk'
            return httpx.Response(200, json={"shopping": FAKE_RESULTS})
        kwargs['transport'] = httpx.MockTransport(handler)
        return base_client(*args, **kwargs)
    monkeypatch.setattr(httpx, 'AsyncClient', fake_client)
    with TestClient(app) as client:
        response = client.post('/api/v1/agent/run',json={
            "intent": "Find me a desk that is around $250", "use_ai": False, "rank_with_ai": False
        })
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['discovery']['provider'] == 'serper'
        assert result['discovery']['catalog_mode'] == 'live'
        assert len(result['discovery']['results']) == 2
        assert len(result['alternatives']) == 1
        chosen = result['recommendation']['product']
        assert chosen['title'] == 'Modern Office Computer Desk with Drawers'
        assert chosen['price'] == 239.99
        assert chosen['product_url'].startswith('https://')
        assert result['proposal']['action']['parameters']['vendor'] == 'DeskStore'
        assert result['evaluation']['decision'] == 'BLOCK'  # default $80 policy
        assert any(c['name']=='Trusted product reference' and c['status']=='PASS' for c in result['evaluation']['checks'])
        assert result['execution'] is None
        assert db.get_live_product(chosen['product_id'])['price']==239.99
    assert len(seen)==1


def test_missing_credentials_returns_503_not_a_demo_fallback(tmp_path,monkeypatch):
    monkeypatch.setenv('PRODUCT_SEARCH_PROVIDER','serper')
    monkeypatch.delenv('SERPER_API_KEY',raising=False)
    monkeypatch.setenv('TRUSTLAYER_DB_PATH',str(tmp_path/'serper-no-key.sqlite'))
    with TestClient(app) as c:
        response=c.post('/api/v1/agent/run', json={'intent':'Find me a desk around $250','use_ai':False,'rank_with_ai':False})
        assert response.status_code==503
        assert response.json()['detail']['code']=='PRODUCT_SEARCH_UNAVAILABLE'


def test_poisoned_and_unsafe_results_are_rejected():
    q=parse_search('Find me a desk under $250')
    for result in FAKE_RESULTS[2:]:
        assert normalize_result(result,q,'search-test') is None
    assert normalize_result({**FAKE_RESULTS[0], 'link':'https://localhost/steal'},q,'search-test') is None
    assert normalize_result({**FAKE_RESULTS[0], 'link':'https://user:pass@example.com/steal'},q,'search-test') is None


def test_unverified_serper_id_can_not_authorize_purchase(tmp_path,monkeypatch):
    monkeypatch.setenv('TRUSTLAYER_DB_PATH',str(tmp_path/'serper-fabrication.sqlite'))
    with TestClient(app) as c:
        r=c.post('/api/v1/evaluations',json={
            'agent_id':'purchase-pilot','intent':'Find me a desk around $250',
            'action':{'type':'place_order','parameters':{'product_id':'serper:imaginary','price':1,'vendor':'DeskStore'}},
            'evidence':[],'policy_id':'shopping-default','use_ai':False})
        assert r.status_code==200
        assert r.json()['decision']=='BLOCK'
        assert any(check['name']=='Trusted product reference' and check['status']=='FAIL' for check in r.json()['checks'])
