# TrustLayer API contract for the frontend team

Base URL: `http://localhost:8000` (CORS defaults to Vite localhost port 5173). Swagger: `/docs`. JSON request/response. There is NO login or production auth in the local demo.

## Key endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | local backend and AI config status |
| GET | `/api/v1/catalog` | authoritative demo products |
| POST | `/api/v1/agent/propose` | seeded proposal; `scenario: valid/budget/prompt_injection/unauthorized` |
| POST | `/api/v1/evaluations` | assess proposal, save decision and audit |
| GET | `/api/v1/evaluations` | most recent evaluations (array) |
| GET | `/api/v1/evaluations/{id}` | evaluation plus `original_request` |
| GET | `/api/v1/policies` | policies (array) |
| PATCH | `/api/v1/policies/{id}` | `{ "enabled": true, "config": {...} }` (fields optional) |
| POST | `/api/v1/actions/execute` | simulated checkout, only if authorized |
| POST | `/api/v1/reviews/{id}/decision` | local demo review; `{ "decision": "APPROVE" }` |
| GET | `/api/v1/audit-events` | activity log (array) |
| GET | `/api/v1/ai/status` | optional Luminal readiness |

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

Policy IDs: `spending-limit`, `approved-vendors`, `allowed-actions`, `evidence-review`.

The list endpoints return raw arrays for easy UI state updates; no pagination beyond a `limit` query parameter.

## Notes for integration

- Mock mode frontend is separate; never claim mock mode has hit the real server.
- The actual `/api/v1/evaluations` response has policy check explanations suitable for the evaluation pipeline UI.
- CORS supports `localhost:5173` and `127.0.0.1:5173`. Adjust `CORS_ORIGINS` as needed.
- If running from separate laptops, use appropriate development tunneling and access control; localhost on one machine is not accessible from another.
- Do not send an external API key from React. Only backend `.env` holds Luminal secrets.
