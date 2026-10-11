import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { TrustDecision, TrustStage } from '@/services/api';

export const VERDICT = {
  ALLOW: { tone: 'safe', label: 'ALLOW', icon: ShieldCheck },
  REVIEW: { tone: 'warn', label: 'REVIEW', icon: ShieldAlert },
  BLOCK: { tone: 'danger', label: 'BLOCK', icon: ShieldX },
} as const;
export const STATUS_TONE = { PASS: 'safe', WARN: 'warn', FAIL: 'danger' } as const;

export function VerdictBadge({ decision, large }: { decision: TrustDecision['decision']; large?: boolean }) {
  const v = VERDICT[decision];
  return (
    <Badge tone={v.tone} className={large ? 'px-3 py-1.5 text-sm' : undefined} icon={<v.icon className="h-3.5 w-3.5" aria-hidden />}>
      {v.label}
    </Badge>
  );
}

export function Stages({ stages }: { stages: TrustStage[] }) {
  return (
    <ul className="space-y-1.5">
      {stages.flatMap((s) => s.checks.map((c) => ({ stage: s.name, c }))).map(({ stage, c }, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
          <span>
            <span className="text-faint">{stage} · </span>
            <span className="font-medium text-ink">{c.name}.</span> <span className="text-muted">{c.reason}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
