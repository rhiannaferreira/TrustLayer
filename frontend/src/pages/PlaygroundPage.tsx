import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Workflow, ScanSearch, History } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge, DecisionBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Overlay';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { AgentPanel } from '@/components/playground/AgentPanel';
import { InspectorPanel } from '@/components/playground/InspectorPanel';
import { PipelineView } from '@/components/evaluation/PipelineView';
import { EvidenceList } from '@/components/evaluation/EvidenceList';
import { useAppStore, useRecord } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { usePipelineRun } from '@/hooks/usePipelineRun';
import { planFromAlternative, planFromGoal, type AgentProposal } from '@/services/agentPlanner';
import { PLAYGROUND_PRESETS } from '@/data/scenarios';
import { formatCurrency, formatTime } from '@/lib/format';

const ACTIVITY_STEP_MS = 320;
const SESSION_KEY = 'trustlayer.playground.v1';

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
  const { runEvaluation, requestReview, dataSource, getRecord } = useAppStore();
  const { notify } = useToast();
  const navigate = useNavigate();
  const pipeline = usePipelineRun();

  const [goal, setGoal] = useState(initial.goal);
  const [activity, setActivity] = useState<string[]>([]);
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [recordId, setRecordId] = useState<string | null>(initial.recordId);
  const [runIds, setRunIds] = useState<string[]>(initial.runIds);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const cancelRef = useRef(0);

  const record = useRecord(recordId);
  const visibleRecord = pipeline.phase === 'done' ? record ?? null : null;

  // Restore the last run (e.g. after navigating away and back).
  useEffect(() => {
    const existing = initial.recordId ? getRecord(initial.recordId) : undefined;
    if (existing) {
      pipeline.showInstant(existing);
      setProposal({ activity: [], request: existing.request, reasoning: existing.request.context?.agent_reasoning ?? '', path: 'budget' });
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

  const execute = useCallback(
    async (plan: AgentProposal, retryOf?: string) => {
      const token = ++cancelRef.current;
      setRunning(true);
      setError(null);
      setRecordId(null);
      setProposal(null);
      setActivity([]);
      pipeline.reset();

      for (const line of plan.activity) {
        await new Promise((r) => setTimeout(r, ACTIVITY_STEP_MS));
        if (token !== cancelRef.current) return;
        setActivity((a) => [...a, line]);
      }
      setProposal(plan);

      try {
        const pending = runEvaluation({ request: plan.request, origin: 'playground', retryOf, scenario: plan.path });
        pending.then((r) => token === cancelRef.current && setRecordId(r.id)).catch(() => undefined);
        const result = await pipeline.run(pending, dataSource);
        if (token !== cancelRef.current || !result) return;
        setRecordId(result.id);
        setRunIds((ids) => [result.id, ...ids.filter((x) => x !== result.id)].slice(0, 8));
      } catch (err) {
        if (token !== cancelRef.current) return;
        setError(err);
        notify({ tone: 'danger', title: 'Evaluation failed', description: errorMessage(err).detail });
      } finally {
        if (token === cancelRef.current) setRunning(false);
      }
    },
    [runEvaluation, pipeline, dataSource, notify],
  );

  const onRun = () => void execute(planFromGoal(goal));

  const onStop = () => {
    cancelRef.current++;
    setRunning(false);
    setActivity((a) => [...a, 'Run stopped by user.']);
    if (!recordId) pipeline.reset();
  };

  const onRetry = () => {
    if (!record) return;
    const alt = record.response.alternatives[0];
    if (!alt) return;
    void execute(planFromAlternative(alt, record.request, record.id), record.id);
  };

  const onRequestReview = async () => {
    if (!record) return;
    setReviewBusy(true);
    try {
      await requestReview(record.id, 'Requested from Agent Playground');
      notify({ tone: 'info', title: 'Human review requested', description: record.source === 'mock' ? 'Added to the local demo review queue. No real reviewer is notified.' : 'Accepted by the backend.' });
    } catch (err) {
      notify({ tone: 'danger', title: 'Review request failed', description: errorMessage(err).detail });
    } finally {
      setReviewBusy(false);
    }
  };

  const waiting = running || pipeline.phase === 'awaiting' || pipeline.phase === 'animating';

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="accent">Agent Playground</Badge>}
        title="Watch an agent ask for permission"
        description="PurchasePilot proposes a purchase. TrustLayer evaluates it before anything reaches the checkout tool."
        actions={dataSource === 'mock' ? <Badge tone="violet">Mock mode · deterministic proposals</Badge> : <Badge tone="accent">Evaluations sent to backend</Badge>}
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="AI agent" subtitle="Proposal" icon={<Bot className="h-3.5 w-3.5" />}>
          <AgentPanel goal={goal} onGoalChange={setGoal} onRun={onRun} onStop={onStop} running={running} activity={activity} proposal={proposal} />
        </Panel>

        <Panel
          title="TrustLayer evaluation"
          subtitle="Six-stage authorization pipeline"
          icon={<Workflow className="h-3.5 w-3.5 text-accent-soft" />}
          className="relative overflow-hidden border-accent/25 shadow-glow"
          actions={pipeline.phase !== 'idle' && <Badge tone={pipeline.phase === 'done' ? 'safe' : pipeline.phase === 'error' ? 'danger' : 'accent'}>{pipeline.phase === 'done' ? 'Complete' : pipeline.phase === 'error' ? 'Failed' : 'Running'}</Badge>}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/[0.07] to-transparent" aria-hidden />
          <div className="relative">
            <PipelineView states={pipeline.states} checks={record?.response.checks ?? []} revealed={pipeline.revealed} phase={pipeline.phase} source={dataSource} />
          </div>
        </Panel>

        <Panel title="Decision inspector" subtitle="Authorization & audit" icon={<ScanSearch className="h-3.5 w-3.5" />}>
          <InspectorPanel
            record={visibleRecord}
            waiting={waiting}
            onInspectEvidence={() => setEvidenceOpen(true)}
            onViewAudit={() => record && navigate(`/audit?id=${encodeURIComponent(record.id)}`)}
            onRequestReview={() => void onRequestReview()}
            onRetry={onRetry}
            reviewBusy={reviewBusy}
            retryDisabled={!record || record.response.alternatives.length === 0 || running}
          />
        </Panel>
      </div>

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
                      setRunning(false);
                      setRecordId(id);
                      setProposal({ activity: [], request: r.request, reasoning: r.request.context?.agent_reasoning ?? '', path: 'budget' });
                      setActivity([]);
                      pipeline.showInstant(r);
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
        {record && <EvidenceList evidence={record.request.evidence} flags={record.response.evidence_flags} />}
      </Modal>
    </>
  );
}
