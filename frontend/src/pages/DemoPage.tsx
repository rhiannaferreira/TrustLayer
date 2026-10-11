/**
 * Guided presentation mode. Every result on these scenes comes from a real evaluation run
 * through the shared store (the live backend in Live Backend Mode, the simulated engine in
 * Demo Mode). Nothing here is a hardcoded outcome.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, RotateCcw, X, Bot, Wallet, ShieldCheck, ShieldX, ShieldAlert, Syringe, FileClock, Play, Loader2, CreditCard, Radio, FlaskConical, AlertTriangle, Network } from 'lucide-react';
import { LogoMark } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Badge, DecisionBadge, RiskBadge, CheckStatusBadge, ExecutionBadge } from '@/components/ui/Badge';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { EvidenceText } from '@/components/evaluation/EvidenceText';
import { AiAnalysisView } from '@/components/evaluation/AiAnalysisView';
import { aiSuspicionFlags } from '@/components/evaluation/EvidenceList';
import { attemptLabel } from '@/components/evaluation/ExecutionPanel';
import { useAppStore, useRecord } from '@/context/AppStore';
import { useConnection } from '@/context/ConnectionContext';
import { getScenario, type ScenarioId } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { executionStatus } from '@/lib/records';
import { formatCurrency, DECISION_LABEL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { EvaluationRecord, ExecutionResult } from '@/types';

type SceneKey = 'normal' | 'unsafe' | 'adversarial';

const SCENES = [
  { id: 'problem', title: 'The problem', kicker: 'Scene 1' },
  { id: 'normal', title: 'A normal action', kicker: 'Scene 2' },
  { id: 'unsafe', title: 'An unsafe action', kicker: 'Scene 3' },
  { id: 'adversarial', title: 'Adversarial evidence', kicker: 'Scene 4' },
  { id: 'audit', title: 'Audit & observability', kicker: 'Scene 5' },
] as const;

const SCENARIO_FOR: Record<SceneKey, ScenarioId> = { normal: 'valid', unsafe: 'budget', adversarial: 'injection' };

interface SceneRun {
  recordId?: string;
  running?: boolean;
  executing?: boolean;
  error?: unknown;
  execution?: ExecutionResult;
}

export function DemoPage() {
  const navigate = useNavigate();
  const { runEvaluation, executeRecord, dataSource, setSettings } = useAppStore();
  const conn = useConnection();
  const [index, setIndex] = useState(0);
  const [runs, setRuns] = useState<Partial<Record<SceneKey, SceneRun>>>({});
  const live = dataSource === 'api';

  const exit = useCallback(() => navigate('/'), [navigate]);
  const next = useCallback(() => setIndex((i) => Math.min(SCENES.length - 1, i + 1)), []);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const restart = () => {
    setRuns({});
    setIndex(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') back();
      else if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, exit]);

  const patch = (k: SceneKey, p: Partial<SceneRun>) => setRuns((r) => ({ ...r, [k]: { ...r[k], ...p } }));

  const run = async (k: SceneKey) => {
    patch(k, { running: true, error: undefined, recordId: undefined, execution: undefined });
    try {
      const scenario = getScenario(SCENARIO_FOR[k]);
      const record = await runEvaluation({
        request: formToRequest(scenario.form, k === 'adversarial' ? 'review-demo-injected' : `evidence-demo-${k}`),
        origin: 'demo',
        scenario: `Guided demo · ${scenario.title}`,
        autoExecute: false,
        useAi: k === 'adversarial',
      });
      patch(k, { running: false, recordId: record.id });
    } catch (err) {
      patch(k, { running: false, error: err });
    }
  };

  const execute = async (k: SceneKey) => {
    const id = runs[k]?.recordId;
    if (!id) return;
    patch(k, { executing: true });
    try {
      const result = await executeRecord(id);
      patch(k, { executing: false, execution: result });
    } catch (err) {
      patch(k, { executing: false, error: err });
    }
  };

  const scene = SCENES[index];
  const demoIds = (['normal', 'unsafe', 'adversarial'] as SceneKey[]).map((k) => runs[k]?.recordId).filter((x): x is string => !!x);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-8">
        <LogoMark className="h-7 w-7" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">TrustLayer · Guided demo</p>
          <p className="text-2xs text-faint">Use ← → to move between scenes · Esc to exit</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {live ? (
            <Badge tone="accent" icon={<Radio className="h-3 w-3" aria-hidden />}>
              Live Backend Mode · backend {conn.backend}
            </Badge>
          ) : (
            <Badge tone="violet" icon={<FlaskConical className="h-3 w-3" aria-hidden />}>
              Demo Mode · simulated
            </Badge>
          )}
          <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={exit}>
            Exit demo
          </Button>
        </div>
      </header>

      {live && conn.backend === 'disconnected' && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-sm sm:mx-8" role="alert">
          <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
          <span className="text-ink">The backend is not reachable. Live scenes will show errors, not substitute results.</span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setSettings({ dataSource: 'mock' })}>
            Switch to Demo Mode (simulated)
          </Button>
        </div>
      )}

      <nav aria-label="Demo scenes" className="flex justify-center gap-1.5 px-4 pt-5">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            aria-current={i === index ? 'step' : undefined}
            className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors', i === index ? 'border-accent/50 bg-accent/10 text-ink' : i < index ? 'border-line text-muted' : 'border-line text-faint')}
          >
            <span className={cn('grid h-4 w-4 place-items-center rounded-full font-mono text-[10px]', i <= index ? 'bg-accent text-white' : 'bg-overlay text-faint')}>{i + 1}</span>
            <span className="hidden md:inline">{s.title}</span>
          </button>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8" aria-live="polite">
        <p className="label !text-accent-soft">{scene.kicker}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{scene.title}</h1>
        <div key={scene.id} className="mt-6 animate-fade-in">
          {scene.id === 'problem' && <ProblemScene />}
          {scene.id === 'normal' && (
            <RunScene
              k="normal"
              intro="PurchasePilot proposes $64.99 headphones from an approved vendor. TrustLayer evaluates it, then we send it to the execution gateway."
              runLabel="Evaluate the valid proposal"
              state={runs.normal}
              onRun={() => void run('normal')}
              onExecute={() => void execute('normal')}
              executeLabel="Execute simulated purchase through the gateway"
            />
          )}
          {scene.id === 'unsafe' && (
            <RunScene
              k="unsafe"
              intro="Now the agent picks a $129 premium pair, over the $80 limit. Watch which rule fails, then try to execute it anyway."
              runLabel="Evaluate the over-budget proposal"
              state={runs.unsafe}
              onRun={() => void run('unsafe')}
              onExecute={() => void execute('unsafe')}
              executeLabel="Attempt execution anyway"
              attemptBlocked
            />
          )}
          {scene.id === 'adversarial' && (
            <RunScene
              k="adversarial"
              intro="A product review contains hidden instructions telling AI agents to ignore the spending limit. The evaluation runs with AI analysis requested."
              runLabel="Evaluate with the poisoned review"
              state={runs.adversarial}
              onRun={() => void run('adversarial')}
              showEvidence
            />
          )}
          {scene.id === 'audit' && <AuditScene ids={demoIds} />}
        </div>
      </main>

      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:px-8">
        <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={restart}>
          Restart
        </Button>
        <span className="mx-auto font-mono text-xs text-faint">
          {index + 1} / {SCENES.length}
        </span>
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={back} disabled={index === 0}>
          Back
        </Button>
        {index < SCENES.length - 1 ? (
          <Button variant="primary" onClick={next}>
            Next <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" onClick={exit}>
            Finish
          </Button>
        )}
      </footer>
    </div>
  );
}

function ProblemScene() {
  const p = getScenario('budget').form;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-lg text-muted">
        Autonomous agents don’t just answer questions — they call tools. A purchasing agent can place orders, change payment details or delete records. One bad proposal has real financial consequences.
      </p>
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Tile icon={Bot} title="User task" body={`“${p.intent}”`} />
        <ArrowRight className="mx-auto hidden h-5 w-5 text-faint md:block" aria-hidden />
        <Tile icon={Wallet} title="Agent proposes" body={`place_order · ${p.product_name} · ${formatCurrency(p.price)} · ${p.vendor}`} tone="warn" />
        <ArrowRight className="mx-auto hidden h-5 w-5 text-faint md:block" aria-hidden />
        <Tile icon={CreditCard} title="Without a control layer" body="The checkout tool would charge the card immediately." tone="danger" />
      </div>
      <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-4">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <LogoMark className="h-5 w-5" /> TrustLayer sits between the agent and its tools
        </p>
        <p className="mt-1 text-sm text-muted">Every proposed action is evaluated against policy, evidence is treated as untrusted, and only authorized actions pass the server-side execution gateway — once.</p>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, title, body, tone }: { icon: typeof Bot; title: string; body: string; tone?: 'warn' | 'danger' }) {
  return (
    <div className={cn('rounded-xl border p-4', tone === 'danger' ? 'border-danger/30 bg-danger/[0.05]' : tone === 'warn' ? 'border-warn/30 bg-warn/[0.05]' : 'border-line bg-surface')}>
      <Icon className={cn('h-5 w-5', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-accent-soft')} aria-hidden />
      <p className="mt-2 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{body}</p>
    </div>
  );
}

interface RunSceneProps {
  k: SceneKey;
  intro: string;
  runLabel: string;
  state?: SceneRun;
  onRun: () => void;
  onExecute?: () => void;
  executeLabel?: string;
  attemptBlocked?: boolean;
  showEvidence?: boolean;
}

function RunScene({ intro, runLabel, state, onRun, onExecute, executeLabel, attemptBlocked, showEvidence }: RunSceneProps) {
  const record = useRecord(state?.recordId);
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-lg text-muted">{intro}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" variant={record ? 'secondary' : 'primary'} icon={state?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} disabled={state?.running} onClick={onRun}>
          {record ? 'Run again' : runLabel}
        </Button>
        {state?.running && <span className="text-sm text-muted">Waiting for the evaluation result…</span>}
      </div>
      {state?.error !== undefined && <ErrorBanner error={state.error} />}
      {record && <ResultCard record={record} />}
      {record && showEvidence && <EvidenceCard record={record} />}
      {record && onExecute && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="label mb-2">Execution gateway</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              variant={attemptBlocked ? 'danger' : 'primary'}
              loading={state?.executing}
              disabled={!attemptBlocked && !record.response.execution_allowed}
              onClick={onExecute}
            >
              {executeLabel}
            </Button>
            <ExecutionBadge status={executionStatus(record)} />
          </div>
          {state?.execution && <ExecutionOutcome result={state.execution} source={record.source} />}
          {state?.error !== undefined && state.execution === undefined && <p className="mt-2 text-xs text-danger">{errorMessage(state.error).detail}</p>}
        </div>
      )}
    </div>
  );
}

function ResultCard({ record }: { record: EvaluationRecord }) {
  const { response } = record;
  const Icon = response.decision === 'ALLOW' ? ShieldCheck : response.decision === 'BLOCK' ? ShieldX : ShieldAlert;
  const tone = response.decision === 'ALLOW' ? 'border-safe/35 bg-safe/[0.06] text-safe' : response.decision === 'BLOCK' ? 'border-danger/35 bg-danger/[0.06] text-danger' : 'border-warn/35 bg-warn/[0.06] text-warn';
  const important = response.checks.filter((c) => c.status !== 'PASS');
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className={cn('rounded-xl border p-5', tone)}>
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8" aria-hidden />
          <div>
            <p className="text-2xl font-semibold tracking-tight">{DECISION_LABEL[response.decision]}</p>
            <p className="font-mono text-2xs text-faint">{record.id}</p>
          </div>
          <span className="ml-auto">
            <RiskBadge risk={response.risk_level} />
          </span>
        </div>
        <p className="mt-3 text-base text-ink">{response.reason}</p>
        <p className="mt-2 text-xs text-muted">
          execution_allowed: <span className="font-mono text-ink">{String(response.execution_allowed)}</span> · {record.source === 'api' ? 'returned by the FastAPI backend' : 'simulated in the browser'}
        </p>
        <Link to={`/investigate?id=${encodeURIComponent(record.id)}&replay=1`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent-soft hover:underline">
          <Network className="h-3.5 w-3.5" aria-hidden /> Replay in the investigation view
        </Link>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="label mb-2">{important.length ? 'Rules that did not pass' : 'Policy checks'}</p>
        <ul className="space-y-1.5">
          {(important.length ? important : response.checks).slice(0, 6).map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckStatusBadge status={c.status} />
              <span className="min-w-0">
                <span className="font-medium text-ink">{c.name}</span>
                <span className="block text-xs text-muted">{c.reason}</span>
              </span>
            </li>
          ))}
          {response.checks.length === 0 && <li className="text-xs text-faint">No checks returned.</li>}
        </ul>
        {important.length > 0 && <p className="mt-2 text-2xs text-faint">{response.checks.length - important.length} other checks passed.</p>}
      </div>
    </div>
  );
}

function EvidenceCard({ record }: { record: EvaluationRecord }) {
  const flags = [...record.response.evidence_flags, ...aiSuspicionFlags(record)];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-warn/30 bg-surface p-4">
        <p className="label mb-2 flex items-center gap-1.5">
          <Syringe className="h-3.5 w-3.5 text-warn" aria-hidden /> Untrusted review text · {record.response.evidence_flags.length} flag(s) returned
        </p>
        {record.request.evidence.map((e) => (
          <EvidenceText key={e.id} content={e.content} flags={flags.filter((f) => f.evidence_id === e.id)} className="text-[13px]" />
        ))}
        <ul className="mt-3 space-y-1">
          {record.response.evidence_flags.map((f, i) => (
            <li key={i} className="text-xs text-muted">
              <Badge tone={f.severity === 'HIGH' ? 'danger' : 'warn'}>{f.severity}</Badge> {f.description}
            </li>
          ))}
          {record.response.evidence_flags.length === 0 && <li className="text-xs text-faint">No evidence flags were returned for this evaluation.</li>}
        </ul>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="label mb-2">AI investigator</p>
        <AiAnalysisView record={record} compact />
      </div>
    </div>
  );
}

function ExecutionOutcome({ result, source }: { result: ExecutionResult; source: string }) {
  const ok = result.status === 'EXECUTED';
  return (
    <div className={cn('mt-3 rounded-lg border p-3', ok ? 'border-safe/30 bg-safe/[0.06]' : result.status === 'REFUSED' ? 'border-danger/30 bg-danger/[0.06]' : 'border-warn/30 bg-warn/[0.06]')}>
      <p className={cn('font-semibold', ok ? 'text-safe' : result.status === 'REFUSED' ? 'text-danger' : 'text-warn')}>
        {attemptLabel(result)}
        {result.http_status !== undefined && <span className="ml-2 font-mono text-xs">HTTP {result.http_status}</span>}
        {result.reference && <span className="ml-2 font-mono text-xs text-ink">{result.reference}</span>}
      </p>
      <p className="mt-0.5 text-sm text-muted">{result.message}</p>
      <p className="mt-1 text-2xs text-faint">{source === 'api' ? 'Response from POST /api/v1/actions/execute.' : 'Simulated gateway in the browser (Demo Mode).'}</p>
    </div>
  );
}

function AuditScene({ ids }: { ids: string[] }) {
  const { getRecord, records } = useAppStore();
  const demoRecords = ids.map((id) => getRecord(id)).filter((r): r is EvaluationRecord => !!r);
  const summary = useMemo(() => {
    const executed = demoRecords.filter((r) => r.execution?.status === 'EXECUTED').length;
    const refused = demoRecords.reduce((n, r) => n + (r.execution_attempts ?? []).filter((a) => a.status === 'REFUSED').length, 0);
    const flagged = demoRecords.reduce((n, r) => n + r.response.evidence_flags.length, 0);
    return { executed, refused, flagged };
  }, [demoRecords]);

  if (!demoRecords.length) {
    return (
      <div className="space-y-3">
        <p className="text-lg text-muted">No scenes were run in this demo yet, so there is nothing new in the decision history to show.</p>
        <p className="text-sm text-faint">{records.length} evaluation(s) already exist in this mode — see Live Decisions.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-lg text-muted">Every evaluation from this demo is recorded in the decision history, with its checks, evidence flags, and every execution attempt.</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-wider text-faint">
              <th className="px-4 py-2.5 font-medium">Evaluation</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Decision</th>
              <th className="px-4 py-2.5 font-medium">Flags</th>
              <th className="px-4 py-2.5 font-medium">Execution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {demoRecords.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-mono text-xs text-ink">{r.id}</td>
                <td className="px-4 py-2.5 text-muted">
                  {(r.request.action.parameters.product_name as string) ?? r.request.action.type} · {formatCurrency(r.request.action.parameters.price)}
                </td>
                <td className="px-4 py-2.5">
                  <DecisionBadge decision={r.response.decision} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.response.evidence_flags.length}</td>
                <td className="px-4 py-2.5">
                  <ExecutionBadge status={executionStatus(r)} />
                  {(r.execution_attempts?.length ?? 0) > 1 && <span className="ml-1 text-2xs text-faint">{r.execution_attempts!.length} attempts</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-5">
        <p className="flex items-center gap-2 text-lg font-semibold text-ink">
          <LogoMark className="h-6 w-6" /> What TrustLayer did in this demo
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
          <Summary>
            Evaluated <b className="text-ink">{demoRecords.length}</b> agent proposal{demoRecords.length === 1 ? '' : 's'} before any tool ran.
          </Summary>
          <Summary>
            Allowed <b className="text-ink">{summary.executed}</b> simulated purchase{summary.executed === 1 ? '' : 's'} through the gateway.
          </Summary>
          <Summary>
            Refused <b className="text-ink">{summary.refused}</b> execution attempt{summary.refused === 1 ? '' : 's'} that were not authorized.
          </Summary>
          <Summary>
            Flagged <b className="text-ink">{summary.flagged}</b> suspicious evidence passage{summary.flagged === 1 ? '' : 's'}.
          </Summary>
        </ul>
        <p className="mt-4 text-base font-medium text-ink">TrustLayer makes autonomous AI agents observable, auditable, and controllable before their actions affect real systems.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/decisions" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-overlay px-3 py-1.5 text-sm text-ink hover:border-line-strong">
            <FileClock className="h-4 w-4" aria-hidden /> Open decision history
          </Link>
          <Link to="/investigate" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-overlay px-3 py-1.5 text-sm text-ink hover:border-line-strong">
            <Network className="h-4 w-4" aria-hidden /> Investigate a decision
          </Link>
        </div>
      </div>
    </div>
  );
}

function Summary({ children }: { children: ReactNode }) {
  return <li className="rounded-lg border border-line bg-surface px-3 py-2">{children}</li>;
}
