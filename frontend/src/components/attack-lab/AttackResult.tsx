import type { ReactNode } from 'react';
import { ArrowRight, Bot, ShieldCheck, ShieldX, ShieldAlert, ListChecks, FileWarning, Gavel, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DecisionBadge, RiskBadge } from '@/components/ui/Badge';
import { CheckList } from '@/components/evaluation/CheckList';
import { EvidenceList } from '@/components/evaluation/EvidenceList';
import { ExecutionFlow } from '@/components/evaluation/ExecutionFlow';
import { AlternativesList } from '@/components/evaluation/AlternativesList';
import { ReviewControls } from '@/components/evaluation/ReviewControls';
import { Timeline } from '@/components/evaluation/Timeline';
import { actionLabel } from '@/data/agents';
import { formatCurrency, DECISION_LABEL } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { EvaluationRecord } from '@/types';

const BANNER = {
  ALLOW: { cls: 'border-safe/35 bg-safe/[0.07]', text: 'text-safe', icon: ShieldCheck, title: 'Action approved' },
  BLOCK: { cls: 'border-danger/35 bg-danger/[0.07]', text: 'text-danger', icon: ShieldX, title: 'Action blocked' },
  REVIEW_REQUIRED: { cls: 'border-warn/35 bg-warn/[0.07]', text: 'text-warn', icon: ShieldAlert, title: 'Held for human review' },
} as const;

export function AttackResult({ record, previous }: { record: EvaluationRecord; previous?: EvaluationRecord }) {
  const { request, response } = record;
  const b = BANNER[response.decision];
  const issues = response.checks.filter((c) => c.status !== 'PASS' && c.stage !== 'decision');
  const violations = response.checks.filter((c) => c.status === 'FAIL' && c.stage !== 'decision');
  const params = request.action.parameters;

  return (
    <div className="animate-fade-in space-y-4">
      <div className={cn('rounded-xl border p-4', b.cls)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn('flex items-center gap-2', b.text)}>
            <b.icon className="h-5 w-5" aria-hidden />
            <span className="text-lg font-semibold tracking-tight">{b.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge risk={response.risk_level} />
            <span className="font-mono text-2xs text-faint">{record.id}</span>
          </div>
        </div>
        <p className="mt-2 text-sm text-ink">{response.reason}</p>
        {previous && previous.id !== record.id && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            Previous run <DecisionBadge decision={previous.response.decision} /> <ArrowRight className="h-3 w-3" aria-hidden /> now <DecisionBadge decision={response.decision} />
            {previous.response.decision === response.decision && <span className="text-faint">(unchanged)</span>}
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-raised/50 p-3">
          <p className="label mb-2 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" aria-hidden /> Agent proposal
          </p>
          <dl className="space-y-1 text-sm">
            <Row k="Action" v={actionLabel(request.action.type)} />
            {params.product_name && <Row k="Product" v={String(params.product_name)} />}
            {params.price !== undefined && <Row k="Price" v={formatCurrency(params.price)} mono />}
            {params.vendor && <Row k="Vendor" v={String(params.vendor)} />}
            <Row k="Permissions" v={request.context?.permissions?.join(', ') || 'none'} mono small />
          </dl>
        </div>
        <div className="rounded-lg border border-line bg-raised/50 p-3">
          <p className="label mb-2 flex items-center gap-1.5">
            <Gavel className="h-3.5 w-3.5" aria-hidden /> TrustLayer evaluation
          </p>
          <dl className="space-y-1 text-sm">
            <Row k="Decision" v={DECISION_LABEL[response.decision]} />
            <Row k="Risk" v={response.risk_level} mono />
            <Row k="Checks" v={`${response.checks.filter((c) => c.status === 'PASS').length} pass · ${response.checks.filter((c) => c.status === 'WARN').length} warn · ${response.checks.filter((c) => c.status === 'FAIL').length} fail`} />
            <Row k="Execution" v={response.execution_allowed ? 'Permitted' : 'Not permitted'} />
            <Row k="Policy" v={`${request.policy_id} v${record.policy_version}`} mono small />
          </dl>
        </div>
      </div>

      <Section icon={ListChecks} title="Detected issues" count={issues.length}>
        {issues.length ? <CheckList checks={issues} dense /> : <p className="text-xs text-faint">No issues detected by the active policies.</p>}
      </Section>

      <Section icon={Gavel} title="Policy violations" count={violations.length} tone={violations.length ? 'danger' : undefined}>
        {violations.length ? (
          <ul className="space-y-1">
            {violations.map((v, i) => (
              <li key={i} className="rounded-md border border-danger/25 bg-danger/[0.05] px-2.5 py-1.5 text-xs">
                <span className="font-medium text-danger">{v.name}</span>
                <span className="text-muted"> — {v.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint">No hard policy violations.</p>
        )}
      </Section>

      <Section icon={FileWarning} title="Evidence warnings" count={response.evidence_flags.length} tone={response.evidence_flags.length ? 'warn' : undefined}>
        <EvidenceList evidence={request.evidence} flags={response.evidence_flags} />
      </Section>

      <Section icon={Zap} title="Execution outcome">
        <ExecutionFlow record={record} />
        {record.execution && (
          <p className={cn('mt-2 text-xs', record.execution.status === 'EXECUTED' ? 'text-safe' : record.execution.status === 'REFUSED' ? 'text-danger' : 'text-warn')}>
            {record.execution.message}
          </p>
        )}
        {response.decision !== 'ALLOW' && (
          <div className="mt-3">
            <ReviewControls record={record} />
          </div>
        )}
      </Section>

      {response.alternatives.length > 0 && (
        <Section icon={ShieldCheck} title="Suggested alternatives" count={response.alternatives.length}>
          <AlternativesList alternatives={response.alternatives} />
        </Section>
      )}

      <Section icon={ListChecks} title="Event timeline">
        <Timeline events={record.timeline} />
      </Section>

      <Link to={`/audit?id=${encodeURIComponent(record.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-soft hover:underline">
        View in audit trail <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Row({ k, v, mono, small }: { k: string; v: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className={cn('min-w-0 break-words text-right text-ink', mono && 'font-mono', small && 'text-xs')}>{v}</dd>
    </div>
  );
}

function Section({ icon: Icon, title, count, tone, children }: { icon: typeof Bot; title: string; count?: number; tone?: 'danger' | 'warn'; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-faint" aria-hidden />
        <p className="label">{title}</p>
        {count !== undefined && (
          <span className={cn('rounded px-1.5 text-2xs tabular-nums', tone === 'danger' ? 'bg-danger/15 text-danger' : tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-overlay text-faint')}>{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}
