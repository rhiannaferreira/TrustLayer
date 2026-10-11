"""End-to-end route tests; all Luminal calls are simulated locally."""
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TRUSTLAYER_DB_PATH", str(tmp_path / "run-test.sqlite3"))
    monkeypatch.setenv("LUMINAL_API_KEY", "test-secret-not-real")
    monkeypatch.setenv("LUMINAL_API_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("LUMINAL_MODEL", "test-model")
    with TestClient(app) as c:
        yield c


def fake_luminal(monkeypatch, *, proposal_text='{"product_id":"hp-002","reason":"Within budget"}', analysis_text="Evidence is limited"):
    real_async_client = httpx.AsyncClient
    calls = []

    def handler(request):
        assert request.url.path == "/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-secret-not-real"
        calls.append(request)
        text = proposal_text if len(calls) == 1 else analysis_text
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    return calls


def test_run_proposes_evaluates_and_never_executes(client, monkeypatch):
    calls = fake_luminal(monkeypatch)
    response = client.post("/api/v1/agent/run", json={"intent": "Find wireless headphones under $80"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "EVALUATED_NOT_EXECUTED"
    assert data["proposal"]["proposal_source"] == "luminal_generated"
    assert data["proposal"]["action"] == data["evaluation"]["action"]
    assert data["evaluation"]["decision"] == "ALLOW"
    assert data["evaluation"]["ai_status"] == "completed"
    assert data["evaluation"]["ai_analysis"] == "Evidence is limited"
    assert data["evaluation"]["executed"] is False
    assert data["execution"] is None
    assert len(calls) == 2
    eid = data["evaluation"]["evaluation_id"]
    saved = client.get(f"/api/v1/evaluations/{eid}")
    assert saved.status_code == 200
    assert saved.json()["evaluation_id"] == eid
    assert client.get("/api/v1/audit-events").json()[0]["event_type"] == "EVALUATED"


def test_run_can_skip_optional_ai_critique(client, monkeypatch):
    calls = fake_luminal(monkeypatch)
    response = client.post("/api/v1/agent/run", json={"intent": "Find wireless headphones under $80", "use_ai": False})
    assert response.status_code == 200
    assert response.json()["evaluation"]["ai_status"] == "not_requested"
    assert len(calls) == 1


def test_no_evaluation_written_when_proposal_is_invalid(client, monkeypatch):
    fake_luminal(monkeypatch, proposal_text='{"product_id":"not-in-catalog","reason":"bad"}')
    response = client.post("/api/v1/agent/run", json={"intent": "Find wireless headphones under $80"})
    assert response.status_code == 502
    assert client.get("/api/v1/evaluations").json() == []


def test_investigator_failure_requires_review(client, monkeypatch):
    from app import main
    fake_luminal(monkeypatch)

    async def unavailable(*args):
        raise RuntimeError("Model timeout")

    monkeypatch.setattr(main, "investigate", unavailable)
    response = client.post("/api/v1/agent/run", json={"intent": "Find wireless headphones under $80"})
    assert response.status_code == 200
    result = response.json()["evaluation"]
    assert result["decision"] == "REVIEW_REQUIRED"
    assert result["ai_status"] == "error"
    assert result["execution_allowed"] is False
