import { useState } from 'react';
import { UserCheck, UserX, Send, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReviewBadge } from '@/components/ui/Badge';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/components/ui/ErrorBanner';
import { effectiveReviewStatus } from '@/lib/records';
import { formatTime } from '@/lib/format';
import type { EvaluationRecord } from '@/types';

/**
 * Human-oversight controls.
 * - Demo Mode: reviewer decisions are explicitly simulated (recorded as demo-operator).
 * - Live Backend Mode: decisions are sent to POST /api/v1/reviews/{id}/decision.
 */
export function ReviewControls({ record, hideRequest }: { record: EvaluationRecord; hideRequest?: boolean }) {
  const { requestReview, decideReview } = useAppStore();
  const { notify } = useToast();
  const [busy, setBusy] = useState<'review' | 'APPROVED' | 'REJECTED' | null>(null);
  const status = effectiveReviewStatus(record);
  const live = record.source === 'api';
  const explicitRequest = record.review.status !== 'NONE';

  const onRequest = async () => {
    setBusy('review');
    try {
      await requestReview(record.id, 'Escalated from TrustLayer console');
      notify({ tone: 'info', title: 'Review requested', description: 'Added to the local demo review queue. No real reviewer is notified.' });
    } catch (err) {
      notify({ tone: 'danger', title: 'Review request failed', description: errorMessage(err).detail });
    } finally {
      setBusy(null);
    }
  };

  const onDecide = async (outcome: 'APPROVED' | 'REJECTED') => {
    setBusy(outcome);
    try {
      await decideReview(record.id, outcome, live ? 'Decision recorded from TrustLayer console' : undefined);
      notify({
        tone: outcome === 'APPROVED' ? 'success' : 'warning',
        title: live ? `Reviewer decision sent: ${outcome.toLowerCase()}` : `Demo review: ${outcome.toLowerCase()}`,
        description: live ? 'Accepted by the backend. Execution is still decided by the backend gateway.' : 'Simulated reviewer decision — not a real approval.',
      });
    } catch (err) {
      notify({ tone: 'danger', title: 'Reviewer decision not recorded', description: errorMessage(err).detail });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Review state</span>
        <ReviewBadge status={status} source={record.source} />
        {live && record.response.review_status && <span className="font-mono text-2xs text-faint">backend review_status: {record.response.review_status}</span>}
        {record.review.requested_at && <span className="font-mono text-2xs text-faint">requested {formatTime(record.review.requested_at)}</span>}
        {record.review.resolved_by && <span className="font-mono text-2xs text-faint">by {record.review.resolved_by}</span>}
      </div>

      {status === 'PENDING' && (
        <div className={live ? 'rounded-lg border border-accent/30 bg-accent/[0.05] p-3' : 'rounded-lg border border-warn/30 bg-warn/[0.05] p-3'}>
          <p className="flex items-start gap-2 text-xs text-muted">
            <Info className={live ? 'mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-soft' : 'mt-0.5 h-3.5 w-3.5 shrink-0 text-warn'} aria-hidden />
            {live ? (
              <span>Reviewer console. Your decision is sent to the backend review endpoint; the backend decides whether execution is then authorized.</span>
            ) : (
              <span>
                Demo reviewer controls. These simulate a reviewer’s decision for the demo and are recorded as <span className="font-mono text-ink">demo-operator</span>, not as a real approval.
              </span>
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<UserCheck className="h-3.5 w-3.5 text-safe" />} loading={busy === 'APPROVED'} disabled={busy !== null} onClick={() => void onDecide('APPROVED')}>
              {live ? 'Approve (send to backend)' : 'Simulate approval'}
            </Button>
            <Button size="sm" variant="outline" icon={<UserX className="h-3.5 w-3.5 text-danger" />} loading={busy === 'REJECTED'} disabled={busy !== null} onClick={() => void onDecide('REJECTED')}>
              {live ? 'Reject (send to backend)' : 'Simulate rejection'}
            </Button>
          </div>
        </div>
      )}

      {!explicitRequest && !hideRequest && !live && status === 'NONE' && (
        <Button size="sm" variant="secondary" icon={<Send className="h-3.5 w-3.5" />} loading={busy === 'review'} onClick={onRequest}>
          Request human review
        </Button>
      )}
      {live && status === 'NONE' && <p className="text-2xs text-faint">The backend creates reviews for REVIEW_REQUIRED decisions; there is no endpoint to escalate other decisions.</p>}
    </div>
  );
}
