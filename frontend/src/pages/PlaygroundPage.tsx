import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bot, ScanSearch, History, ListChecks, Braces, ChevronDown, Network, Sparkles, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge, DecisionBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Overlay';
import { Toggle } from '@/components/ui/Toggle';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { AgentPanel } from '@/components/playground/AgentPanel';
import { InspectorPanel } from '@/components/playground/InspectorPanel';
import { AgentTimeline, buildAgentTimeline, type RunPhase } from '@/components/playground/AgentTimeline';
import { EvidenceList, aiSuspicionFlags } from '@/components/evaluation/EvidenceList';
import { ExchangeLog } from '@/components/evaluation/ExchangeLog';
import { useAppStore, useRecord } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { planFromAlternative, planFromGoal, type AgentProposal } from '@/services/agentPlanner';
import { effectiveReviewStatus } from '@/lib/records';
import { PLAYGROUND_PRESETS } from '@/data/scenarios';
import { formatCurrency, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ApiExchange } from '@/types';

const ACTIVITY_STEP_MS = 260;
const SESSION_KEY = 'trustlayer.playground.v2';

interface SessionState {
  goal: string;
  recordId: string | null;
  runIds: string[];
}

function loadSession(): SessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    /* ignore */
  }
  return { goal: PLAYGROUND_PRESETS[0].goal, recordId: null, runIds: [] };
}

