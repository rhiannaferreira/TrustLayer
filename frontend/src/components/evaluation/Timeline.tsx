import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';
import type { TimelineEvent, TimelineKind } from '@/types';

const DOT: Partial<Record<TimelineKind, string>> = {
  EVALUATED: 'bg-accent',
  AUTHORIZATION: 'bg-violet',
  EXECUTED: 'bg-safe',
  EXECUTION_REFUSED: 'bg-danger',
  EXECUTION_ERROR: 'bg-warn',
  REVIEW_REQUESTED: 'bg-warn',
  REVIEW_APPROVED: 'bg-safe',
  REVIEW_REJECTED: 'bg-danger',
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute bottom-1 left-[5px] top-1 w-px bg-line" aria-hidden />
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2 border-surface', DOT[e.kind] ?? 'bg-faint')} aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-ink">{e.label}</span>
            <time className="font-mono text-2xs text-faint" dateTime={e.at}>
              {formatTime(e.at)}
            </time>
          </div>
          {e.detail && <p className="mt-0.5 text-xs text-muted">{e.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
