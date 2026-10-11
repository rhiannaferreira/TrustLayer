import { useState } from 'react';
import { PlayCircle, ShieldAlert, Copy as CopyIcon, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/components/ui/ErrorBanner';
import { authorizeExecution } from '@/services/toolGateway';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { EvaluationRecord, ExecutionResult } from '@/types';

/** Whether the UI should offer the normal "Execute" button. Never a security decision. */
export function canRequestExecution(record: EvaluationRecord): boolean {
  if (record.execution?.status === 'EXECUTED') return false;
  if (record.source === 'mock') return authorizeExecution(record).allowed;
  return record.response.execution_allowed === true || (record.response.decision === 'REVIEW_REQUIRED' && record.review.status === 'APPROVED');
}

export function attemptLabel(a: ExecutionResult): string {
  if (a.duplicate) return 'Duplicate refused';
  if (a.status === 'EXECUTED') return 'Executed (simulated)';
  if (a.status === 'REFUSED') return 'Refused';
  return 'Error';
}

export function ExecutionPanel({ record, onResult, onBusyChange }: { record: EvaluationRecord; onResult?: (r: ExecutionResult) => void; onBusyChange?: (busy: boolean) => void }) {
  const { executeRecord } = useAppStore();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const live = record.source === 'api';
  const authorized = canRequestExecution(record);
  const executed = record.execution?.status === 'EXECUTED';
  const attempts = record.execution_attempts ?? (record.execution ? [record.execution] : []);

  const run = async () => {
    setBusy(true);
    onBusyChange?.(true);
    try {
      const result = await executeRecord(record.id);
      onResult?.(result);
      notify({
        tone: result.status === 'EXECUTED' ? 'success' : result.status === 'REFUSED' ? 'danger' : 'warning',
        title: result.duplicate ? 'Duplicate execution refused' : result.status === 'EXECUTED' ? 'Simulated execution completed' : result.status === 'REFUSED' ? 'Gateway refused execution' : 'Execution error',
        description: result.message,
      });
    } catch (err) {
      notify({ tone: 'danger', title: 'Execution request failed', description: errorMessage(err).detail });
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {record.response.execution_allowed ? (
          <Badge tone="safe" icon={<Unlock className="h-3 w-3" aria-hidden />}>
            execution_allowed: true
          </Badge>
        ) : (
          <Badge tone="danger" icon={<Lock className="h-3 w-3" aria-hidden />}>
            execution_allowed: false
          </Badge>
        )}
        <span className="text-faint">{live ? 'The backend gateway re-checks authorization on every request.' : 'Simulated gateway re-checks authorization in the browser (demo only).'}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {!executed && (
          <Button size="sm" variant={authorized ? 'primary' : 'secondary'} icon={<PlayCircle className="h-3.5 w-3.5" />} loading={busy && authorized} disabled={!authorized || busy} onClick={run} title={authorized ? 'Submit the evaluated action to the execution gateway' : 'Not authorized by TrustLayer'}>
            Execute through gateway
          </Button>
        )}
        {!executed && !authorized && (
          <Button size="sm" variant="danger" icon={<ShieldAlert className="h-3.5 w-3.5" />} loading={busy} onClick={run} title="Sends the request anyway so you can see the gateway refuse it">
            {live ? 'Attempt anyway (test server enforcement)' : 'Attempt anyway (test simulated gateway)'}
          </Button>
        )}
        {executed && (
          <Button size="sm" variant="outline" icon={<CopyIcon className="h-3.5 w-3.5" />} loading={busy} onClick={run} title="Re-submit the same authorization to show duplicate-execution prevention">
            Re-submit same authorization (duplicate test)
          </Button>
        )}
      </div>

      {attempts.length > 0 ? (
        <ol className="space-y-1.5" aria-label="Execution attempts">
          {attempts.map((a, i) => (
            <li
              key={i}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                a.status === 'EXECUTED' ? 'border-safe/30 bg-safe/[0.05]' : a.duplicate ? 'border-warn/35 bg-warn/[0.06]' : a.status === 'REFUSED' ? 'border-danger/30 bg-danger/[0.05]' : 'border-warn/30 bg-warn/[0.05]',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-2xs text-faint">#{i + 1}</span>
                <span className={cn('font-medium', a.status === 'EXECUTED' ? 'text-safe' : a.duplicate ? 'text-warn' : a.status === 'REFUSED' ? 'text-danger' : 'text-warn')}>{attemptLabel(a)}</span>
                {a.http_status !== undefined && <Badge>HTTP {a.http_status}</Badge>}
                {a.reference && <span className="font-mono text-2xs text-ink">{a.reference}</span>}
                <span className="ml-auto font-mono text-2xs text-faint">
                  {a.gateway} · {formatTime(a.at)}
                </span>
              </div>
              <p className="mt-1 break-words text-muted">{a.message}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-faint">No execution has been requested for this evaluation.</p>
      )}
    </div>
  );
}
