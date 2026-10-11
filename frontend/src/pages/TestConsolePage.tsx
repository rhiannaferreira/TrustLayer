import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Play, RotateCcw, Send, CheckCircle2, XCircle, CircleDashed, AlertTriangle, Loader2, Radio } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { JsonView } from '@/components/ui/JsonView';
import { useAppStore } from '@/context/AppStore';
import { useConnection } from '@/context/ConnectionContext';
import { getScenario, type ScenarioId } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { TEST_CASES, type CaseStatus, type Ctx, type Ops, type Scenario } from '@/lib/testSuite';
import { cn } from '@/lib/cn';
import type { ApiExchange } from '@/types';

interface CaseState {
  status: CaseStatus;
  actual?: string;
  evaluationId?: string;
  ms?: number;
}

const MOCK_FIXTURE: Record<Scenario, ScenarioId> = { valid: 'valid', budget: 'budget', prompt_injection: 'injection', unauthorized: 'unauthorized' };

const STATUS_UI: Record<CaseStatus, { icon: typeof CheckCircle2; cls: string; label: string }> = {
  idle: { icon: CircleDashed, cls: 'text-faint', label: 'Not run' },
  running: { icon: Loader2, cls: 'text-accent-soft animate-spin', label: 'Running' },
  pass: { icon: CheckCircle2, cls: 'text-safe', label: 'Pass' },
  fail: { icon: XCircle, cls: 'text-danger', label: 'Fail' },
  error: { icon: AlertTriangle, cls: 'text-warn', label: 'Error' },
};

