import { useState, type ReactNode } from 'react';
import { ArrowRight, Lock, Unlock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DecisionBadge, RiskBadge, SourceBadge, ExecutionBadge, Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { JsonView } from '@/components/ui/JsonView';
import { CheckList } from './CheckList';
import { EvidenceList } from './EvidenceList';
import { Timeline } from './Timeline';
import { ExecutionFlow } from './ExecutionFlow';
import { ReviewControls } from './ReviewControls';
import { AlternativesList } from './AlternativesList';
import { actionLabel } from '@/data/agents';
import { formatDateTime } from '@/lib/format';
import { executionStatus } from '@/lib/records';
import type { EvaluationRecord } from '@/types';

type Tab = 'summary' | 'checks' | 'evidence' | 'timeline' | 'json';

export function DecisionDetail({ record }: { record: EvaluationRecord }) {
  const [tab, setTab] = useState<Tab>('summary');
  const { request, response } = record;
  const failed = response.checks.filter((c) => c.status === 'FAIL').length;
  const warned = response.checks.filter((c) => c.status === 'WARN').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionBadge decision={response.decision} size="lg" />
        <RiskBadge risk={response.risk_level} />
        <SourceBadge source={record.source} seeded={record.seeded} />
        <ExecutionBadge status={executionStatus(record)} />
      </div>

      <Segmented<Tab>
        label="Detail section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'summary', label: 'Summary' },
          { value: 'checks', label: 'Policy checks', count: response.checks.length },
          { value: 'evidence', label: 'Evidence', count: request.evidence.length },
          { value: 'timeline', label: 'Timeline', count: record.timeline.length },
          { value: 'json', label: 'JSON' },
        ]}
      />

      {tab === 'summary' && (
        <div className="space-y-4 animate-fade-in">
          <section>
            <p className="label mb-1.5">Explanation</p>
            <p className="text-sm text-ink">{response.reason || 'No explanation returned.'}</p>
            <p className="mt-1 text-xs text-faint">
              {failed} failed · {warned} warnings · {response.checks.length - failed - warned} passed
            </p>
          </section>

          <section>
            <p className="label mb-1.5">Proposal → authorization → execution</p>
            <ExecutionFlow record={record} />
            {record.execution && <p className="mt-2 text-xs text-muted">{record.execution.message}</p>}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Info label="Original action" value={actionLabel(request.action.type)} mono={request.action.type} />
            <Info label="Agent" value={record.agent_name} mono={request.agent_id} />
            <Info label="User intent" value={request.intent || '—'} />
            <Info label="Execution permitted" value={response.execution_allowed ? 'Yes' : 'No'} icon={response.execution_allowed ? <Unlock className="h-3.5 w-3.5 text-safe" /> : <Lock className="h-3.5 w-3.5 text-danger" />} />
            <Info label="Evaluated" value={formatDateTime(response.created_at)} />
            <Info label="Policy version" value={`${request.policy_id} · v${record.policy_version}`} />
          </section>

          <section>
            <p className="label mb-1.5">Input parameters</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-raised p-3 font-mono text-xs">
              {Object.entries(request.action.parameters).length === 0 && <dd className="col-span-2 text-faint">No parameters</dd>}
              {Object.entries(request.action.parameters).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-faint">{k}</dt>
                  <dd className="break-all text-ink">{String(v)}</dd>
                </div>
              ))}
            </dl>
            {request.context?.agent_reasoning && (
              <p className="mt-2 text-xs text-muted">
                <span className="text-faint">Agent reasoning:</span> {request.context.agent_reasoning}
              </p>
            )}
          </section>

          {response.alternatives.length > 0 && (
            <section>
              <p className="label mb-1.5">Suggested alternatives</p>
              <AlternativesList alternatives={response.alternatives} />
            </section>
          )}

          <section>
            <p className="label mb-1.5">Human oversight</p>
            <ReviewControls record={record} />
          </section>

          {record.retry_of && (
            <p className="text-xs text-muted">
              Retry of <span className="font-mono text-ink">{record.retry_of}</span>
            </p>
          )}

          <Link to={`/audit?id=${encodeURIComponent(record.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-soft hover:underline">
            Open in audit trail <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {tab === 'checks' && (
        <div className="animate-fade-in">
          <CheckList checks={response.checks} />
        </div>
      )}
      {tab === 'evidence' && (
        <div className="animate-fade-in">
          <EvidenceList evidence={request.evidence} flags={response.evidence_flags} />
        </div>
      )}
      {tab === 'timeline' && (
        <div className="animate-fade-in">
          <Timeline events={record.timeline} />
          <p className="mt-4 text-2xs text-faint">
            {record.source === 'mock' ? 'Local demo events stored in this browser — not an immutable audit log.' : 'Client-observed events; the backend audit log is authoritative.'}
          </p>
        </div>
      )}
      {tab === 'json' && (
        <div className="animate-fade-in space-y-2">
          <div className="flex gap-2">
            <Badge>request + response</Badge>
          </div>
          <JsonView value={{ request: record.request, response: record.response, review: record.review, execution: record.execution }} />
        </div>
      )}
    </div>
  );
}

function Info({ label, value, mono, icon }: { label: string; value: string; mono?: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-raised/60 px-3 py-2">
      <p className="label">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </p>
      {mono && <p className="truncate font-mono text-2xs text-faint">{mono}</p>}
    </div>
  );
}
