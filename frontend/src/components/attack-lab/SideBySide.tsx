import type { ReactNode } from 'react';
import { Bot, Gavel, Target, Wallet, Store, Wrench, FileText, MessageSquareQuote, ScanSearch, Sparkles, ShieldX, ShieldCheck, ShieldAlert } from 'lucide-react';
import { RiskBadge, CheckStatusBadge, Badge } from '@/components/ui/Badge';
import { EvidenceText } from '@/components/evaluation/EvidenceText';
import { AlternativesList } from '@/components/evaluation/AlternativesList';
import { AiAnalysisView } from '@/components/evaluation/AiAnalysisView';
import { ExecutionPanel } from '@/components/evaluation/ExecutionPanel';
import { ReviewControls } from '@/components/evaluation/ReviewControls';
import { aiSuspicionFlags } from '@/components/evaluation/EvidenceList';
import { actionLabel } from '@/data/agents';
import { formatCurrency, DECISION_LABEL, titleCase } from '@/lib/format';
import { effectiveReviewStatus } from '@/lib/records';
import { cn } from '@/lib/cn';
import type { EvaluationRecord } from '@/types';

const BANNER = {
  ALLOW: { cls: 'border-safe/35 bg-safe/[0.07]', text: 'text-safe', icon: ShieldCheck, title: 'Action approved' },
  BLOCK: { cls: 'border-danger/35 bg-danger/[0.07]', text: 'text-danger', icon: ShieldX, title: 'Action blocked' },
  REVIEW_REQUIRED: { cls: 'border-warn/35 bg-warn/[0.07]', text: 'text-warn', icon: ShieldAlert, title: 'Held for human review' },
} as const;

/** LEFT: what the agent proposed. RIGHT: what TrustLayer decided. */
export function SideBySide({ record }: { record: EvaluationRecord }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ProposalSide record={record} />
      <EvaluationSide record={record} />
    </div>
  );
}

function Card({ title, icon: Icon, tone, children }: { title: string; icon: typeof Bot; tone: 'agent' | 'trust'; children: ReactNode }) {
  return (
    <div className={cn('min-w-0 rounded-xl border p-3', tone === 'agent' ? 'border-line bg-raised/40' : 'border-accent/25 bg-accent/[0.03]')}>
      <p className={cn('label mb-3 flex items-center gap-1.5', tone === 'trust' && '!text-accent-soft')}>
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, k, v, mono }: { icon: typeof Bot; k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="flex shrink-0 items-center gap-1.5 text-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {k}
      </dt>
      <dd className={cn('min-w-0 break-words text-right text-ink', mono && 'font-mono text-xs')}>{v}</dd>
    </div>
  );
}