export function PlaygroundPage() {
  const initial = useRef(loadSession()).current;
  const { runEvaluation, requestReview, dataSource, getRecord, proposeLive, settings } = useAppStore();
  const { notify } = useToast();
  const navigate = useNavigate();
  const live = dataSource === 'api';

  const [goal, setGoal] = useState(initial.goal);
  const [liveScenario, setLiveScenario] = useState('valid');
  const [activity, setActivity] = useState<string[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [proposalSource, setProposalSource] = useState<'backend-seeded' | 'demo-planner' | null>(null);
  const [proposalScenario, setProposalScenario] = useState<string | undefined>();
  const [recordId, setRecordId] = useState<string | null>(initial.recordId);
  const [runIds, setRunIds] = useState<string[]>(initial.runIds);
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [errorAt, setErrorAt] = useState<'proposal' | 'evaluation' | null>(null);
  const [pendingExchanges, setPendingExchanges] = useState<ApiExchange[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [useAi, setUseAi] = useState(settings.useAi);
  const cancelRef = useRef(0);

  const record = useRecord(recordId);
  const running = phase === 'proposing' || phase === 'evaluating';

  // Restore the last run (e.g. after navigating away and back).
  useEffect(() => {
    const existing = initial.recordId ? getRecord(initial.recordId) : undefined;
    if (existing) {
      setProposal({ activity: [], request: existing.request, reasoning: existing.request.context?.agent_reasoning ?? '', path: 'budget' });
      setPhase('done');
      setStartedAt(existing.response.created_at);
      setProposalSource(existing.source === 'api' ? 'backend-seeded' : 'demo-planner');
    } else {
      setRecordId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ goal, recordId, runIds }));
    } catch {
      /* ignore */
    }
  }, [goal, recordId, runIds]);

  const fail = (err: unknown, at: 'proposal' | 'evaluation') => {
    setError(err);
    setErrorAt(at);
    setPhase('error');
    notify({ tone: 'danger', title: at === 'proposal' ? 'Agent proposal failed' : 'Evaluation failed', description: errorMessage(err).detail });
  };

  const execute = useCallback(
    async (getPlan: () => Promise<{ plan: AgentProposal; source: 'backend-seeded' | 'demo-planner'; scenario?: string; trace: ApiExchange[] }>, retryOf?: string) => {
      const token = ++cancelRef.current;
      setPhase('proposing');
      setStartedAt(new Date().toISOString());
      setError(null);
      setErrorAt(null);
      setRecordId(null);
      setProposal(null);
      setProposalSource(null);
      setProposalScenario(undefined);
      setActivity([]);
      setPendingExchanges([]);

      let planned: Awaited<ReturnType<typeof getPlan>>;
      try {
        planned = await getPlan();
      } catch (err) {
        if (token === cancelRef.current) fail(err, 'proposal');
        return;
      }
      if (token !== cancelRef.current) return;
      setPendingExchanges(planned.trace);
      for (const line of planned.plan.activity) {
        await new Promise((r) => setTimeout(r, ACTIVITY_STEP_MS));
        if (token !== cancelRef.current) return;
        setActivity((a) => [...a, line]);
      }
      setProposal(planned.plan);
      setProposalSource(planned.source);
      setProposalScenario(planned.scenario);
      setPhase('evaluating');

      try {
        const result = await runEvaluation({ request: planned.plan.request, origin: 'playground', retryOf, scenario: planned.scenario ?? planned.plan.path, useAi, priorExchanges: planned.trace });
        if (token !== cancelRef.current) return;
        setRecordId(result.id);
        setRunIds((ids) => [result.id, ...ids.filter((x) => x !== result.id)].slice(0, 8));
        setPhase('done');
      } catch (err) {
        if (token !== cancelRef.current) return;
        fail(err, 'evaluation');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runEvaluation, useAi],
  );

  const onRun = () =>
    void execute(async () => {
      if (!live) return { plan: planFromGoal(goal), source: 'demo-planner' as const, trace: [] };
      const trace: ApiExchange[] = [];
      try {
        const p = await proposeLive(goal, liveScenario, trace);
        const plan: AgentProposal = {
          path: 'budget',
          reasoning: p.reasoning,
          request: { ...p.request, context: p.reasoning ? { agent_reasoning: p.reasoning } : undefined },
          activity: [
            `Task sent to the backend agent: “${goal}”`,
            `Backend returned a seeded proposal${p.scenario ? ` (scenario ${p.scenario})` : ''}.`,
            `Proposed ${p.request.action.type}${typeof p.request.action.parameters.price === 'number' ? ` · ${formatCurrency(p.request.action.parameters.price)}` : ''}${p.request.action.parameters.vendor ? ` · ${p.request.action.parameters.vendor}` : ''}.`,
            'Submitting to TrustLayer for authorization.',
          ],
        };
        return { plan, source: 'backend-seeded' as const, scenario: p.scenario, trace };
      } catch (err) {
        setPendingExchanges(trace);
        throw err;
      }
    });

  const onStop = () => {
    cancelRef.current++;
    setPhase(recordId ? 'done' : 'idle');
    setActivity((a) => [...a, 'Run stopped by user. (A request already sent to the backend may still complete there.)']);
  };

  const onRetry = () => {
    if (!record) return;
    const alt = record.response.alternatives[0];
    if (!alt) return;
    void execute(async () => ({ plan: planFromAlternative(alt, record.request, record.id), source: live ? ('demo-planner' as const) : ('demo-planner' as const), trace: [] }), record.id);
  };

  const onRequestReview = async () => {
    if (!record) return;
    setReviewBusy(true);
    try {
      await requestReview(record.id, 'Requested from Agent Playground');
      notify({ tone: 'info', title: 'Human review requested', description: 'Added to the local demo review queue. No real reviewer is notified.' });
    } catch (err) {
      notify({ tone: 'danger', title: 'Review request failed', description: errorMessage(err).detail });
    } finally {
      setReviewBusy(false);
    }
  };

  const steps = useMemo(
    () =>
      buildAgentTimeline({
        phase,
        source: dataSource,
        proposalSource,
        proposalScenario,
        startedAt,
        record: phase === 'done' ? record ?? null : null,
        useAi: live && useAi,
        errorAt,
        errorMessage: error ? errorMessage(error).detail : undefined,
        executing,
      }),
    [phase, dataSource, proposalSource, proposalScenario, startedAt, record, live, useAi, errorAt, error, executing],
  );

  const status = currentActivity(phase, live, useAi, record ? effectiveReviewStatus(record) : 'NONE', executing);
  const exchanges = record?.exchanges ?? pendingExchanges;

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Agent Operations</Badge>
            {live ? <Badge tone="accent">Live backend · seeded agent proposals</Badge> : <Badge tone="violet">Demo Mode · simulated agent and engine</Badge>}
          </div>
        }
        title="Watch an agent ask for permission"
        description="Give PurchasePilot a task. Follow every step from proposal to evaluation to (optional) execution, and inspect the exact requests and responses."
        actions={
          live && (
            <label className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent-soft" aria-hidden />
              AI analysis
              <Toggle size="sm" checked={useAi} onChange={setUseAi} label="Request AI analysis" disabled={running} />
            </label>
          )
        }
      />

      <div className={cn('mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', status.tone)} role="status" aria-live="polite">
        {status.busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        <span className="font-medium">{status.label}</span>
        {status.detail && <span className="text-xs text-muted">{status.detail}</span>}
      </div>

      {error !== null && (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
        <Panel title="AI agent" subtitle={live ? 'Backend agent (seeded scenarios)' : 'Rule-based demo planner'} icon={<Bot className="h-3.5 w-3.5" />}>
          <AgentPanel goal={goal} onGoalChange={setGoal} onRun={onRun} onStop={onStop} running={running} activity={activity} proposal={proposal} live={live} scenario={liveScenario} onScenarioChange={setLiveScenario} />
        </Panel>

        <Panel
          title="Agent activity timeline"
          subtitle="Only backend-confirmed results are marked as such"
          icon={<ListChecks className="h-3.5 w-3.5 text-accent-soft" />}
          className="border-accent/25"
          actions={
            record && (
              <Link to={`/investigate?id=${encodeURIComponent(record.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-soft hover:underline">
                <Network className="h-3.5 w-3.5" aria-hidden /> Investigate
              </Link>
            )
          }
        >
          <AgentTimeline steps={steps} />
        </Panel>

        <Panel title="Decision inspector" subtitle="Authorization, execution & audit" icon={<ScanSearch className="h-3.5 w-3.5" />}>
          <InspectorPanel
            record={phase === 'done' ? record ?? null : null}
            waiting={running}
            onInspectEvidence={() => setEvidenceOpen(true)}
            onViewAudit={() => record && navigate(`/audit?id=${encodeURIComponent(record.id)}`)}
            onRequestReview={() => void onRequestReview()}
            onRetry={onRetry}
            reviewBusy={reviewBusy}
            retryDisabled={!record || record.response.alternatives.length === 0 || running}
            onExecutingChange={setExecuting}
          />
        </Panel>
      </div>

      <section className="card mt-4">
        <button onClick={() => setJsonOpen((o) => !o)} aria-expanded={jsonOpen} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-raised text-muted">
            <Braces className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Request / response inspector</span>
            <span className="block text-xs text-faint">{live ? 'Exact JSON sent to and received from the FastAPI backend for this run' : 'Demo Mode: in-browser calls, no HTTP requests are made'}</span>
          </span>
          <Badge>{exchanges.length} call{exchanges.length === 1 ? '' : 's'}</Badge>
          <ChevronDown className={cn('h-4 w-4 text-faint transition-transform', jsonOpen && 'rotate-180')} aria-hidden />
        </button>
        {jsonOpen && (
          <div className="border-t border-line p-4">
            <ExchangeLog exchanges={exchanges} defaultOpen />
          </div>
        )}
      </section>

      {runIds.length > 0 && (
        <Panel className="mt-4" title="Runs in this session" subtitle="Retries create new evaluations; earlier results are never modified" icon={<History className="h-3.5 w-3.5" />}>
          <ul className="flex flex-wrap gap-2">
            {runIds.map((id) => {
              const r = getRecord(id);
              if (!r) return null;
              const active = id === recordId;
              return (
                <li key={id}>
                  <button
                    onClick={() => {
                      cancelRef.current++;
                      setRecordId(id);
                      setPhase('done');
                      setStartedAt(r.response.created_at);
                      setError(null);
                      setErrorAt(null);
                      setProposalSource(r.source === 'api' ? 'backend-seeded' : 'demo-planner');
                      setProposal({ activity: [], request: r.request, reasoning: r.request.context?.agent_reasoning ?? '', path: 'budget' });
                      setActivity([]);
                    }}
                    className={active ? 'flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/[0.06] px-2.5 py-1.5 text-left' : 'flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-line-strong'}
                  >
                    <DecisionBadge decision={r.response.decision} />
                    <span className="text-xs text-ink">{(r.request.action.parameters.product_name as string) ?? r.request.action.type}</span>
                    {r.request.action.parameters.price !== undefined && <span className="font-mono text-2xs text-faint">{formatCurrency(r.request.action.parameters.price)}</span>}
                    <span className="font-mono text-2xs text-faint">{formatTime(r.response.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Modal open={evidenceOpen && !!record} onClose={() => setEvidenceOpen(false)} title="Evidence inspection" subtitle="All third-party content is treated as untrusted data" width="max-w-2xl">
        {record && <EvidenceList evidence={record.request.evidence} flags={record.response.evidence_flags} aiFlags={aiSuspicionFlags(record)} />}
      </Modal>
    </>
  );
}

function currentActivity(phase: RunPhase, live: boolean, useAi: boolean, review: string, executing: boolean): { label: string; detail?: string; tone: string; busy?: boolean } {
  const accent = 'border-accent/30 bg-accent/[0.06] text-accent-soft';
  if (executing) return { label: 'Authorizing a simulated action', detail: live ? 'POST /api/v1/actions/execute — the backend gateway decides.' : 'Simulated gateway re-checks the decision.', tone: accent, busy: true };
  switch (phase) {
    case 'proposing':
      return { label: live ? 'Using a seeded agent proposal' : 'Demo planner choosing an action', detail: live ? 'POST /api/v1/agent/propose' : 'Deterministic rules, not an LLM.', tone: accent, busy: true };
    case 'evaluating':
      return {
        label: live && useAi ? 'Running deterministic checks · calling Luminal for AI analysis' : 'Running deterministic checks',
        detail: live ? 'Waiting for the backend response; nothing is shown until it arrives.' : 'In-browser demo engine.',
        tone: accent,
        busy: true,
      };
    case 'done':
      if (review === 'PENDING') return { label: 'Awaiting human review', detail: 'Execution stays blocked until a reviewer decides.', tone: 'border-warn/30 bg-warn/[0.06] text-warn' };
      return { label: 'Decision returned', detail: 'Execution happens only if you choose to proceed.', tone: 'border-line bg-raised/50 text-ink' };
    case 'error':
      return { label: 'Run failed', detail: 'See the error below. No result was substituted.', tone: 'border-danger/30 bg-danger/[0.06] text-danger' };
    default:
      return { label: 'Idle', detail: 'Enter a task and press Run agent.', tone: 'border-line bg-raised/50 text-muted' };
  }
}
