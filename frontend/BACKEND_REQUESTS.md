# Requests and open questions for the backend

The frontend was built from the described contract without access to the backend code or its
OpenAPI spec. Each item below is either an assumption the frontend makes (please confirm or
correct) or something the UI would use if the backend provided it. The connection popover's
OpenAPI check will show mismatches once the backend is running.

## Assumptions to confirm

1. **Review decision body.** Sent as `{ "decision": "APPROVED" | "REJECTED", "reviewer": "trustlayer-console", "note" }`.
   Please confirm field names and accepted values.
2. **Agent proposal body.** Sent as `{ "agent_id", "intent" }`. Please confirm, and confirm the
   response shape (full evaluation request, or `{ action, evidence }`).
3. **Execute response (200).** The frontend reads `execution_id` / `order_id` / `reference` and
   `message`. Please confirm the field names.
4. **403 vs 409.** 403 = not authorized, 409 = authorization already used. Please confirm no
   other status codes are used for these cases.
5. **Policy schema.** The editor is generic; a documented schema per policy (and which fields are
   editable) would allow validation and better labels.
6. **List envelopes.** `GET /evaluations` and `GET /audit-events` accept a bare array or
   `{ "items": [...] }`. Please confirm which.

## Missing contracts the UI would use

1. **Escalate to human review.** There is no endpoint to move an ALLOW/BLOCK evaluation into
   review, so "Request human review" is disabled in Live Backend Mode.
2. **Agent permissions / context.** The evaluation request has no field for agent permissions or
   reasoning, so they are not sent and tool authorization cannot be checked server-side from the
   UI's agent profile. Suggest an optional `context: { permissions: [], reasoning }`.
3. **Per-stage check identifier.** The investigation graph maps checks to its 8 stages by name.
   An explicit `checks[].stage` (proposal, tool, product, spending, vendor, evidence, decision,
   execution) would remove the guesswork.
4. **Evidence flag origin.** Please add `evidence_flags[].origin`: `deterministic` | `ai` | `policy`,
   so the Attack Lab can separate deterministic detection from AI findings without inference.
5. **`ai_analysis` schema.** Currently shown as a summary plus raw JSON. A stable shape
   (e.g. `{ summary, risk, findings: [{ title, severity, evidence_id }] }`) would allow richer display.
6. **Per-stage timings.** The replay never invents timings; if the backend recorded them
   (`checks[].duration_ms`) the investigation view could show them.
7. **Execution record on the evaluation.** `executed` is a boolean; an execution reference and
   timestamp on `GET /evaluations/{id}` would let history show executions done in other sessions.
