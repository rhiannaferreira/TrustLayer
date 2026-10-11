# TrustLayer API contract for the frontend team

Base URL: `http://localhost:8000` (CORS defaults to Vite localhost port 5173). Swagger: `/docs`. JSON request/response. There is NO login or production auth in the local demo.

## Key endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | local backend and AI config status |
| GET | `/api/v1/catalog` | authoritative demo products |
| POST | `/api/v1/agent/run` | **Live AI mode.** Discover → rank → propose → evaluate; never executes |
| POST | `/api/v1/products/search` | discovery only; `{ "intent": "..." }`; no proposal or evaluation |
| GET | `/api/v1/products/status` | product search provider status (no secrets) |
| POST | `/api/v1/agent/propose` | seeded proposal for demo / Attack Lab only; `scenario: valid/budget/prompt_injection/unauthorized` |
| POST | `/api/v1/evaluations` | assess proposal, save decision and audit |
| GET | `/api/v1/evaluations` | most recent evaluations (array) |
| GET | `/api/v1/evaluations/{id}` | evaluation plus `original_request` |
| GET | `/api/v1/policies` | policies (array) |
| PATCH | `/api/v1/policies/{id}` | `{ "enabled": true, "config": {...} }` (fields optional) |
| POST | `/api/v1/actions/execute` | simulated checkout, only if authorized |
| POST | `/api/v1/reviews/{id}/decision` | local demo review; `{ "decision": "APPROVE" }` |
| GET | `/api/v1/audit-events` | activity log (array) |
| GET | `/api/v1/ai/status` | optional Luminal readiness |

## Agent run (Live AI mode)

`POST /api/v1/agent/run`

```json
{ "intent": "Find shoes under $50", "agent_id": "purchase-pilot", "use_ai": false, "rank_with_ai": true }
```

- `use_ai`: optional Luminal advisory critique of the evaluation (unchanged behavior).
- `rank_with_ai`: rank with Luminal when configured; otherwise a labeled deterministic ranking.

Response (abridged):

```json
{
  "status": "EVALUATED_NOT_EXECUTED",
  "message": null,
  "discovery": {
    "search_id": "search-...",
    "status": "MATCHED",
    "query": { "categories": ["shoes"], "category": "shoes", "requirements": [], "max_price": 50.0, "min_price": null, "currency": "USD", "currency_explicit": true },
    "search_terms": "shoes",
    "provider": "demo",
    "catalog_mode": "demo",
    "provider_error": null,
    "returned_count": 14,
    "matched_count": 3,
    "excluded_counts": { "wrong_category": 9, "currency_mismatch": 0, "over_budget": 1, "under_minimum": 0, "unavailable": 1 },
    "excluded": [{ "product_id": "sh-003", "title": "...", "category": "shoes", "price": 89.0, "currency": "USD", "reason": "over_budget" }],
    "results": ["<product record>", "..."],
    "no_match": null
  },
  "ranking": { "ranking_source": "luminal | deterministic_fallback", "summary": "..." },
  "recommendation": { "product": "<product record>", "rank": 1, "reason": "...", "tradeoffs": "..." },
  "alternatives": [{ "product": "<product record>", "rank": 2, "reason": "...", "tradeoffs": "..." }],
  "proposal": {
    "action": { "type": "place_order", "parameters": { "product_id": "sh-001", "price": 44.99, "currency": "USD", "vendor": "StrideMart", "category": "shoes" } },
    "evidence": [{ "id": "catalog-sh-001", "source": "demo_catalog", "content": "..." }],
    "proposal_source": "luminal_generated | deterministic_ranking",
    "agent_reasoning": "...", "search_id": "search-..."
  },
  "evaluation": "<same shape as POST /api/v1/evaluations>",
  "execution": null
}
```

Product record:

```json
{
  "product_id": "ebay:v1|1234|0", "provider": "ebay", "provider_product_id": "v1|1234|0",
  "title": "...", "name": "...", "category": "shoes", "category_source": "provider_category | title_inferred | demo_fixture",
  "provider_category": "Athletic Shoes", "price": 47.5, "currency": "USD", "seller": "store-name", "vendor": "store-name",
  "product_url": "https://www.ebay.com/itm/1234", "image_url": "...", "availability": "not_provided | in_stock | out_of_stock",
  "condition": "New", "rating": null, "source": "ebay_browse_api | demo_catalog",
  "provenance": "provider_api | fictional_demo_catalog",
  "provider_fields": ["provider_product_id", "title", "price", "currency", "seller", "product_url", "provider_category"],
  "unverified_fields": ["availability"],
  "requirements_matched": ["running"], "requirements_unconfirmed": [],
  "notes": ["Listing price excludes shipping and tax; it is not a checkout total."],
  "retrieved_at": "<ISO8601>", "search_id": "search-..."
}
```

