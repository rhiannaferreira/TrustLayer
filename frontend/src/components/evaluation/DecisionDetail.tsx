import { useState, type ReactNode } from 'react';
import { ArrowRight, Download, Lock, Network, Unlock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DecisionBadge, RiskBadge, SourceBadge, ExecutionBadge, Badge, CheckStatusBadge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { JsonView } from '@/components/ui/JsonView';
import { Button } from '@/components/ui/Button';
import { EvidenceList, aiSuspicionFlags } from './EvidenceList';
import { Timeline } from './Timeline';
import { ExecutionFlow } from './ExecutionFlow';
import { ExecutionPanel } from './ExecutionPanel';
import { ReviewControls } from './ReviewControls';
import { AlternativesList } from './AlternativesList';
import { AiAnalysisView, AI_OUTCOME, aiOutcomeOf } from './AiAnalysisView';
import { ExchangeLog } from './ExchangeLog';
import { actionLabel } from '@/data/agents';
import { formatDateTime } from '@/lib/format';
import { actionTarget, executionStatus } from '@/lib/records';
import { downloadJson } from '@/lib/download';
import { nodeForCheck, INVESTIGATION_NODES } from '@/lib/investigation';
import type { EvaluationRecord } from '@/types';

type Tab = 'summary' | 'checks' | 'ai' | 'evidence' | 'execution' | 'timeline' | 'json';

export function DecisionDetail({ record }: { record: EvaluationRecord }) {
  const [tab, setTab] = useState<Tab>('summary');
  const { request, response } = record;
  const failed = response.checks.filter((c) => c.status === 'FAIL').length;
  const warned = response.checks.filter((c) => c.status === 'WARN').length;
  const ai = AI_OUTCOME[aiOutcomeOf(record)];
  const action = response.action ?? request.action;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionBadge decision={response.decision} size="lg" />
        <RiskBadge risk={response.risk_level} />
        <SourceBadge source={record.source} seeded={record.seeded} />
        <ExecutionBadge status={executionStatus(record)} />
        {record.source === 'api' && <Badge tone={ai.tone}>{ai.label}</Badge>}
        <Link to={`/investigate?id=${encodeURIComponent(record.id)}`} className="ml-auto inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent-soft hover:bg-accent/15">
          <Network className="h-3.5 w-3.5" aria-hidden /> Investigate pipeline
        </Link>
      </div>

      <Segmented<Tab>
        label="Inspector section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'summary', label: 'Summary' },
          { value: 'checks', label: 'Policy Checks', count: response.checks.length },
          { value: 'ai', label: 'AI Analysis' },
          { value: 'evidence', label: 'Evidence', count: request.evidence.length },
          { value: 'execution', label: 'Execution' },
          { value: 'timeline', label: 'Timeline', count: record.timeline.length },
          { value: 'json', label: 'Raw JSON' },
        ]}
      />

      {tab === 'summary' && (
        <div className="animate-fade-in space-y-4">
          <section>
            <p className="label mb-1.5">Explanation</p>
            <p className="text-sm text-ink">{response.reason || 'No explanation returned.'}</p>
            <p className="mt-1 text-xs text-faint">
              {failed} failed · {warned} warnings · {response.checks.length - failed - warned} passed
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Info label="Decision" value={response.decision} />
            <Info label="Risk level" value={response.risk_level} />
            <Info label="Agent" value={record.agent_name} mono={request.agent_id} />
            <Info label="Target" value={actionTarget(request)} mono={`${actionLabel(action.type)} · ${action.type}`} />
            <Info label="Timestamp" value={formatDateTime(response.created_at)} mono={record.id} />
            <Info
              label="Execution permitted"
              value={response.execution_allowed ? 'Yes' : 'No'}
              icon={response.execution_allowed ? <Unlock className="h-3.5 w-3.5 text-safe" /> : <Lock className="h-3.5 w-3.5 text-danger" />}
            />
            <Info label="User intent" value={request.intent || '—'} />
            <Info label="Policy" value={`${request.policy_id}${record.policy_version ? ` · v${record.policy_version}` : ''}`} />
          </section>

          <section>
            <p className="label mb-1.5">Proposal → authorization → execution</p>
            <ExecutionFlow record={record} />
          </section>

          <section>
            <p className="label mb-1.5">Evaluated action</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-raised p-3 font-mono text-xs">
              <dt className="text-faint">type</dt>
              <dd className="text-ink">{action.type}</dd>
              {Object.entries(action.parameters ?? {}).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-faint">{k}</dt>
                  <dd className="break-all text-ink">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
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
        <div className="animate-fade-in space-y-3">
          {response.checks.length === 0 ? (
            <p className="text-xs text-faint">No checks were returned.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {response.checks.map((c, i) => {
                const { node, classified } = nodeForCheck(c);
                return (
                  <li key={`${c.name}-${i}`} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckStatusBadge status={c.status} />
                      <span className="font-medium text-ink">{c.name}</span>
                      <span className="ml-auto text-2xs text-faint">{classified ? INVESTIGATION_NODES.find((n) => n.id === node)?.title : 'Unmapped stage'}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{c.reason || 'No reason given.'}</p>
                    {c.policy_id && <p className="mt-0.5 font-mono text-2xs text-faint">policy: {c.policy_id}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <section>
            <p className="label mb-1.5">Policy versions used</p>
            {response.policy_versions !== undefined && response.policy_versions !== null ? (
              <JsonView value={response.policy_versions} maxHeight="max-h-40" />
            ) : (
              <p className="text-xs text-muted">{record.source === 'mock' ? `Demo policy set ${request.policy_id} v${record.policy_version}` : 'The backend did not return policy_versions for this evaluation.'}</p>
            )}
          </section>
        </div>
      )}

      {tab === 'ai' && (
        <div className="animate-fade-in">
          <AiAnalysisView record={record} />
        </div>
      )}

      {tab === 'evidence' && (
        <div className="animate-fade-in">
          {record.request_reconstructed && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.05] p-2.5 text-xs text-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden /> This record was loaded from backend history, which did not include the original evidence.
            </p>
          )}
          <EvidenceList evidence={request.evidence} flags={response.evidence_flags} aiFlags={aiSuspicionFlags(record)} />
        </div>
      )}

      {tab === 'execution' && (
        <div className="animate-fade-in space-y-4">
          <ExecutionFlow record={record} />
          <ExecutionPanel record={record} />
          {record.source === 'api' && response.executed !== undefined && <p className="font-mono text-2xs text-faint">backend executed flag at evaluation time: {String(response.executed)}</p>}
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
        <div className="animate-fade-in space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={record.source === 'api' ? 'accent' : 'violet'}>{record.source === 'api' ? 'Actual API response' : 'Demo engine output (no HTTP)'}</Badge>
            <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />} className="ml-auto" onClick={() => downloadJson(`trustlayer-${record.id}.json`, record.raw ?? record.response)}>
              Download JSON
            </Button>
          </div>
          <JsonView value={record.raw ?? record.response} />
          {record.contract_notes && record.contract_notes.length > 0 && (
            <div className="rounded-lg border border-warn/30 bg-warn/[0.05] p-3 text-xs">
              <p className="font-medium text-warn">Contract notes</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
                {record.contract_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {record.exchanges && record.exchanges.length > 0 && (
            <section>
              <p className="label mb-1.5">HTTP exchanges</p>
              <ExchangeLog exchanges={record.exchanges} />
            </section>
          )}
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
