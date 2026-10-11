import { Bot, Headset, Database } from 'lucide-react';
import { AGENTS } from '@/data/agents';
import { Badge, DecisionBadge } from '@/components/ui/Badge';
import { formatRelative } from '@/lib/format';
import type { EvaluationRecord } from '@/types';

const ICONS = { 'purchase-pilot': Bot, 'support-sentinel': Headset, 'ledger-ops': Database } as Record<string, typeof Bot>;

export function AgentCards({ records }: { records: EvaluationRecord[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {AGENTS.map((agent) => {
        const mine = records.filter((r) => r.request.agent_id === agent.id);
        const last = mine[0];
        const blocked = mine.filter((r) => r.response.decision === 'BLOCK').length;
        const Icon = ICONS[agent.id] ?? Bot;
        return (
          <div key={agent.id} className="rounded-lg border border-line bg-raised/50 p-3.5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-accent-soft">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-ink">{agent.name}</p>
                  <Badge tone={mine.length ? 'accent' : 'neutral'}>{mine.length ? 'Active this session' : 'Configured'}</Badge>
                </div>
                <p className="truncate text-xs text-faint">{agent.role}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Evaluated" value={mine.length} />
              <Stat label="Blocked" value={blocked} />
              <Stat label="Tools" value={agent.permissions.length} />
            </dl>
            <div className="mt-3 flex min-h-[22px] items-center justify-between gap-2 text-xs text-faint">
              {last ? (
                <>
                  <span>Last decision {formatRelative(last.response.created_at)}</span>
                  <DecisionBadge decision={last.response.decision} />
                </>
              ) : (
                <span>No evaluations in this session</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface/80 py-1.5">
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
      <dt className="text-2xs text-faint">{label}</dt>
    </div>
  );
}
