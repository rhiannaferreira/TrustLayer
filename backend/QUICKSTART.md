# TrustLayer quickstart

Put TrustLayer between your agent and the real world in three steps.

1. **Create an agent** in the app (Agents page). Choose the actions it may ever attempt and its limits. Copy the API key; it is shown once.
2. **Ask before acting.** Your agent sends the action it wants to take; TrustLayer answers `ALLOW`, `REVIEW` or `BLOCK`.
3. **Act only on ALLOW.** On `REVIEW`, wait for a human in the Review Queue; on `BLOCK`, stop.

```bash
curl -X POST https://trust-layer-gz8n.vercel.app/api/v1/gate/check \
  -H "Authorization: Bearer tl_YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"action":"finance.pay_invoice","parameters":{"amount":240,"payee":"CloudHost Inc"},
       "goal":"Pay the hosting invoice",
       "evidence":[{"id":"inv-1","kind":"invoice","content":"CloudHost Inc total $240.00"}]}'
```

Clients: `clients/python/trustlayer.py` (stdlib only) and `clients/js/trustlayer.mjs`.

```python
from trustlayer import TrustLayer
tl = TrustLayer("https://trust-layer-gz8n.vercel.app", "tl_YOUR_KEY")
v = tl.check("db.run_query", {"sql": "DELETE FROM users", "environment": "production"})
if v["decision"] == "REVIEW":
    v = tl.wait_for_review(v["decision_id"])
if v["allowed"]:
    run_the_real_query()
```

## What is enforced, and what is not

- The agent identity comes from the API key, never from the request body. Permissions, limits, evidence scanning and ethics checks run on the server; the model's text can never grant permission.
- TrustLayer **decides**; it does not execute for external agents. Your agent must honour the verdict. (Inside the app's own Agent workspace, ALLOWED steps run against sandbox tools only.)
- Known actions: `web.research`, `db.run_query`, `data.read_records`, `data.export_records`, `finance.pay_invoice`, `finance.transfer_funds`, `workplace.send_email`, `workplace.delete_files`, `workplace.grant_access`, `health.access_record`, `health.suggest_medication`, `commerce.purchase`. Anything else is denied by default. `GET /api/v1/trust/tools` lists them with parameters.
- Management endpoints (create agents, edit limits, review) are open unless `TRUSTLAYER_ADMIN_TOKEN` is set on the backend, in which case they need an `X-Admin-Token` header. The app does not yet send that header, so leave it unset for the hackathon demo.

## Persistence

Set `DATABASE_URL` to a Postgres connection string (for example a free Neon or Supabase database) and audit history, agents, keys and decisions survive restarts. Without it the backend uses SQLite in `/tmp`, which resets on cold starts.