export function TestConsolePage() {
  const store = useAppStore();
  const { runEvaluation, executeRecord, decideReview, getRecord, proposeLive, dataSource, settings } = store;
  const connection = useConnection();
  const live = dataSource === 'api';
  const [states, setStates] = useState<Record<string, CaseState>>({});
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const cases = useMemo(() => TEST_CASES.filter((c) => live || !c.liveOnly), [live]);
  const counts = useMemo(() => {
    const vals = cases.map((c) => states[c.id]?.status ?? 'idle');
    return { pass: vals.filter((s) => s === 'pass').length, fail: vals.filter((s) => s === 'fail').length, error: vals.filter((s) => s === 'error').length };
  }, [cases, states]);

  const ops: Ops = useMemo(
    () => ({
      request: async (scenario) => {
        if (!live) return formToRequest(getScenario(MOCK_FIXTURE[scenario]).form);
        const trace: ApiExchange[] = [];
        return (await proposeLive('Find the best wireless headphones under $80', scenario, trace)).request;
      },
      evaluate: (request, useAi) => runEvaluation({ request, origin: 'test', scenario: 'test-console', autoExecute: false, useAi }),
      execute: (id) => executeRecord(id),
      approve: (id) => decideReview(id, 'APPROVED'),
      get: (id) => getRecord(id),
    }),
    [live, runEvaluation, executeRecord, decideReview, getRecord, proposeLive],
  );

  const set = (id: string, s: CaseState) => setStates((prev) => ({ ...prev, [id]: s }));

  const runOne = async (id: string, ctx: Ctx) => {
    const c = TEST_CASES.find((t) => t.id === id)!;
    set(id, { status: 'running' });
    const t0 = performance.now();
    try {
      const out = await c.run(ops, ctx);
      set(id, { status: out.pass ? 'pass' : 'fail', actual: out.actual, evaluationId: out.evaluationId, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      set(id, { status: 'error', actual: err instanceof Error ? err.message : String(err), ms: Math.round(performance.now() - t0) });
    }
  };

  const runAll = async () => {
    setRunning(true);
    stop.current = false;
    setStates({});
    const ctx: Ctx = { records: {} };
    for (const c of cases) {
      if (stop.current) break;
      await runOne(c.id, ctx);
    }
    setRunning(false);
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <Badge tone="accent">Test Console</Badge>
            <Badge tone={live ? 'accent' : 'violet'} icon={live ? <Radio className="h-3 w-3" aria-hidden /> : <FlaskConical className="h-3 w-3" aria-hidden />}>
              {live ? 'Live backend' : 'Demo Mode · simulated'}
            </Badge>
          </div>
        }
        title="Test console"
        description={
          live
            ? 'Runs real requests against the backend and checks the decisions, gateway responses and AI status it returns. Every run is added to history.'
            : 'Runs the same checks against the in-browser demo engine. Switch to Live Backend in Settings to test the real backend.'
        }
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Play className="h-3.5 w-3.5" />} onClick={() => void runAll()} loading={running} disabled={running || (live && connection.backend !== 'connected')}>
              Run all
            </Button>
            <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setStates({})} disabled={running}>
              Clear
            </Button>
          </div>
        }
      />

      {live && connection.backend !== 'connected' && (
        <p className="mb-3 rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2 text-sm text-warn">The backend is not connected, so the suite cannot run. Check the connection indicator in the top bar.</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <Badge tone="safe">{counts.pass} passed</Badge>
        <Badge tone={counts.fail ? 'danger' : 'neutral'}>{counts.fail} failed</Badge>
        <Badge tone={counts.error ? 'warn' : 'neutral'}>{counts.error} errors</Badge>
        <span className="text-xs text-faint">
          {cases.length} cases · AI analysis is {settings.useAi ? 'on' : 'off'} for normal runs; only the AI case requests it
        </span>
      </div>

      <Panel title="Suite" subtitle="Cases run in order; later cases reuse earlier evaluations">
        <ol className="divide-y divide-line">
          {cases.map((c, i) => {
            const st = states[c.id] ?? { status: 'idle' as CaseStatus };
            const ui = STATUS_UI[st.status];
            return (
              <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                <ui.icon className={cn('mt-0.5 h-4 w-4 shrink-0', ui.cls)} aria-label={ui.label} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {i + 1}. {c.title}
                  </p>
                  <p className="text-xs text-muted">Expected: {c.expectation}</p>
                  {st.actual && (
                    <p className={cn('mt-1 break-words font-mono text-2xs', st.status === 'pass' ? 'text-safe' : st.status === 'fail' ? 'text-danger' : 'text-warn')}>
                      Actual: {st.actual}
                    </p>
                  )}
                  {st.evaluationId && (
                    <Link to={`/investigate?id=${encodeURIComponent(st.evaluationId)}`} className="mt-0.5 inline-block text-2xs text-accent-soft hover:underline">
                      Inspect {st.evaluationId}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {st.ms !== undefined && <span className="font-mono text-2xs text-faint">{st.ms} ms</span>}
                  <Badge tone={st.status === 'pass' ? 'safe' : st.status === 'fail' ? 'danger' : st.status === 'error' ? 'warn' : 'neutral'}>{ui.label}</Badge>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-2xs text-faint">
          Cases that need an earlier result run against whatever the earlier case produced; running one case alone is not supported because the gateway tests depend on a fresh evaluation.
        </p>
      </Panel>

      {live ? <RawRequest base={settings.apiBaseUrl} /> : null}
    </>
  );
}

const PRESETS: Array<{ label: string; method: string; path: string; body: string }> = [
  { label: 'Health', method: 'GET', path: '/health', body: '' },
  { label: 'Policies', method: 'GET', path: '/api/v1/policies', body: '' },
  { label: 'Audit events', method: 'GET', path: '/api/v1/audit-events', body: '' },
  {
    label: 'Evaluate (over budget)',
    method: 'POST',
    path: '/api/v1/evaluations',
    body: JSON.stringify(
      { agent_id: 'purchase-pilot', intent: 'Find headphones under $80', action: { type: 'place_order', parameters: { product_id: 'hp-001', price: 129, vendor: 'AudioMart' } }, evidence: [], policy_id: 'shopping-default', use_ai: false },
      null,
      2,
    ),
  },
  { label: 'Execute (unknown id)', method: 'POST', path: '/api/v1/actions/execute', body: JSON.stringify({ evaluation_id: 'does-not-exist', action: { type: 'place_order', parameters: {} } }, null, 2) },
];

function RawRequest({ base }: { base: string }) {
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/health');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status?: number; ms: number; body?: unknown; error?: string } | null>(null);

  const send = async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      let parsed: unknown;
      if (body.trim()) parsed = JSON.parse(body);
      const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(parsed !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: parsed !== undefined ? JSON.stringify(parsed) : undefined,
      });
      const text = await res.text();
      let out: unknown = text;
      try {
        out = JSON.parse(text);
      } catch {
        /* non-JSON body is shown as text */
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - t0), body: out });
    } catch (err) {
      setResult({ ms: Math.round(performance.now() - t0), error: err instanceof SyntaxError ? `Request body is not valid JSON: ${err.message}` : err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mt-4" title="Raw request" subtitle="Send any request straight to the backend and see the exact response" icon={<Send className="h-3.5 w-3.5" />}>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="rounded-md border border-line px-2 py-1 text-2xs text-muted hover:bg-overlay/40"
            onClick={() => {
              setMethod(p.method);
              setPath(p.path);
              setBody(p.body);
              setResult(null);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Method" className="input w-28" value={method} onChange={(e) => setMethod(e.target.value)}>
          {['GET', 'POST', 'PATCH'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input aria-label="Path" className="input min-w-0 flex-1 font-mono" value={path} onChange={(e) => setPath(e.target.value)} />
        <Button variant="primary" icon={<Send className="h-3.5 w-3.5" />} loading={busy} onClick={() => void send()} disabled={!path.startsWith('/')}>
          Send
        </Button>
      </div>
      {method !== 'GET' && <textarea aria-label="JSON body" className="input mt-2 h-40 w-full font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />}
      {result && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            {result.status !== undefined && <Badge tone={result.status < 300 ? 'safe' : result.status < 500 ? 'warn' : 'danger'}>HTTP {result.status}</Badge>}
            <span className="font-mono text-faint">{result.ms} ms</span>
          </div>
          {result.error ? <p className="text-sm text-danger">{result.error}</p> : <JsonView value={result.body} maxHeight="max-h-96" />}
        </div>
      )}
    </Panel>
  );
}
