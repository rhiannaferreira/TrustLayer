import { useState } from 'react';
import { RefreshCw, Activity, Inbox, Radio } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { SearchInput } from '@/components/ui/SearchInput';
import { Badge, DecisionBadge, RiskBadge, SourceBadge, ReviewBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { Toggle } from '@/components/ui/Toggle';
import { DecisionDrawer } from '@/components/evaluation/DecisionDrawer';
import { useInterval } from '@/hooks/useInterval';
import { decisionCounts, filterRecords, type DecisionFilter } from '@/lib/filters';
import { actionTarget, effectiveReviewStatus } from '@/lib/records';
import { actionLabel } from '@/data/agents';
import { formatDateTime, formatTime, formatCurrency } from '@/lib/format';

const POLL_MS = 5000;

export function DecisionsPage() {
  const { records, dataSource, refreshFromBackend } = useAppStore();
  const { notify } = useToast();
  const [filter, setFilter] = useState<DecisionFilter>('ALL');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const counts = decisionCounts(records);
  const visible = filterRecords(records, filter, query);

  const refresh = async (silent = false) => {
    if (dataSource === 'mock') {
      setLastSync(new Date().toISOString());
      if (!silent) notify({ tone: 'info', title: 'Up to date', description: 'Mock mode reads directly from local demo state; there is no backend to poll.' });
      return;
    }
    setRefreshing(true);
    try {
      const n = await refreshFromBackend();
      setError(null);
      setLastSync(new Date().toISOString());
      if (!silent) notify({ tone: 'success', title: 'Synced with backend', description: `${n} evaluation${n === 1 ? '' : 's'} returned.` });
    } catch (err) {
      setError(err);
      setPolling(false);
      if (!silent) notify({ tone: 'danger', title: 'Refresh failed', description: errorMessage(err).detail });
    } finally {
      setRefreshing(false);
    }
  };

  useInterval(() => void refresh(true), polling && dataSource === 'api' ? POLL_MS : null);

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="accent">Live Decisions</Badge>}
        title="Every agent action, evaluated"
        description="A monitoring console of each action TrustLayer evaluated in this session. Select a row to inspect checks, evidence and timeline."
        actions={
          <>
            {dataSource === 'api' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <Toggle size="sm" checked={polling} onChange={setPolling} label="Auto-refresh from backend" />
                Poll every {POLL_MS / 1000}s
              </label>
            )}
            <Button variant="secondary" size="sm" icon={<RefreshCw className={refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => void refresh()} disabled={refreshing}>
              Refresh
            </Button>
          </>
        }
      />

      {error !== null && (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      )}

      <Panel
        title={
          <span className="flex items-center gap-2">
            {dataSource === 'api' ? <Radio className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Activity className="h-3.5 w-3.5 text-violet" aria-hidden />}
            {dataSource === 'api' ? 'Backend evaluations' : 'Local demo evaluations'}
          </span>
        }
        subtitle={lastSync ? `Last refreshed ${formatTime(lastSync)}` : `${records.length} total`}
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented<DecisionFilter>
            label="Filter by decision"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'All', count: counts.ALL },
              { value: 'ALLOW', label: 'Approved', count: counts.ALLOW },
              { value: 'BLOCK', label: 'Blocked', count: counts.BLOCK },
              { value: 'REVIEW_REQUIRED', label: 'Review required', count: counts.REVIEW_REQUIRED },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Search ID, agent, action, vendor…" label="Search decisions" />
        </div>

        {visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Inbox className="h-4 w-4" />}
              title={records.length ? 'No decisions match these filters' : dataSource === 'api' ? 'No backend evaluations loaded' : 'No evaluations yet'}
              description={records.length ? 'Try clearing the search or choosing a different filter.' : dataSource === 'api' ? 'Run an evaluation or press Refresh to load history from the backend.' : 'Run the Agent Playground or Attack Lab.'}
              action={
                records.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => { setFilter('ALL'); setQuery(''); }}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wider text-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium">Evaluation</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Agent</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Action</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Target</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Risk</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Decision</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Review</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r) => {
                  const review = effectiveReviewStatus(r);
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => setSelected(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(r.id);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-overlay/50 focus-visible:bg-overlay/60"
                      aria-label={`Inspect ${r.id}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-ink">{r.id}</span>
                          {r.seeded && <SourceBadge source={r.source} seeded />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted">{r.agent_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-ink">{actionLabel(r.request.action.type)}</span>
                        {r.request.action.parameters.price !== undefined && (
                          <span className="ml-2 font-mono text-xs text-faint">{formatCurrency(r.request.action.parameters.price)}</span>
                        )}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-muted">{actionTarget(r.request)}</td>
                      <td className="px-4 py-2.5">
                        <RiskBadge risk={r.response.risk_level} />
                      </td>
                      <td className="px-4 py-2.5">
                        <DecisionBadge decision={r.response.decision} />
                      </td>
                      <td className="px-4 py-2.5">{review !== 'NONE' ? <ReviewBadge status={review} source={r.source} /> : <span className="text-faint">—</span>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-faint" title={formatDateTime(r.response.created_at)}>
                        {formatTime(r.response.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <DecisionDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
