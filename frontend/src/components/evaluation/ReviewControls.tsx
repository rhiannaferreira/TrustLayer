import { useState } from 'react';
import { UserCheck, UserX, Send, PlayCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReviewBadge } from '@/components/ui/Badge';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/components/ui/ErrorBanner';
import { effectiveReviewStatus } from '@/lib/records';
import { formatTime } from '@/lib/format';
import type { EvaluationRecord } from '@/types';

/** Human-oversight controls. In mock mode reviewer decisions are explicitly simulated. */
export function ReviewControls({ record, hideRequest }: { record: EvaluationRecord; hideRequest?: boolean }) {
  const { requestReview, resolveDemoReview, executeRecord } = useAppStore();
  const { notify } = useToast();
  const [busy, setBusy] = useState<'review' | 'execute' | null>(null);
  const status = effectiveReviewStatus(record);
  const explicitRequest = record.review.status !== 'NONE';

  const onRequest = async () => {
    setBusy('review');
    try {
      await requestReview(record.id, 'Escalated from TrustLayer console');
      notify({ tone: 'info', title: 'Review requested', description: record.source === 'mock' ? 'Added to the local demo review queue. No real reviewer is notified.' : 'Review request accepted by the backend.' });
    } catch (err) {
      notify({ tone: 'danger', title: 'Review request failed', description: errorMessage(err).detail });
    } finally {
      setBusy(null);
    }
  };

  const onExecute = async () => {
    setBusy('execute');
    try {
      const result = await executeRecord(record.id);
      notify({
        tone: result.status === 'EXECUTED' ? 'success' : result.status === 'REFUSED' ? 'danger' : 'warning',
        title: result.status === 'EXECUTED' ? 'Simulated execution completed' : result.status === 'REFUSED' ? 'Gateway refused execution' : 'Execution error',
        description: result.message,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Review state</span>
        <ReviewBadge status={status} source={record.source} />
        {record.review.requested_at && <span className="font-mono text-2xs text-faint">requested {formatTime(record.review.requested_at)}</span>}
        {record.review.resolved_by && <span className="font-mono text-2xs text-faint">by {record.review.resolved_by}</span>}
      </div>

      {status === 'PENDING' && record.source === 'mock' && (
        <div className="rounded-lg border border-warn/30 bg-warn/[0.05] p-3">
          <p className="flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
            Demo reviewer controls. These simulate a reviewer’s decision for the demo and are recorded as <span className="font-mono text-ink">demo-operator</span>, not as a real approval.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<UserCheck className="h-3.5 w-3.5 text-safe" />} onClick={() => resolveDemoReview(record.id, 'APPROVED')}>
              Simulate approval
            </Button>
            <Button size="sm" variant="outline" icon={<UserX className="h-3.5 w-3.5 text-danger" />} onClick={() => resolveDemoReview(record.id, 'REJECTED')}>
              Simulate rejection
            </Button>
          </div>
        </div>
      )}
      {status === 'PENDING' && record.source === 'api' && <p className="text-xs text-muted">Awaiting reviewer decision in the backend. Refresh Live Decisions to pick up changes.</p>}

      <div className="flex flex-wrap gap-2">
        {!explicitRequest && !hideRequest && (
          <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} loading={busy === 'review'} onClick={onRequest}>
            Request human review
          </Button>
        )}
        {record.execution?.status !== 'EXECUTED' && (
          <Button size="sm" variant="secondary" icon={<PlayCircle className="h-3.5 w-3.5" />} loading={busy === 'execute'} onClick={onExecute}>
            Submit to tool gateway
          </Button>
        )}
      </div>
    </div>
  );
}
