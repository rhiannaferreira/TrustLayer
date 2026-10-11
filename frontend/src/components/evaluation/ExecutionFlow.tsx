import { Bot, ShieldCheck, ShieldX, ShieldAlert, Play, Ban, CircleDashed, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { authorizeExecution } from '@/services/toolGateway';
import { describeAction } from '@/lib/records';
import type { EvaluationRecord } from '@/types';

/** Makes the difference between proposal, authorization and execution explicit. */
export function ExecutionFlow({ record, compact }: { record: EvaluationRecord; compact?: boolean }) {
  const { response, execution } = record;
  const verdict = authorizeExecution(record);

  const authTone = response.decision === 'ALLOW' ? 'safe' : response.decision === 'BLOCK' ? 'danger' : 'warn';
  const AuthIcon = response.decision === 'ALLOW' ? ShieldCheck : response.decision === 'BLOCK' ? ShieldX : ShieldAlert;

  const exec = execution?.status;
  const execTone = exec === 'EXECUTED' ? 'safe' : exec === 'REFUSED' ? 'danger' : exec === 'ERROR' ? 'warn' : 'neutral';
  const ExecIcon = exec === 'EXECUTED' ? Play : exec === 'REFUSED' ? Ban : exec === 'ERROR' ? AlertTriangle : CircleDashed;

  const steps = [
    { title: 'Proposal', icon: Bot, tone: 'accent', body: describeAction(record.request), sub: record.agent_name },
    {
      title: 'Authorization',
      icon: AuthIcon,
      tone: authTone,
      body: response.decision === 'ALLOW' ? 'Granted' : response.decision === 'BLOCK' ? 'Denied' : record.review.status === 'APPROVED' ? 'Granted after review' : 'Held for review',
      sub: record.source === 'api' ? `execution_allowed: ${response.execution_allowed}` : verdict.allowed ? 'Gateway will accept' : 'Gateway will refuse',
    },
    {
      title: 'Execution',
      icon: ExecIcon,
      tone: execTone,
      body: exec === 'EXECUTED' ? 'Executed (simulated)' : exec === 'REFUSED' ? 'Refused by gateway' : exec === 'ERROR' ? 'Error' : 'Not attempted',
      sub: execution?.reference ?? (execution?.http_status ? `HTTP ${execution.http_status}` : execution?.gateway) ?? (record.source === 'api' ? 'backend gateway' : 'simulated-tool-gateway'),
    },
  ] as const;

  const toneCls: Record<string, string> = {
    accent: 'border-accent/30 text-accent-soft',
    safe: 'border-safe/30 text-safe',
    danger: 'border-danger/30 text-danger',
    warn: 'border-warn/30 text-warn',
    neutral: 'border-line text-faint',
  };

  if (compact) {
    return (
      <ol className="divide-y divide-line rounded-lg border border-line bg-raised/50">
        {steps.map((s) => (
          <li key={s.title} className="flex items-center gap-2.5 px-2.5 py-2">
            <s.icon className={cn('h-3.5 w-3.5 shrink-0', toneCls[s.tone].split(' ')[1])} aria-hidden />
            <span className="label w-[92px] shrink-0">{s.title}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={s.body}>
              {s.body}
            </span>
            <span className="hidden max-w-[40%] truncate font-mono text-2xs text-faint sm:inline" title={s.sub}>
              {s.sub}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-1.5 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      {steps.map((s, i) => (
        <div key={s.title} className="contents">
          <div className={cn('min-w-0 rounded-lg border bg-raised/70 px-2.5 py-2', toneCls[s.tone])}>
            <div className="flex items-center gap-1.5">
              <s.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="label !text-current">{s.title}</span>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-ink" title={s.body}>
              {s.body}
            </p>
            <p className="truncate font-mono text-2xs text-faint" title={s.sub}>
              {s.sub}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className="hidden place-items-center text-faint sm:grid" aria-hidden>
              <ChevronRight className="h-4 w-4" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
