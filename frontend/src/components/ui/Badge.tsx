import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, ShieldX, ShieldAlert, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DECISION_LABEL, RISK_LABEL } from '@/lib/format';
import type { CheckStatus, DataSource, Decision, ExecutionStatus, ReviewStatus, RiskLevel } from '@/types';

export type Tone = 'safe' | 'warn' | 'danger' | 'accent' | 'violet' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  safe: 'bg-safe/10 text-safe border-safe/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
  accent: 'bg-accent/10 text-accent-soft border-accent/25',
  violet: 'bg-violet/10 text-violet border-violet/25',
  neutral: 'bg-overlay text-muted border-line',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-2xs font-medium', TONE_CLASSES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export const DECISION_TONE: Record<Decision, Tone> = { ALLOW: 'safe', BLOCK: 'danger', REVIEW_REQUIRED: 'warn' };
export const RISK_TONE: Record<RiskLevel, Tone> = { LOW: 'safe', MEDIUM: 'warn', HIGH: 'danger', CRITICAL: 'danger' };
export const STATUS_TONE: Record<CheckStatus, Tone> = { PASS: 'safe', WARN: 'warn', FAIL: 'danger' };

export function DecisionBadge({ decision, size = 'sm' }: { decision: Decision; size?: 'sm' | 'lg' }) {
  const Icon = decision === 'ALLOW' ? ShieldCheck : decision === 'BLOCK' ? ShieldX : ShieldAlert;
  return (
    <Badge tone={DECISION_TONE[decision]} className={size === 'lg' ? 'px-2.5 py-1 text-xs' : undefined} icon={<Icon className={size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden />}>
      {DECISION_LABEL[decision]}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <Badge tone={RISK_TONE[risk]} className={risk === 'CRITICAL' ? 'bg-danger/20 font-semibold' : undefined}>
      <span className="sr-only">Risk </span>
      {RISK_LABEL[risk]}
    </Badge>
  );
}

export function StatusIcon({ status, className }: { status: CheckStatus; className?: string }) {
  const cls = cn('h-4 w-4 shrink-0', className);
  if (status === 'PASS') return <CheckCircle2 className={cn(cls, 'text-safe')} aria-label="Pass" />;
  if (status === 'WARN') return <AlertTriangle className={cn(cls, 'text-warn')} aria-label="Warning" />;
  return <XCircle className={cn(cls, 'text-danger')} aria-label="Fail" />;
}

export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function SourceBadge({ source, seeded }: { source: DataSource; seeded?: boolean }) {
  if (seeded) return <Badge tone="violet">Demo seed</Badge>;
  return source === 'api' ? <Badge tone="accent">Backend</Badge> : <Badge tone="neutral">Mock</Badge>;
}

const EXECUTION: Record<ExecutionStatus, { label: string; tone: Tone }> = {
  NOT_ATTEMPTED: { label: 'Not attempted', tone: 'neutral' },
  EXECUTED: { label: 'Executed (simulated)', tone: 'safe' },
  REFUSED: { label: 'Refused by gateway', tone: 'danger' },
  ERROR: { label: 'Execution error', tone: 'warn' },
};

export function ExecutionBadge({ status }: { status: ExecutionStatus }) {
  const e = EXECUTION[status];
  return <Badge tone={e.tone}>{e.label}</Badge>;
}

const REVIEW: Record<ReviewStatus, { label: string; tone: Tone }> = {
  NONE: { label: 'No review', tone: 'neutral' },
  PENDING: { label: 'Review pending', tone: 'warn' },
  APPROVED: { label: 'Approved (demo)', tone: 'safe' },
  REJECTED: { label: 'Rejected (demo)', tone: 'danger' },
};

export function ReviewBadge({ status, source = 'mock' }: { status: ReviewStatus; source?: DataSource }) {
  const r = REVIEW[status];
  const label = source === 'api' && (status === 'APPROVED' || status === 'REJECTED') ? r.label.replace(' (demo)', '') : r.label;
  return (
    <Badge tone={r.tone} icon={status === 'PENDING' ? <CircleDashed className="h-3 w-3" aria-hidden /> : undefined}>
      {label}
    </Badge>
  );
}
