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

## Live version for prospective customers

In Live Backend Mode every visitor gets a private sandbox: the browser creates an id and sends it as `X-TrustLayer-Workspace` on every request, and the backend keeps that visitor's rules, decisions and history apart from everyone else's. A visitor sets their rules on **Your Rules** (spending limit, approved vendors, allowed actions, human review), then runs the agent in the Agent Playground or tries to trick it in the Attack Lab.

To put it online with two Vercel projects from this repo, both on `main`:

1. **Backend**: root directory `backend`. Set `LUMINAL_API_KEY`, `LUMINAL_API_BASE_URL` and `LUMINAL_MODEL` as environment variables. Check that `GET /health` on its URL returns JSON with `"mode": "vercel"`.
2. **Frontend**: root directory `frontend`. Set `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL` to the backend's URL, then redeploy.
3. If the frontend isn't at `https://trust-layer-henna.vercel.app`, add its address to the backend's `CORS_ORIGINS`.

On Vercel the backend stores data in `/tmp`, which resets when the function restarts (often after a few idle minutes), so a sandbox can lose its rules and history. That is acceptable for a live demo but not for real customers, who need a persistent database.

## Tests

```bash
cd backend && python -m pytest -q
cd frontend && npm test
```
