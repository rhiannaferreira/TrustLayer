import httpx
import pytest
from fastapi.testclient import TestClient

from app import web_search
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "web.sqlite3"))
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    with TestClient(app) as c:
        yield c


def mock_tavily(monkeypatch, status=200, payload=None):
    real = httpx.AsyncClient
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(status, json=payload if payload is not None else {})

    monkeypatch.setattr(web_search.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return seen


def test_unconfigured_returns_503_without_key_details(client):
    assert client.get("/api/v1/research/status").json()["missing"] == ["TAVILY_API_KEY"]
    r = client.post("/api/v1/research", json={"query": "who wrote Dune"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "WEB_SEARCH_UNAVAILABLE"


def test_research_normalizes_and_labels_sources(client, monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-not-real")
    seen = mock_tavily(monkeypatch, payload={"answer": "Frank Herbert.", "results": [
        {"title": "Dune (novel)", "url": "https://en.wikipedia.org/wiki/Dune_(novel)", "content": "Dune is a 1965 novel.", "score": 0.9},
        {"title": "bad item without url"}, "junk"]})
    r = client.post("/api/v1/research", json={"query": "who wrote Dune"})
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == "Frank Herbert."
    assert len(body["sources"]) == 1
    assert body["sources"][0]["provenance"] == "web_search"
    assert "tvly-not-real" not in r.text
    assert seen[0].headers["authorization"] == "Bearer tvly-not-real"


def test_provider_error_is_503(client, monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-not-real")
    mock_tavily(monkeypatch, status=429)
    r = client.post("/api/v1/research", json={"query": "anything at all"})
    assert r.status_code == 503
    assert "429" in r.json()["detail"]["message"]


def test_agent_run_no_match_falls_back_to_labeled_web_research(client, monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-not-real")
    mock_tavily(monkeypatch, payload={"answer": "Frank Herbert.", "results": [
        {"title": "Dune", "url": "https://example.org/dune", "content": "A 1965 novel.", "score": 0.8}]})
    r = client.post("/api/v1/agent/run", json={"intent": "who wrote the novel Dune"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "NO_MATCH"
    assert body["proposal"] is None and body["evaluation"] is None
    assert body["research"]["answer"] == "Frank Herbert."
    assert body["research"]["sources"][0]["provenance"] == "web_search"


def test_agent_run_no_match_without_tavily_key_has_no_research(client):
    r = client.post("/api/v1/agent/run", json={"intent": "who wrote the novel Dune"})
    assert r.status_code == 200
    assert r.json()["research"] is None
