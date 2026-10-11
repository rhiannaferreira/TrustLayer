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
