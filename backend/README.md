# TrustLayer backend — local demo

Python FastAPI backend with deterministic authorization, AI-assisted *optional* evidence commentary through Luminal, persistent SQLite audit events, and a simulated execution gateway.

**Prototype only:** no authentication, tenant isolation, production security guarantees, real purchases, or real external accounts. Bind to localhost; do not expose this API publicly.

## Mac / VS Code quick start

1. In VS Code, **Open Folder** on the `backend` folder.
2. Open **Terminal → New Terminal**.
3. Run:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --reload --port 8000
```

4. Open <http://127.0.0.1:8000/docs> and <http://127.0.0.1:8000/health>.
5. Run tests in a **second terminal** (activate the virtual environment there too):

```bash
source .venv/bin/activate
python -m pytest -q
```

For teammates' React app, set `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL=http://localhost:8000` in its `.env`.

## Demo workflow (Swagger UI)

1. `POST /api/v1/agent/propose` with `{"scenario":"budget"}` or `valid`, `prompt_injection`, `unauthorized`.
2. Copy the response to `POST /api/v1/evaluations`.
3. Use the returned `evaluation_id` and exact `action` at `POST /api/v1/actions/execute`.
4. Inspect `GET /api/v1/evaluations` and `GET /api/v1/audit-events`.
5. To approve a `REVIEW_REQUIRED` demo case, call `POST /api/v1/reviews/{evaluation_id}/decision` with `{"decision":"APPROVE"}` and retry execute.

`/api/v1/agent/propose` is deterministic seeded behavior, **not** an actual autonomous LLM purchasing agent. No real checkout occurs.

## Luminal (optional)

The project works without API keys. To enable Luminal **advisory analysis**, edit `backend/.env` and supply:

```dotenv
LUMINAL_API_KEY=...
LUMINAL_API_BASE_URL=https://YOUR_VERIFIED_BASE_URL/v1
LUMINAL_MODEL=your-exact-model-id
```

The `LUMINAL_API_BASE_URL` must be verified in **your Luminal account's API documentation**, because providers/products with similar names have different endpoints. The client assumes an OpenAI-style `/chat/completions` endpoint under this base URL. On an evaluation request, set `"use_ai": true`. If missing or unavailable, TrustLayer returns `REVIEW_REQUIRED` rather than claiming success. Model text is informational only and never grants execution permission.

Never commit `.env` or share API keys with collaborators; `.gitignore` protects them.

## Security design for the demo

- **BLOCK** if deterministic checks fail (exceeds budget, unknown tool, unapproved vendor, catalog price mismatch).
- **REVIEW_REQUIRED** if untrusted evidence triggers basic heuristic rules or an AI review requested by the caller fails.
- **ALLOW** only if active checks pass.
- The action gateway requires the **exact evaluated action**, uses single-use authorization, checks for policy changes, and rechecks hard restrictions.
- Review approvals are demo-only and **not authenticated**; they must not bypass hard policy failures.
- The local catalog is the demo authority; the frontend cannot lower a product price to override it.
- Text-pattern prompt injection detection is a heuristic, not comprehensive security protection.
- The audit trail is local SQLite history, not an immutable forensic ledger.

## Files

- `app/main.py` – FastAPI endpoints and server-side execution gateway
- `app/engine.py` – policy/risk/evidence checks
- `app/catalog.py` – local sample products
- `app/db.py` – SQLite policies, decisions, executions, audit events
- `app/luminal.py` – optional model adapter
- `app/schemas.py` – request data types
- `tests/test_backend.py` – integration tests

See `BACKEND_INTEGRATION.md` for teammate-facing API instructions.
