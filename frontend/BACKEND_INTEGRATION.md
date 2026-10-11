# TrustLayer: Backend Integration Guide

How the frontend talks to the FastAPI backend. Every URL is in `src/services/endpoints.ts`, the
HTTP client is `src/services/api.ts`, and all response normalization is in
`src/services/liveContract.ts`. Questions and gaps for the backend are listed in
[BACKEND_REQUESTS.md](./BACKEND_REQUESTS.md).

> Status: built against the contract described by the team. No backend source or OpenAPI spec was
> available, so live behaviour was tested only against mocked HTTP (`src/services/__tests__/liveApi.test.ts`).
> At runtime the frontend fetches `/openapi.json` and reports any differences in the connection popover.

## 1. Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_USE_MOCKS` | `true` | `true` starts in Demo Mode; `false` starts in Live Backend Mode. |
| `VITE_API_BASE_URL` | empty | Empty means same origin through the Vite proxy (recommended). Set a full URL to call the backend directly (backend must then allow CORS). |
| `VITE_BACKEND_PROXY_TARGET` | `http://127.0.0.1:8000` | Where `npm run dev` / `npm run preview` proxy `/health`, `/openapi.json` and `/api/*`. |

Mode, base URL, "use AI analysis" and "auto-execute approved actions" (off by default) can also be
changed at runtime in Settings. No API keys are stored or sent by the frontend; Luminal
credentials stay on the backend.

In Live Backend Mode the frontend never falls back to mock data. Network errors, timeouts (15s,
60s for evaluations), non-2xx responses and contract violations are shown as errors.

## 2. Endpoints used

| Method | Path | Used by |
| --- | --- | --- |
| GET | `/health` | Connection indicator (polled) |
| GET | `/openapi.json` | Contract check in the connection popover |
| GET | `/api/v1/ai/status` | AI indicator: Configured / Unavailable |
| GET | `/api/v1/catalog` | Attack Lab and Playground product pickers |
| POST | `/api/v1/agent/propose` | Playground "Run agent" (seeded scenarios) |
| POST | `/api/v1/evaluations` | Playground, Attack Lab, Guided demo |
| GET | `/api/v1/evaluations` | Live Decisions, Audit, Overview refresh |
| GET | `/api/v1/evaluations/{id}` | Refresh one record (after review / execution) |
| GET, PATCH | `/api/v1/policies`, `/api/v1/policies/{policy_id}` | Policies page (live editor) |
| POST | `/api/v1/reviews/{evaluation_id}/decision` | Approve / Reject on REVIEW_REQUIRED |
| POST | `/api/v1/actions/execute` | Execution gateway |
| GET | `/api/v1/audit-events` | Audit Trail |

## 3. `POST /api/v1/evaluations`

Request body sent (frontend-only fields such as agent permissions and reasoning are **not** sent):

```json
{
  "agent_id": "purchase-pilot",
  "intent": "Buy wireless headphones under $80",
  "action": { "type": "place_order", "parameters": { "product_id": "...", "price": 59.99, "vendor": "AudioMart" } },
  "evidence": [{ "id": "ev-1", "source": "product_page", "content": "..." }],
  "policy_id": "shopping-default",
  "use_ai": true
}
```

Response fields read: `evaluation_id`, `agent_id`, `action`, `decision` (ALLOW | BLOCK |
REVIEW_REQUIRED), `risk_level` (LOW | MEDIUM | HIGH | CRITICAL), `checks`, `reason`,
`evidence_flags`, `alternatives`, `execution_allowed`, `policy_versions`, `ai_analysis`,
`ai_status`, `ai_error`, `created_at`, `review_status`, `executed`.

Strictness:
- **Required** (the response is rejected with an error otherwise): `evaluation_id` (or `id`),
  `decision`, boolean `execution_allowed`. These decide what the user is told about authorization,
  so they are never guessed.
- Everything else is tolerated: unknown risk is shown as MEDIUM with a note, checks accept
  `status` or `passed`, flags accept strings or objects. Each deviation is recorded as a
  "contract note" on the record and shown in the inspector.
- The raw JSON is kept and shown verbatim (Raw JSON tab, copy and download).

### AI fields

`ai_status` is classified (`liveContract.classifyAiStatus`):

| ai_status | Shown as |
| --- | --- |
| completed / success / ok | AI analysis completed; findings from `ai_analysis` are shown |
| failed / error / timeout (or any `ai_error`) | AI request failed, with `ai_error` verbatim; no findings shown |
| unavailable / not_configured | AI unavailable |
| not_requested / disabled / skipped | AI not requested |
| missing | No AI information |

`GET /api/v1/ai/status` only proves Luminal is configured. The indicator shows "Verified" only after
an evaluation returns a completed `ai_status`.

## 4. Execution gateway: `POST /api/v1/actions/execute`

Body: `{ "evaluation_id": "...", "action": <response.action, or the exact action submitted> }`.

| HTTP | Shown as |
| --- | --- |
| 200 | Executed (simulated); `execution_id`/`order_id`/`reference` and `message` shown. `executed:false` or `success:false` in a 200 is shown as refused. |
| 403 | Refused: not authorized, with `detail` |
| 409 | Duplicate refused: authorization already used. An earlier successful execution is kept. |
| other | Error with status and `detail` |

The UI only enables "Execute" when `execution_allowed` is true (or review approved), but the
request is always decided by the backend. "Attempt anyway" deliberately sends a request for a
blocked evaluation so the server's 403 can be demonstrated. Nothing auto-executes unless the
"auto-execute" setting is on.

## 5. Reviews: `POST /api/v1/reviews/{evaluation_id}/decision`

Body sent: `{ "decision": "APPROVED" | "REJECTED", "reviewer": "trustlayer-console", "note": "..." }`.
After success the evaluation is re-fetched and `review_status` from the backend is shown.

## 6. Agent proposals: `POST /api/v1/agent/propose`

Body sent: `{ "agent_id": "...", "intent": "..." }`. The response is read as either a full
evaluation request or `{ action, evidence, reasoning?, scenario? }`; it is then submitted to
`POST /api/v1/evaluations`.

## 7. Policies

`GET /api/v1/policies` accepts an array or `{ items | policies: [...] }` or an object keyed by id.
The editor is generated from the returned JSON (booleans, numbers, strings, string lists, one
nested level). `PATCH /api/v1/policies/{policy_id}` sends only changed fields (a changed nested
field sends its whole parent object). The list is reloaded after PATCH; the UI shows only what
the backend confirms.

## 8. Audit events

`GET /api/v1/audit-events` accepts an array or `{ items | events | audit_events: [...] }`. Each event
reads `evaluation_id`, `event_type`/`type`, `decision`, `risk_level`, `created_at`/`timestamp`
(decision and risk may be null). Raw event JSON is kept.

## 9. Testing

- `npm test` runs live-client tests with a mocked `fetch` (request shape, normalization, 403/409,
  422 detail, network failure, policy PATCH, AI status classification).
- Against a real backend: start it on 127.0.0.1:8000, set `VITE_USE_MOCKS=false`, `npm run dev`,
  open the connection popover to see health, AI status and the OpenAPI comparison.
