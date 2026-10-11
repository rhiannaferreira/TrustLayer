import { Check, X, Loader2, CircleDashed, Minus, AlertTriangle, Pause } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { classifyAiStatus } from '@/services/liveContract';
import { effectiveReviewStatus } from '@/lib/records';
import { DECISION_LABEL, formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AgentRunSummary, DataSource, EvaluationRecord } from '@/types';

export type RunPhase = 'idle' | 'proposing' | 'evaluating' | 'done' | 'no_match' | 'error';
export type ProposalSource = 'backend-agent' | 'backend-seeded' | 'demo-planner';
export type StepState = 'pending' | 'active' | 'done' | 'failed' | 'warn' | 'skipped' | 'waiting';
/** Who vouches for a step: the backend, the in-browser demo engine, or the browser itself. */
export type StepSource = 'backend' | 'demo' | 'local' | null;

export interface TimelineStep {
  id: string;
  title: string;
  state: StepState;
  source: StepSource;
  detail?: string;
  at?: string;
}

interface Input {
  phase: RunPhase;
  source: DataSource;
  proposalSource: ProposalSource | null;
  proposalScenario?: string;
  /** Live AI agent mode: one backend call discovers, ranks, proposes and evaluates. */
  agentMode?: boolean;
  agentRun?: AgentRunSummary | null;
  noMatchMessage?: string | null;
  startedAt: string | null;
  record: EvaluationRecord | null;
  useAi: boolean;
  errorAt: 'proposal' | 'evaluation' | null;
  errorMessage?: string;
  executing: boolean;
}

