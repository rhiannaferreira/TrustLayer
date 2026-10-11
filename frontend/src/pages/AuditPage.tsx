import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileClock, TriangleAlert, CloudDownload, Inbox } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { SearchInput } from '@/components/ui/SearchInput';
import { Badge, DecisionBadge, ExecutionBadge, ReviewBadge, StatusIcon } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { AuditDrawer } from '@/components/audit/AuditDrawer';
import { createHttpClient } from '@/services/api';
import { normalizeAuditEvent } from '@/services/liveContract';
import { toAuditEvent } from '@/lib/records';
import { downloadJson, timestampSlug } from '@/lib/download';
import { AGENTS, actionLabel, agentName } from '@/data/agents';
import { formatDateTime } from '@/lib/format';
import type { AuditEvent, Decision, ReviewStatus } from '@/types';

type DecisionFilter = 'ALL' | Decision;
type ReviewFilter = 'ALL' | ReviewStatus;

export function AuditPage() {
  const { records, dataSource, apiBaseUrl } = useAppStore();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const [decision, setDecision] = useState<DecisionFilter>('ALL');
  const [review, setReview] = useState<ReviewFilter>('ALL');
  const [agent, setAgent] = useState('ALL');
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const events = useMemo(() => {
    const local = records.map(toAuditEvent);
    if (dataSource !== 'api' || !remote.length) return local;
    // Backend audit events are authoritative: drop client-derived events for the same evaluation.
    const remoteEvals = new Set(remote.map((e) => e.evaluation_id));
    const byId = new Map(local.filter((e) => !remoteEvals.has(e.evaluation_id)).map((e) => [e.event_id, e]));
    for (const e of remote) byId.set(e.event_id, { ...e, source: 'api' });
    return Array.from(byId.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [records, remote, dataSource]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (decision !== 'ALL' && e.decision !== decision) return false;
      if (review !== 'ALL' && e.review_state !== review) return false;
      if (agent !== 'ALL' && e.agent_id !== agent) return false;
      if (!q) return true;
      return [e.evaluation_id, e.event_id, e.agent_id, agentName(e.agent_id), e.action.type, e.explanation, e.decision].join(' ').toLowerCase().includes(q);
    });
  }, [events, decision, review, agent, query]);

  const selectedId = params.get('id');
  const selected = selectedId ? events.find((e) => e.evaluation_id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !events.some((e) => e.evaluation_id === selectedId)) {
      notify({ tone: 'warning', title: 'Audit record not found', description: `${selectedId} is not in the current data source.` });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const open = (id: string) => setParams({ id });
  const close = () => setParams({}, { replace: true });

  const exportVisible = () => {
    downloadJson(`trustlayer-audit-${timestampSlug()}.json`, {
      exported_at: new Date().toISOString(),
      source: dataSource === 'api' ? 'backend + client-observed' : 'local demo (browser storage)',
      notice: 'Demo export. Local records are not an immutable production audit log.',
      filters: { decision, review, agent, query },
      count: visible.length,
      events: visible,
    });
    notify({ tone: 'success', title: 'Audit export downloaded', description: `${visible.length} record${visible.length === 1 ? '' : 's'} exported as JSON.` });
  };

  const loadRemote = async () => {
    setLoading(true);
    try {
      const items = (await createHttpClient(apiBaseUrl).listAuditEvents()).map(normalizeAuditEvent).filter((e): e is AuditEvent => e !== null);
      setRemote(items);
      setError(null);
      notify({ tone: 'success', title: 'Audit events loaded', description: `${items.length} event${items.length === 1 ? '' : 's'} from the backend.` });
    } catch (err) {
      setError(err);
      notify({ tone: 'danger', title: 'Could not load audit events', description: errorMessage(err).detail });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="accent">Audit Trail</Badge>}
        title="Every decision, on the record"
        description="Timestamped history of evaluations: original action, checks, policy version, decision, execution and review state."
        actions={
          <>
            {dataSource === 'api' && (
              <Button variant="secondary" size="sm" icon={<CloudDownload className="h-3.5 w-3.5" />} loading={loading} onClick={() => void loadRemote()}>
                Load from backend
              </Button>
            )}
            <Button variant="primary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportVisible} disabled={!visible.length}>
              Export JSON ({visible.length})
            </Button>
          </>
        }
      />

      {dataSource === 'mock' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warn/25 bg-warn/[0.05] px-3 py-2.5 text-xs text-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
          <span>
            <span className="font-medium text-ink">Local demo records.</span> These are stored in your browser’s localStorage and can be edited or cleared. They are not an immutable production audit log.
          </span>
        </div>
      )}
      {error !== null && (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      )}

      <Panel title="Audit records" subtitle={`${visible.length} of ${events.length} shown`} icon={<FileClock className="h-3.5 w-3.5" />} bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <Segmented<DecisionFilter>
              label="Decision"
              value={decision}
              onChange={setDecision}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'ALLOW', label: 'Approved' },
                { value: 'BLOCK', label: 'Blocked' },
                { value: 'REVIEW_REQUIRED', label: 'Review' },
              ]}
            />
            <select aria-label="Review state" className="input h-8 w-auto py-1 text-xs" value={review} onChange={(e) => setReview(e.target.value as ReviewFilter)}>
              <option value="ALL">Any review state</option>
              <option value="NONE">No review</option>
              <option value="PENDING">Review pending</option>
              <option value="APPROVED">Review approved</option>
              <option value="REJECTED">Review rejected</option>
            </select>
            <select aria-label="Agent" className="input h-8 w-auto py-1 text-xs" value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="ALL">All agents</option>
              {AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search ID, agent, action, explanation…" label="Search audit records" />
        </div>

        {visible.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Inbox className="h-4 w-4" />} title={events.length ? 'No records match these filters' : 'No audit records yet'} description={events.length ? 'Adjust or clear the filters.' : 'Evaluations appear here as soon as they are run.'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wider text-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium">Timestamp</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Evaluation</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Agent</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Original action</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Checks</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Policy</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Decision</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Execution</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((e) => (
                  <tr
                    key={e.event_id}
                    tabIndex={0}
                    className="cursor-pointer align-top hover:bg-overlay/50 focus-visible:bg-overlay/60"
                    onClick={() => open(e.evaluation_id)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        open(e.evaluation_id);
                      }
                    }}
                    aria-label={`Inspect audit record ${e.evaluation_id}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted">{formatDateTime(e.timestamp)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink">{e.evaluation_id}</td>
                    <td className="px-4 py-2.5 text-muted">{agentName(e.agent_id)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink">{actionLabel(e.action.type)}</span>
                      <p className="max-w-[260px] truncate text-xs text-faint" title={e.explanation}>
                        {e.explanation}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-0.5" aria-label={`${e.checks.length} checks`}>
                        {e.checks.slice(0, 9).map((c, i) => (
                          <span key={i} title={`${c.name}: ${c.status}`}>
                            <StatusIcon status={c.status} className="h-3.5 w-3.5" />
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{e.policy_version !== null ? `v${e.policy_version}` : '—'}</td>
                    <td className="px-4 py-2.5">
                      {e.decision ? <DecisionBadge decision={e.decision} /> : <Badge>{e.event_type ?? 'event'}</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      <ExecutionBadge status={e.execution_status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ReviewBadge status={e.review_state} source={e.source} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <AuditDrawer event={selected} onClose={close} />
    </>
  );
}
