import { ScanSearch, FileClock, UserRoundSearch, RefreshCw, Lock, Unlock, ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RiskBadge, ReviewBadge } from '@/components/ui/Badge';
import { CheckList } from '@/components/evaluation/CheckList';
import { ExecutionFlow } from '@/components/evaluation/ExecutionFlow';
import { AlternativesList } from '@/components/evaluation/AlternativesList';
import { ReviewControls } from '@/components/evaluation/ReviewControls';
import { ExecutionPanel } from '@/components/evaluation/ExecutionPanel';
import { DECISION_LABEL } from '@/lib/format';
import { effectiveReviewStatus } from '@/lib/records';
import { cn } from '@/lib/cn';
import type { EvaluationRecord } from '@/types';

interface InspectorPanelProps {
  record: EvaluationRecord | null;
  waiting: boolean;
  onInspectEvidence: () => void;
  onViewAudit: () => void;
  onRequestReview: () => void;
  onRetry: () => void;
  reviewBusy: boolean;
  retryDisabled: boolean;
  onExecutingChange?: (busy: boolean) => void;
}

const BANNER = {
  ALLOW: { cls: 'border-safe/35 bg-safe/[0.07] text-safe', icon: ShieldCheck, label: 'APPROVE' },
  BLOCK: { cls: 'border-danger/35 bg-danger/[0.07] text-danger', icon: ShieldX, label: 'BLOCK' },
  REVIEW_REQUIRED: { cls: 'border-warn/35 bg-warn/[0.07] text-warn', icon: ShieldAlert, label: 'REVIEW REQUIRED' },
} as const;

export function InspectorPanel({ record, waiting, onInspectEvidence, onViewAudit, onRequestReview, onRetry, reviewBusy, retryDisabled, onExecutingChange }: InspectorPanelProps) {
  if (!record) {
    return (
      <div className="space-y-3" aria-busy={waiting}>
        <div className={cn('rounded-xl border border-dashed border-line p-5 text-center', waiting && 'border-accent/30')}>
          <p className="text-sm font-medium text-ink">{waiting ? 'Evaluation in progress…' : 'No decision yet'}</p>
          <p className="mt-1 text-xs text-muted">{waiting ? 'The decision appears when every stage has completed.' : 'Run the agent to see TrustLayer’s decision, checks and audit record.'}</p>
        </div>
        {waiting && (
          <div className="space-y-2">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        )}
      </div>
    );
  }

  const { response } = record;
  const banner = BANNER[response.decision];
  const flagged = response.evidence_flags.length;
  const policyChecks = response.checks.filter((c) => c.stage !== 'decision');
  const reviewStatus = effectiveReviewStatus(record);

  return (
    <div className="animate-fade-in space-y-4">
      <div className={cn('rounded-xl border p-4', banner.cls)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <banner.icon className="h-5 w-5" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">{banner.label}</span>
          </div>
          <RiskBadge risk={response.risk_level} />
        </div>
        <p className="mt-2 text-sm text-ink">{response.reason}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 text-muted">
            {response.execution_allowed ? <Unlock className="h-3.5 w-3.5 text-safe" aria-hidden /> : <Lock className="h-3.5 w-3.5 text-danger" aria-hidden />}
            Execution {response.execution_allowed ? 'permitted' : 'not permitted'}
          </span>
          <span className="font-mono text-faint">audit: {record.id}</span>
        </div>
        <p className="sr-only">Decision: {DECISION_LABEL[response.decision]}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" icon={<ScanSearch className="h-3.5 w-3.5" />} onClick={onInspectEvidence}>
          Inspect evidence
        </Button>
        <Button size="sm" variant="secondary" icon={<FileClock className="h-3.5 w-3.5" />} onClick={onViewAudit}>
          View audit record
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<UserRoundSearch className="h-3.5 w-3.5" />}
          onClick={onRequestReview}
          loading={reviewBusy}
          disabled={record.review.status !== 'NONE' || record.source === 'api'}
          title={record.source === 'api' ? 'The backend has no endpoint to escalate this decision to review' : undefined}
        >
          {record.review.status !== 'NONE' ? 'Review requested' : 'Request human review'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={onRetry}
          disabled={retryDisabled}
          title={retryDisabled ? 'No alternative was suggested for this decision' : 'Generate a new proposal from the top alternative and evaluate it'}
        >
          Retry with alternative
        </Button>
      </div>

      <section>
        <p className="label mb-1.5">Proposal → authorization → execution</p>
        <ExecutionFlow record={record} compact />
      </section>

      <section>
        <p className="label mb-1.5">Execution gateway</p>
        <ExecutionPanel record={record} onBusyChange={onExecutingChange} />
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="label">Policy checks</p>
          <span className="text-2xs text-faint">{policyChecks.length} checks</span>
        </div>
        <CheckList checks={policyChecks} dense />
      </section>

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="label">Evidence flags</p>
          {flagged > 0 && <span className="text-2xs text-warn">{flagged} flagged</span>}
        </div>
        {flagged ? (
          <ul className="space-y-1">
            {response.evidence_flags.map((f, i) => (
              <li key={i} className="rounded-md border border-warn/25 bg-warn/[0.05] px-2.5 py-1.5 text-xs text-muted">
                <span className="font-medium text-warn">{f.description}</span>
                {f.matched_text && <span className="mt-0.5 block font-mono text-2xs text-faint">“{f.matched_text}”</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint">No evidence flags.</p>
        )}
      </section>

      {response.alternatives.length > 0 && (
        <section>
          <p className="label mb-1.5">Suggested alternatives</p>
          <AlternativesList alternatives={response.alternatives} />
        </section>
      )}

      {reviewStatus !== 'NONE' && (
        <section className="border-t border-line pt-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="label">Human oversight</p>
            <ReviewBadge status={reviewStatus} source={record.source} />
          </div>
          <ReviewControls record={record} hideRequest />
        </section>
      )}
    </div>
  );
}