/** Builds the eight-step activity timeline. Only completed backend responses mark steps as backend-confirmed. */
export function buildAgentTimeline(i: Input): TimelineStep[] {
  const live = i.source === 'api';
  const evalSource: StepSource = live ? 'backend' : 'demo';
  const r = i.record;
  const steps: TimelineStep[] = [];

  steps.push({ id: 'task', title: 'Task received', state: i.startedAt ? 'done' : 'pending', source: i.startedAt ? 'local' : null, at: i.startedAt ?? undefined });

  if (i.agentMode) {
    const d = i.agentRun?.discovery;
    let discovery: TimelineStep = { id: 'discovery', title: 'Products discovered', state: 'pending', source: null };
    if (i.phase === 'proposing') discovery = { ...discovery, state: 'active', detail: 'POST /api/v1/agent/run: searching products for the requested category and budget…' };
    else if (i.errorAt === 'proposal') discovery = { ...discovery, state: 'failed', source: 'backend', detail: i.errorMessage };
    else if (d)
      discovery = {
        ...discovery,
        state: d.matched_count ? 'done' : 'warn',
        source: 'backend',
        detail: `${d.matched_count} of ${d.returned_count} listings matched ${d.query.categories.join(' or ') || 'the request'} · ${d.catalog_mode === 'live' ? `live provider ${d.provider}` : d.catalog_mode === 'demo_fallback' ? 'demo fallback (provider unavailable)' : 'fictional demo catalog'}`,
      };
    steps.push(discovery);
  }

  let proposal: TimelineStep = { id: 'proposal', title: 'Proposal produced', state: 'pending', source: null };
  if (i.phase === 'no_match') proposal = { ...proposal, state: 'skipped', source: i.agentMode ? 'backend' : 'demo', detail: i.noMatchMessage ?? 'No matching products; nothing proposed.' };
  else if (i.phase === 'proposing')
    proposal = {
      ...proposal,
      state: i.agentMode ? 'pending' : 'active',
      detail: i.agentMode ? undefined : live ? 'Requesting a proposal from POST /api/v1/agent/propose (seeded demo scenarios)…' : 'Deterministic demo planner is choosing an action…',
    };
  else if (i.errorAt === 'proposal') proposal = { ...proposal, state: 'failed', source: live ? 'backend' : 'demo', detail: i.agentMode ? undefined : i.errorMessage };
  else if (i.proposalSource)
    proposal = {
      ...proposal,
      state: 'done',
      source: i.proposalSource === 'demo-planner' ? 'demo' : 'backend',
      detail:
        i.proposalSource === 'backend-agent'
          ? `${i.agentRun?.recommendation ? `${i.agentRun.recommendation.product.title} · ` : ''}ranked by ${i.agentRun?.ranking?.ranking_source === 'luminal' ? 'Luminal (AI)' : 'deterministic rules (no AI)'} from real search results only.`
          : i.proposalSource === 'backend-seeded'
            ? `Seeded agent proposal from the backend${i.proposalScenario ? ` (scenario: ${i.proposalScenario})` : ''} — not free-form LLM planning.`
            : 'Rule-based demo planner (not an LLM).',
    };
  steps.push(proposal);

  const requested = i.phase === 'evaluating' || i.phase === 'done' || i.errorAt === 'evaluation';
  steps.push({
    id: 'requested',
    title: 'TrustLayer evaluation requested',
    state: requested ? 'done' : 'pending',
    source: requested ? (i.agentMode ? 'backend' : 'local') : null,
    detail: requested
      ? i.agentMode
        ? `Submitted server-side by /api/v1/agent/run to the same evaluator · use_ai: ${i.useAi}`
        : live
          ? `POST /api/v1/evaluations · use_ai: ${i.useAi}`
          : 'Sent to the in-browser demo engine (no HTTP).'
      : undefined,
  });

  const evaluating = i.phase === 'evaluating';
  const failedEval = i.errorAt === 'evaluation';
  if (r) {
    const fails = r.response.checks.filter((c) => c.status === 'FAIL').length;
    const warns = r.response.checks.filter((c) => c.status === 'WARN').length;
    steps.push({
      id: 'policies',
      title: 'Policies checked',
      state: fails ? 'failed' : warns ? 'warn' : 'done',
      source: evalSource,
      detail: `${r.response.checks.length} deterministic checks · ${fails} failed · ${warns} warnings`,
      at: r.response.created_at,
    });
    const ai = classifyAiStatus(r.response.ai_status, r.response.ai_analysis, r.response.ai_error);
    let aiStep: TimelineStep = { id: 'ai', title: 'Evidence analyzed (AI)', state: 'skipped', source: evalSource };
    if (!live) aiStep = { ...aiStep, detail: 'Demo Mode: deterministic evidence patterns only; no AI model called.' };
    else if (ai === 'completed') aiStep = { ...aiStep, state: 'done', detail: `Luminal analysis completed (ai_status: ${r.response.ai_status}).` };
    else if (ai === 'failed') aiStep = { ...aiStep, state: 'failed', detail: `AI request failed${r.response.ai_error ? `: ${r.response.ai_error}` : ''}. Decision used deterministic checks.` };
    else if (ai === 'unavailable') aiStep = { ...aiStep, detail: `AI unavailable on the backend (ai_status: ${r.response.ai_status}).` };
    else if (ai === 'not_requested') aiStep = { ...aiStep, detail: `AI not used (ai_status: ${r.response.ai_status}).` };
    else if (ai === 'unknown') aiStep = { ...aiStep, state: 'warn', detail: `Unrecognised ai_status ${JSON.stringify(r.response.ai_status)} — not treated as completed.` };
    else aiStep = { ...aiStep, detail: i.useAi ? 'AI was requested, but the response carries no AI status.' : 'AI analysis was not requested.' };
    steps.push(aiStep);
    steps.push({
      id: 'decision',
      title: 'Decision returned',
      state: r.response.decision === 'ALLOW' ? 'done' : r.response.decision === 'BLOCK' ? 'failed' : 'warn',
      source: evalSource,
      detail: `${DECISION_LABEL[r.response.decision]} · risk ${r.response.risk_level} · execution_allowed: ${r.response.execution_allowed}`,
      at: r.response.created_at,
    });
    const review = effectiveReviewStatus(r);
    const attempts = r.execution_attempts ?? (r.execution ? [r.execution] : []);
    const last = attempts[attempts.length - 1];
    steps.push({
      id: 'exec-requested',
      title: 'Execution requested',
      state: i.executing ? 'active' : attempts.length ? 'done' : review === 'PENDING' ? 'waiting' : 'pending',
      source: attempts.length || i.executing ? 'local' : null,
      detail: i.executing
        ? 'Authorizing the simulated action at the gateway…'
        : attempts.length
          ? `${attempts.length} request${attempts.length === 1 ? '' : 's'} sent to the ${live ? 'backend' : 'simulated'} gateway.`
          : review === 'PENDING'
            ? 'Awaiting human review before execution can be authorized.'
            : 'Only when you choose to proceed.',
    });
    steps.push({
      id: 'exec-result',
      title: 'Final execution result recorded',
      state: !last ? 'pending' : r.execution?.status === 'EXECUTED' ? 'done' : last.status === 'ERROR' ? 'warn' : 'failed',
      source: last ? (live ? 'backend' : 'demo') : null,
      detail: last ? `${last.duplicate ? 'Duplicate refused' : last.status}${last.http_status ? ` · HTTP ${last.http_status}` : ''}${last.reference ? ` · ${last.reference}` : ''}` : undefined,
      at: last?.at,
    });
  } else {
    const noMatch = i.phase === 'no_match';
    steps.push({
      id: 'policies',
      title: 'Policies checked',
      state: noMatch ? 'skipped' : evaluating ? 'active' : failedEval ? 'failed' : 'pending',
      source: null,
      detail: noMatch ? 'Nothing to evaluate.' : evaluating ? (live ? 'Backend is evaluating. Results appear only when it responds.' : 'Running deterministic demo checks…') : failedEval ? i.errorMessage : undefined,
    });
    steps.push({
      id: 'ai',
      title: 'Evidence analyzed (AI)',
      state: evaluating && live && i.useAi ? 'active' : 'pending',
      source: null,
      detail: evaluating && live && i.useAi ? 'AI analysis requested from Luminal via the backend — outcome unknown until the response arrives.' : undefined,
    });
    steps.push({ id: 'decision', title: 'Decision returned', state: 'pending', source: null });
    steps.push({ id: 'exec-requested', title: 'Execution requested', state: 'pending', source: null });
    steps.push({ id: 'exec-result', title: 'Final execution result recorded', state: 'pending', source: null });
  }
  return steps;
}

