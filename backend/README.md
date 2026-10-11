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

## Category-aware product discovery

`POST /api/v1/agent/run` with `{"intent": "Find shoes under $50"}` now:

1. Parses the request **without any model** (`app/intent.py`): categories, requirements (e.g. "running", "wireless", "size 10"), budget and currency.
2. Searches the configured product source (`app/providers.py`) and keeps only listings that match the requested category, budget, currency and availability (`app/discovery.py`). Excluded listings are counted by reason.
3. Ranks only those matches (`app/ranking.py`): with Luminal when configured, otherwise a **labeled deterministic fallback** (`ranking_source: "deterministic_fallback"`). Any product ID the model invents, including in its alternatives, rejects the whole run with HTTP 502.
4. Builds the proposed action from the server's own copy of the listing (price, currency, seller, category) and runs the existing evaluator. Nothing is executed.
5. Returns `status: "NO_MATCH"` (and writes no evaluation) when nothing qualifies, rather than proposing a product from another category.

### Product sources

| `PRODUCT_SEARCH_PROVIDER` | Source | Labeled as |
|---|---|---|
| `demo` (default) | Fictional demo catalog: headphones, shoes, laptops, backpacks (`app/catalog.py`) | `provenance: "fictional_demo_catalog"`, no product URLs |
| `ebay` | eBay Buy Browse API `item_summary/search`, OAuth client-credentials token | `provenance: "provider_api"`, `source: "ebay_browse_api"` |

eBay needs `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` from an eBay developer account (keyset with the Browse API). **The live eBay integration is tested only against mocked responses; it has not been run against the real API without a key.** If eBay is selected but unreachable or unconfigured, the run fails closed with HTTP 503 `PRODUCT_SEARCH_UNAVAILABLE`. Set `PRODUCT_SEARCH_DEMO_FALLBACK=true` to use the demo catalog instead; results are then labeled `catalog_mode: "demo_fallback"` with the provider error.

### What the evaluator now checks for orders

- **Trusted product reference:** the product ID must be a demo catalog item or a listing this server itself retrieved from the provider (stored in SQLite `product_listings`). Submitted price, vendor, currency and category must match that record. Unknown IDs get `WARN` (review), never `PASS`. The result's `product_verification` says `PROVIDER_VERIFIED`, `DEMO_FIXTURE` or `UNVERIFIED`; provider verification confirms the listing only and never authorizes anything by itself.
- **Request match:** category, budget and currency are parsed from the intent and compared with the trusted record. Wrong category, over the user's budget, other currency, or out of stock is a `FAIL`.
- **Spending limit:** policy amounts are USD; a non-USD price fails instead of being compared numerically.
- **Listing freshness:** provider listings older than `PRODUCT_LISTING_MAX_AGE_SECONDS` need review.
- **Decision evidence quality:** provider listings are labeled as real provider data, but a listing is not an independent review or a checkout total. With strict mode on, a live listing therefore requires review; TrustLayer does not fabricate the missing evidence. Caller-supplied evidence is always unverified, whatever its `source` says.

Alternatives are same-category only, unless the user named several categories ("shoes or a backpack").

### Deploying (e.g. Vercel)

All secrets are read from backend environment variables only (`LUMINAL_*`, `EBAY_*`). Set them in the hosting provider's encrypted environment settings, never in the React app or a `VITE_` variable. SQLite on serverless hosts is ephemeral; point `TRUSTLAYER_DB_PATH` at persistent storage for a real deployment.

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
- `app/catalog.py` – fictional demo catalog (headphones, shoes, laptops, backpacks)
- `app/intent.py` – deterministic category, requirement, budget and currency parser
- `app/providers.py` – eBay Browse API adapter and demo catalog provider
- `app/discovery.py` – search, filtering, NO_MATCH, server-side listing storage
- `app/ranking.py` – Luminal ranking with validation, deterministic fallback
- `app/agent_run.py` – discover → rank → propose → evaluate
- `app/db.py` – SQLite policies, decisions, executions, audit events
- `app/luminal.py` – optional model adapter
- `app/schemas.py` – request data types
- `tests/test_backend.py` – integration tests
- `tests/test_discovery.py` – discovery, provider, fabrication, budget and checkout tests (network mocked)

See `BACKEND_INTEGRATION.md` for teammate-facing API instructions.

## Deploying on Vercel

Create a separate Vercel project from this repo with branch `feature/backend` and root directory `backend`. Vercel detects FastAPI from `app/main.py`; no build command is needed.

- Set `LUMINAL_API_KEY`, `LUMINAL_API_BASE_URL`, `LUMINAL_MODEL` (and optionally `PRODUCT_SEARCH_PROVIDER`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`) as project environment variables. They stay on the backend only.
- `CORS_ORIGINS` already defaults to localhost plus `https://trust-layer-henna.vercel.app`. Override it (comma separated) to allow other frontends.
- On Vercel the SQLite database lives in `/tmp/trustlayer.sqlite3` (override with `TRUSTLAYER_DB_PATH`). Serverless storage is ephemeral, so evaluations, audit history and policy edits reset on cold starts. This is fine for a demo, not for production.