export function ProposalSide({ record }: { record: EvaluationRecord }) {
  const { request } = record;
  const p = request.action.parameters;
  const allFlags = [...record.response.evidence_flags, ...aiSuspicionFlags(record)];
  return (
    <Card title="Proposed agent decision" icon={Bot} tone="agent">
      <div>
        <p className="label mb-1">Objective</p>
        <p className="text-sm text-ink">{request.intent || '—'}</p>
      </div>
      <dl className="space-y-1.5">
        <Row icon={Wrench} k="Tool call" v={<span className="font-mono text-xs">{request.action.type}</span>} />
        <Row icon={Target} k="Target" v={(p.product_name as string) ?? (p.product_id as string) ?? actionLabel(request.action.type)} />
        <Row icon={Wallet} k="Price" v={typeof p.price === 'number' ? formatCurrency(p.price) : '—'} mono />
        <Row icon={Store} k="Vendor" v={(p.vendor as string) || '—'} />
      </dl>
      <div>
        <p className="label mb-1.5 flex items-center gap-1.5">
          <FileText className="h-3 w-3" aria-hidden /> Evidence provided
        </p>
        {request.evidence.length === 0 ? (
          <p className="text-xs text-faint">No evidence.</p>
        ) : (
          <ul className="space-y-2">
            {request.evidence.map((e) => (
              <li key={e.id} className="rounded-lg border border-line bg-surface p-2">
                <p className="mb-1 flex items-center gap-2 text-2xs text-faint">
                  <span className="font-mono">{e.id}</span> · {titleCase(e.source)} · untrusted
                </p>
                <EvidenceText content={e.content} flags={allFlags.filter((f) => f.evidence_id === e.id)} className="max-h-36 overflow-y-auto" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="label mb-1 flex items-center gap-1.5">
          <MessageSquareQuote className="h-3 w-3" aria-hidden /> Agent reasoning
        </p>
        <p className="text-xs text-muted">{request.context?.agent_reasoning || 'Not available for this proposal.'}</p>
        {record.source === 'api' && request.context?.agent_reasoning && <p className="mt-0.5 text-2xs text-faint">Kept for the audit view; not sent to the backend evaluation request.</p>}
      </div>
    </Card>
  );
}

export function EvaluationSide({ record }: { record: EvaluationRecord }) {
  const { response } = record;
  const b = BANNER[response.decision];
  const deterministic = response.evidence_flags.filter((f) => f.origin !== 'ai');
  const aiFlags = [...response.evidence_flags.filter((f) => f.origin === 'ai'), ...aiSuspicionFlags(record)];
  const violations = response.checks.filter((c) => c.status === 'FAIL');
  const review = effectiveReviewStatus(record);

  return (
    <Card title="TrustLayer evaluation" icon={Gavel} tone="trust">
      <div className={cn('rounded-lg border p-3', b.cls)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn('flex items-center gap-2', b.text)}>
            <b.icon className="h-5 w-5" aria-hidden />
            <span className="text-base font-semibold tracking-tight">{b.title}</span>
          </div>
          <RiskBadge risk={response.risk_level} />
        </div>
        <p className="mt-1.5 text-sm text-ink">{response.reason}</p>
        <p className="mt-1 font-mono text-2xs text-faint">{record.id}</p>
        <p className="sr-only">Decision: {DECISION_LABEL[response.decision]}</p>
      </div>

      <section>
        <p className="label mb-1.5">Policy checks</p>
        {response.checks.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {response.checks.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-start gap-2 px-2.5 py-1.5 text-xs">
                <CheckStatusBadge status={c.status} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="block text-muted">{c.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint">No checks returned.</p>
        )}
      </section>

      <section aria-label="Prompt injection analysis">
        <p className="label mb-1.5 flex items-center gap-1.5">
          <ScanSearch className="h-3 w-3" aria-hidden /> Evidence &amp; injection analysis
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Bucket title="Pattern detection" hint="deterministic" tone="warn" count={deterministic.length}>
            {deterministic.map((f, i) => (
              <li key={i}>
                {f.description}
                {f.matched_text && <span className="block font-mono text-2xs text-faint">“{f.matched_text}”</span>}
              </li>
            ))}
          </Bucket>
          <Bucket title="AI suspicion" hint={record.source === 'mock' ? 'not used in Demo Mode' : 'advisory model'} tone="violet" count={aiFlags.length}>
            {aiFlags.map((f, i) => (
              <li key={i}>
                {f.description}
                {f.matched_text && <span className="block font-mono text-2xs text-faint">“{f.matched_text}”</span>}
              </li>
            ))}
          </Bucket>
          <Bucket title="Policy violations" hint="confirmed FAIL checks" tone="danger" count={violations.length}>
            {violations.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.name}</span> — {c.reason}
              </li>
            ))}
          </Bucket>
        </div>
        <p className="mt-1.5 text-2xs text-faint">Suspicious-content detection is best-effort; it does not catch every prompt injection.</p>
      </section>

      <section>
        <p className="label mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" aria-hidden /> AI investigator
        </p>
        <AiAnalysisView record={record} compact />
      </section>

      <section>
        <p className="label mb-1.5">Gateway authorization</p>
        <ExecutionPanel record={record} />
      </section>

      {review === 'PENDING' && (
        <section>
          <p className="label mb-1.5">Human review</p>
          <ReviewControls record={record} hideRequest />
        </section>
      )}

      {response.alternatives.length > 0 && (
        <section>
          <p className="label mb-1.5">Recommended alternatives</p>
          <AlternativesList alternatives={response.alternatives} />
        </section>
      )}
    </Card>
  );
}

function Bucket({ title, hint, tone, count, children }: { title: string; hint: string; tone: 'warn' | 'violet' | 'danger'; count: number; children: ReactNode }) {
  const cls = tone === 'warn' ? 'border-warn/30 bg-warn/[0.04]' : tone === 'violet' ? 'border-violet/30 bg-violet/[0.04]' : 'border-danger/30 bg-danger/[0.04]';
  return (
    <div className={cn('min-w-0 rounded-lg border p-2', count ? cls : 'border-line bg-surface')}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-medium text-ink">{title}</p>
        <Badge tone={count ? tone : 'neutral'}>{count}</Badge>
      </div>
      <p className="text-2xs text-faint">{hint}</p>
      {count > 0 ? <ul className="mt-1.5 space-y-1 text-xs text-muted">{children}</ul> : <p className="mt-1.5 text-2xs text-faint">None</p>}
    </div>
  );
}
