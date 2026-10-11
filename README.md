# TrustLayer

The intelligence and trust layer for autonomous AI agents.

> Every AI action deserves a second look.

TrustLayer sits between an AI agent and the tools it wants to use. Before a protected action runs, it checks permissions, policy, evidence (including prompt injection) and risk, then allows it, blocks it, or holds it for human review.

| Part | Location |
| --- | --- |
| Backend API (Python, FastAPI) | [`backend/`](./backend), see [backend/README.md](./backend/README.md) |
| Web console (React, Vite) | [`frontend/`](./frontend), see [frontend/README.md](./frontend/README.md) |
| API contract | [backend/BACKEND_INTEGRATION.md](./backend/BACKEND_INTEGRATION.md) |

## Run it locally

Terminal 1, the backend on http://127.0.0.1:8000:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --reload --port 8000
```

Terminal 2, the console on http://localhost:5173:

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_USE_MOCKS=false to use the backend
npm run dev
```

With `VITE_USE_MOCKS=true` (the default) the console runs in Demo Mode and needs no backend. AI analysis is optional and needs Luminal settings in `backend/.env`; see the backend README.

## Tests

```bash
cd backend && python -m pytest -q
cd frontend && npm test
```