`provider_fields` lists values copied verbatim from the provider API. Everything in `unverified_fields`, `requirements_matched` and the AI `reason`/`tradeoffs` is inferred or model-written and is not verified. Demo records have no provider fields and no URL.

Other outcomes:

- `status: "NO_MATCH"` (HTTP 200): `discovery.no_match.code` is `NO_QUALIFYING_PRODUCTS` or `CATEGORY_UNRECOGNIZED`; `proposal`, `evaluation`, `recommendation` are `null`; no evaluation is stored.
- HTTP 503 `{"detail": {"code": "PRODUCT_SEARCH_UNAVAILABLE", "message": "...", "provider": "ebay"}}` when the live provider is down or unconfigured and demo fallback is off.
- HTTP 502 when the AI ranking is malformed or names any product that is not in `discovery.results`; an `AI_PROPOSAL_REJECTED` audit event is written.

Evaluations now also include `product_verification` (`status`: `PROVIDER_VERIFIED | DEMO_FIXTURE | UNVERIFIED | NOT_APPLICABLE`) and a `Request match` check; `decision_quality` adds `evidence_provenance` and `product_data_provenance`.

## Sample evaluation POST request

```json
{
  "agent_id": "purchase-pilot",
  "intent": "Buy headphones under $80",
  "action": {
    "type": "place_order",
    "parameters": { "product_id": "hp-001", "price": 129.0, "vendor": "AudioMart" }
  },
  "evidence": [
    { "id": "review-001", "source": "product_review", "content": "Great sound quality" }
  ],
  "policy_id": "shopping-default",
  "use_ai": false
}
```

## Sample evaluation response

```json
{
  "evaluation_id": "eval-...",
  "agent_id": "purchase-pilot",
  "action": { "type": "place_order", "parameters": { "product_id": "hp-001", "price": 129.0, "vendor": "AudioMart" } },
  "decision": "BLOCK",
  "risk_level": "HIGH",
  "checks": [
    {"name":"Tool authorization", "status":"PASS", "reason":"Action is permitted"},
    {"name":"Spending limit", "status":"FAIL", "reason":"$129.00 exceeds $80.00 spending limit"}
  ],
  "reason": "$129.00 exceeds $80.00 spending limit",
  "evidence_flags": [],
  "alternatives": [{"product_id":"hp-002","name":"Everyday Wireless Headphones","price":64.99,"vendor":"Approved Audio","rating":4.5}],
  "execution_allowed": false,
  "policy_versions": {"spending-limit": 1, "approved-vendors": 1, "allowed-actions": 1, "evidence-review": 1},
  "ai_analysis": null,
  "ai_status": "not_requested",
  "ai_error": null,
  "created_at": "<ISO8601 timestamp>",
  "review_status": null,
  "executed": false
}
```

Only one example check is shown; the actual response includes all applied checks.

`decision`: `ALLOW | BLOCK | REVIEW_REQUIRED`. `risk_level`: `LOW | MEDIUM | HIGH`. `checks[].status`: `PASS | FAIL | WARN`.

## Executing a simulated action

`POST /api/v1/actions/execute`

```json
{
  "evaluation_id": "eval-...",
  "action": {"type":"place_order","parameters":{"product_id":"hp-002","price":64.99,"vendor":"Approved Audio"}}
}
```

This succeeds **only** when the action exactly matches the evaluated proposal, is permitted, policies have not changed, and authorization has not been used already. `REVIEW_REQUIRED` needs a demo review approval first. Failed attempts return HTTP `403` or `409`, not success.

## Policy patch example

`PATCH /api/v1/policies/spending-limit` with `{"config":{"max_amount":95}}`.

Policy IDs: `spending-limit`, `approved-vendors`, `allowed-actions`, `evidence-review`, `decision-quality`.

Live provider sellers are checked against `approved-vendors` like any vendor, so add trusted sellers there (e.g. `PATCH /api/v1/policies/approved-vendors`). New databases include the demo vendors `StrideMart`, `PackWorks` and `CompuHub`; an existing local `trustlayer.sqlite3` keeps its old list until patched or deleted.

The list endpoints return raw arrays for easy UI state updates; no pagination beyond a `limit` query parameter.

## Notes for integration

- Mock mode frontend is separate; never claim mock mode has hit the real server.
- The actual `/api/v1/evaluations` response has policy check explanations suitable for the evaluation pipeline UI.
- CORS supports `localhost:5173` and `127.0.0.1:5173`. Adjust `CORS_ORIGINS` as needed.
- If running from separate laptops, use appropriate development tunneling and access control; localhost on one machine is not accessible from another.
- Do not send an external API key from React. Only backend `.env` holds Luminal secrets.
