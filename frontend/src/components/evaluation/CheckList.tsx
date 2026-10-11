import { StatusIcon } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { EvaluationCheck } from '@/types';

export function CheckList({ checks, dense }: { checks: EvaluationCheck[]; dense?: boolean }) {
  if (!checks.length) return <p className="text-xs text-faint">No checks were returned.</p>;
  return (
    <ul className={cn('divide-y divide-line rounded-lg border border-line', dense ? 'text-xs' : 'text-sm')}>
      {checks.map((c, i) => (
        <li key={`${c.name}-${i}`} className={cn('flex items-start gap-2.5', dense ? 'px-2.5 py-2' : 'px-3 py-2.5')}>
          <StatusIcon status={c.status} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-medium text-ink">{c.name}</span>
              <span className={cn('font-mono text-2xs', c.status === 'PASS' ? 'text-safe' : c.status === 'WARN' ? 'text-warn' : 'text-danger')}>{c.status}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{c.reason}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