const ICON: Record<StepState, typeof Check> = { pending: CircleDashed, active: Loader2, done: Check, failed: X, warn: AlertTriangle, skipped: Minus, waiting: Pause };
const DOT: Record<StepState, string> = {
  pending: 'border-line-strong text-faint',
  active: 'border-accent bg-accent/15 text-accent-soft',
  done: 'border-safe/60 bg-safe/15 text-safe',
  failed: 'border-danger/60 bg-danger/15 text-danger',
  warn: 'border-warn/60 bg-warn/15 text-warn',
  skipped: 'border-line text-faint',
  waiting: 'border-warn/60 bg-warn/10 text-warn',
};
const SOURCE: Record<Exclude<StepSource, null>, { label: string; tone: Tone }> = {
  backend: { label: 'Backend-confirmed', tone: 'accent' },
  demo: { label: 'Demo · simulated', tone: 'violet' },
  local: { label: 'Browser', tone: 'neutral' },
};

export function AgentTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-0" aria-label="Agent activity timeline">
      {steps.map((s, i) => {
        const Icon = ICON[s.state];
        return (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className={cn('absolute left-[13px] top-7 h-[calc(100%-20px)] w-px', s.state === 'pending' ? 'bg-line' : 'bg-line-strong')} aria-hidden />}
            <span className={cn('relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors duration-300', DOT[s.state], s.state === 'active' && 'animate-pulse-ring')}>
              <Icon className={cn('h-3.5 w-3.5', s.state === 'active' && 'animate-spin')} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-2xs text-faint">{i + 1}</span>
                <span className={cn('text-sm font-medium', s.state === 'pending' ? 'text-faint' : 'text-ink')}>{s.title}</span>
                {s.source && <Badge tone={SOURCE[s.source].tone}>{SOURCE[s.source].label}</Badge>}
                {s.at && <span className="ml-auto font-mono text-2xs text-faint">{formatTime(s.at)}</span>}
              </div>
              {s.detail && <p className="mt-0.5 break-words text-xs text-muted">{s.detail}</p>}
              <span className="sr-only">Status: {s.state}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
