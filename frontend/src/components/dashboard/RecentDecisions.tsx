import { ChevronRight, Inbox } from 'lucide-react';
import { DecisionBadge, RiskBadge, SourceBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeAction } from '@/lib/records';
import { formatRelative, formatDateTime } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import type { EvaluationRecord } from '@/types';

export function RecentDecisions({ records, onSelect }: { records: EvaluationRecord[]; onSelect: (id: string) => void }) {
  const now = useNow();
  if (!records.length) return <EmptyState icon={<Inbox className="h-4 w-4" />} title="No evaluations yet" description="Run the Agent Playground or Attack Lab to evaluate an action." />;
  return (
    <ul className="-mx-2 divide-y divide-line">
      {records.map((r) => (
        <li key={r.id}>
          <button onClick={() => onSelect(r.id)} className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-overlay/50">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-ink">{describeAction(r.request)}</span>
                {r.seeded && <SourceBadge source={r.source} seeded />}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                <span className="font-mono">{r.id}</span>
                <span>·</span>
                <span>{r.agent_name}</span>
                <span>·</span>
                <time dateTime={r.response.created_at} title={formatDateTime(r.response.created_at)}>
                  {formatRelative(r.response.created_at, now)}
                </time>
              </p>
            </div>
            <div className="hidden sm:block">
              <RiskBadge risk={r.response.risk_level} />
            </div>
            <DecisionBadge decision={r.response.decision} />
            <ChevronRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
