import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network, RefreshCw, Inbox, FileSearch } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge, DecisionBadge, RiskBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DecisionInvestigation } from '@/components/investigation/DecisionInvestigation';
import { DecisionDrawer } from '@/components/evaluation/DecisionDrawer';
import { useAppStore } from '@/context/AppStore';
import { filterRecords } from '@/lib/filters';
import { describeAction } from '@/lib/records';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';

export function InvestigatePage() {
  const { records, dataSource, refreshFromBackend, loadLivePolicies, live } = useAppStore();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inspect, setInspect] = useState<string | null>(null);

  const id = params.get('id') ?? records[0]?.id ?? null;
  const replay = params.get('replay') === '1';
  const record = records.find((r) => r.id === id);
  const visible = useMemo(() => filterRecords(records, 'ALL', query), [records, query]);

  useEffect(() => {
    if (dataSource === 'api' && !live.policies) loadLivePolicies().catch(() => undefined);
  }, [dataSource, live.policies, loadLivePolicies]);

  const sync = async () => {
    setLoading(true);
    try {
      await refreshFromBackend();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <Badge tone="accent">Decision Investigation</Badge>
            {dataSource === 'mock' && <Badge tone="violet">Demo Mode · simulated</Badge>}
          </div>
        }
        title="Inspect how every decision was made"
        description="Each evaluation is laid out as TrustLayer’s decision pipeline. Click a stage to see its inputs, recorded output, policy conditions and evidence. Replay walks through the stored result step by step."
        actions={
          dataSource === 'api' && (
            <Button size="sm" variant="secondary" icon={<RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => void sync()} disabled={loading}>
              Load backend history
            </Button>
          )
        }
      />
      {error !== null && (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Saved evaluations" subtitle={`${records.length} in ${dataSource === 'api' ? 'Live Backend Mode' : 'Demo Mode'}`} icon={<FileSearch className="h-3.5 w-3.5" />} bodyClassName="p-2">
          <div className="p-1 pb-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" label="Search evaluations" />
          </div>
          {visible.length === 0 ? (
            <p className="p-3 text-xs text-faint">{records.length ? 'No match.' : 'No evaluations yet.'}</p>
          ) : (
            <ul className="max-h-[640px] space-y-1 overflow-y-auto">
              {visible.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setParams({ id: r.id })}
                    aria-current={r.id === id ? 'true' : undefined}
                    className={cn('w-full rounded-lg border px-2.5 py-2 text-left transition-colors', r.id === id ? 'border-accent/45 bg-accent/[0.06]' : 'border-transparent hover:bg-overlay/50')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <DecisionBadge decision={r.response.decision} />
                      <span className="font-mono text-2xs text-faint">{formatTime(r.response.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink">{describeAction(r.request)}</p>
                    <p className="truncate font-mono text-2xs text-faint">{r.id}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={record ? describeAction(record.request) : 'Investigation'}
          subtitle={record ? <span className="font-mono">{record.id}</span> : 'Select an evaluation'}
          icon={<Network className="h-3.5 w-3.5 text-accent-soft" />}
          actions={
            record && (
              <>
                <RiskBadge risk={record.response.risk_level} />
                <Button size="sm" variant="ghost" onClick={() => setInspect(record.id)}>
                  Open inspector
                </Button>
              </>
            )
          }
        >
          {record ? (
            <DecisionInvestigation key={record.id + (replay ? ':r' : '')} record={record} initialReplay={replay} />
          ) : (
            <EmptyState icon={<Inbox className="h-4 w-4" />} title="No evaluation selected" description="Run the Agent Playground or Attack Lab, or load backend history, then pick an evaluation." className="min-h-[360px]" />
          )}
        </Panel>
      </div>
      <DecisionDrawer id={inspect} onClose={() => setInspect(null)} />
    </>
  );
}
