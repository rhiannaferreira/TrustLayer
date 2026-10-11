# Requests for the backend

Checked against `feature/backend` (read only). The frontend has been adjusted to the backend's real
contract (APPROVE/REJECT, `scenario` on propose, `config` patches, execute 409 variants). What is
still missing or unclear:

1. **Review and execution state on reads.** `GET /api/v1/evaluations` and `/{id}` always return
   `review_status: null` and `executed: false`. Please return the stored `review_status` and an
   `executed` flag (plus execution_id) so history is correct after a reload or from another browser.
2. **Request on list.** `GET /api/v1/evaluations` omits the original request (intent, evidence). Including
   `original_request` (as the detail endpoint does) would avoid reconstructed history rows.
3. **Escalate to review.** No endpoint moves an ALLOW/BLOCK evaluation into review; the button is disabled in Live mode.
4. **Agent permissions.** The evaluation request has no permissions/context field, so the UI cannot show tool
   authorization against the agent's own permission list.
5. **Stage identifier on checks.** An optional `checks[].stage` would replace name matching in the investigation graph.
6. **Flag origin.** `evidence_flags[].origin` (`deterministic` | `ai` | `policy`). Today all flags are deterministic regex
   hits; AI findings exist only as the free text in `ai_analysis`.
7. **`ai_analysis` structure.** It is a plain string; a structured `{ summary, findings[] }` would allow per-finding display.
8. **Audit events** carry no `decision`/`risk_level`; adding them to evaluation events would fill those columns.
9. **`ai_status`** reads `error` when Luminal is not configured and `use_ai` is true. A distinct `unavailable`/`not_configured`
   would let the UI distinguish "not set up" from "request failed".
10. **409 bodies.** Execute returns 409 for both "already used" and "policies changed". The UI tells them apart by message text;
    a machine-readable `code` would be more robust.
11. **Review note.** `ReviewDecision` has no `note`; the UI no longer sends one.
