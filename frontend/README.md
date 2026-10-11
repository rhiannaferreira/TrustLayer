# TrustLayer — Frontend

**The intelligence and trust layer for autonomous AI agents.**
_Every AI action deserves a second look._

TrustLayer sits between an AI agent and the tools it wants to use. Before a protected action runs,
TrustLayer checks permissions, policy, evidence (including prompt injection), decision quality and
risk, then approves, blocks or escalates to a human. This is the web console for that workflow.

## Quick start

Requires Node 18+ (tested on Node 22).

**Demo Mode (no backend):**

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173  (open /demo for the guided demo)
```

**Live Backend Mode (FastAPI on 127.0.0.1:8000):**

```bash
# terminal 1: start the backend so it listens on http://127.0.0.1:8000
# terminal 2:
cd frontend
cp .env.example .env
# in .env: VITE_USE_MOCKS=false  (keep VITE_API_BASE_URL empty to use the dev proxy)
npm install
npm run dev
```

The dev server proxies `/health`, `/openapi.json` and `/api/*` to `VITE_BACKEND_PROXY_TARGET`
(default `http://127.0.0.1:8000`), so no CORS setup is needed. You can also switch mode and
base URL at runtime in Settings (gear icon in the top bar).

Other commands:

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build on http://localhost:4173 (same proxy)
npm test          # vitest, including live-mode tests against a mocked fetch
```

## Modes

| Mode | How to enable | What happens |
| --- | --- | --- |
| **Demo Mode** | `VITE_USE_MOCKS=true` (default) or Settings | Evaluations run in the browser with deterministic rules. Clearly labelled "Demo". |
| **Live Backend Mode** | `VITE_USE_MOCKS=false` or Settings | Every call goes to the FastAPI backend. Errors are shown; mock results are never substituted. |

Demo and live records are kept separate. The top bar indicator shows Connected / Disconnected /
Checking, and the AI state: Configured (Luminal set up), Verified (an evaluation actually
completed AI inference), Unavailable, or AI Request Failed. Click it for details, including a
check of the backend's `/openapi.json` against what the frontend expects.

The backend contract is in **[BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md)**; open questions
for the backend are in **[BACKEND_REQUESTS.md](./BACKEND_REQUESTS.md)**.

## Deploying to Vercel

Import the GitHub repo in Vercel, pick the `frontend` branch, and set **Root Directory** to `frontend`
(the Vite preset and `vercel.json` handle the rest, including client-side routes like `/demo`).
Out of the box the deployed site runs in Demo Mode and needs no backend.

For Live Backend Mode on a deployed site, host the FastAPI backend somewhere reachable over HTTPS, then:
set `VITE_API_BASE_URL` to its URL (and `VITE_USE_MOCKS=false`) in the Vercel project settings, and add the
Vercel site's origin to the backend's `CORS_ORIGINS`. The dev proxy only exists in `npm run dev`/`preview`.

## Two-minute demo script

1. **Reset demo** (sidebar, bottom) before presenting. This restores default policies and three
   labelled seed records.
2. **Overview** (`/`): what TrustLayer is, live metrics, activity and risk charts.
3. **Agent Playground** (`/playground`): keep "Best under $80" and press **Run agent**. Watch the
   six-stage pipeline, then the **APPROVE** decision and simulated checkout.
4. Choose **Premium pick** and run again. The $129 order is **BLOCKED** by the spending policy.
   Press **Retry with alternative** to create a new proposal and a new evaluation.
5. **Attack Lab** (`/attack-lab`): pick **Prompt injection** and run it. The malicious review is
   highlighted, the action is held for review, and the gateway refuses to execute. Edit the evidence
   text or price and run again to see the decision change ("Previous run → now").
6. **Policies** (`/policies`): raise the limit to $150, then rerun the premium pick in the
   playground. It is now approved.
7. **Audit Trail** (`/audit`): every run is there with checks, policy version, execution and review
   state. Open one for the JSON view, or **Export JSON**.

## What is real and what is simulated

* **Mock evaluator** (`src/services/evaluationSimulator.ts`): deterministic rules for spending
  limit, vendor allowlist, tool permissions, restricted actions and a small set of injection
  patterns (`src/lib/injection.ts`). These demonstrate the flow. They are not comprehensive attack
  detection.
* **Agent planner** (`src/services/agentPlanner.ts`): PurchasePilot's proposals come from keyword
  rules, not an LLM. The UI labels this.
* **Pipeline animation**: in mock mode the stage-by-stage timing is a visualization of an
  already-computed result, and the UI says so. In Live API mode the stages show the checks the
  backend returned.
* **Tool gateway** (`src/services/toolGateway.ts`): a separate module that re-checks authorization
  before running a simulated checkout. It refuses `BLOCK`, and refuses `REVIEW_REQUIRED` unless a
  review approval is recorded. No real store or payment provider is contacted. In production this
  check must be enforced server-side; frontend validation is not a security boundary.
* **Human review**: in mock mode, "Simulate approval / rejection" records a decision by
  `demo-operator`. It is never presented as a real reviewer.
* **Audit trail**: local records live in `localStorage`. They are not an immutable audit log.

## Architecture

```
src/
  components/
    layout/        App shell, sidebar, top bar, connection settings
    dashboard/     Metric cards, activity + risk charts, recent decisions, agent cards
    playground/    Agent panel and decision inspector
    evaluation/    Pipeline, checks, evidence highlighting, timeline, execution flow, review controls
    attack-lab/    Scenario picker, editable attack form, result view
    policies/      Per-policy config editors
    audit/         Audit event drawer
    ui/            Buttons, badges, panels, overlays, toggles, JSON viewer…
  context/         AppStore (shared state + persistence), toasts
  data/            Demo agents, catalog, default policies, attack scenarios, canned evidence
  hooks/           Pipeline runner, backend health, theme, chart colours
  lib/             Formatting, injection heuristics, record helpers, pipeline mapping
  services/        api.ts (HTTP client), endpoints.ts, mockApi.ts, evaluationSimulator.ts,
                   agentPlanner.ts, toolGateway.ts
  pages/           One component per route
  types/           Wire contract + frontend record types
```

* **One store for everything.** `AppStoreProvider` holds evaluations, policies and settings. An
  evaluation run in Attack Lab shows up immediately on the Overview, Live Decisions and Audit
  Trail. A policy change bumps the policy version and applies to the next evaluation.
* **One place for URLs.** Every backend path is in `services/endpoints.ts`.
* **Design tokens.** Colours are CSS variables in `src/index.css` (dark and light themes) and are
  exposed to Tailwind in `tailwind.config.js`.

## Routes

| Route | Page |
| --- | --- |
| `/` | Overview dashboard |
| `/playground` | Agent Playground |
| `/decisions` | Live Decisions |
| `/investigate` | Decision Investigation (`?id=<evaluation_id>&replay=1`) |
| `/attack-lab` | Attack Lab (original vs. modified comparison) |
| `/demo` | Guided demo (full screen, 5 scenes) |
| `/test-console` | Test Console: runs a pass/fail suite (decisions, gateway 403/409, review, AI status) against the active backend, plus a raw request sender |
| `/policies` | Policies |
| `/audit` | Audit Trail (`/audit?id=<evaluation_id>` opens a record) |
