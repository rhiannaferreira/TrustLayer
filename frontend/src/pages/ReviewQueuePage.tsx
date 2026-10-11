import { useCallback, useEffect, useState } from 'react';
import { Check, X, Inbox } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Stages, VerdictBadge } from '@/components/gate/Verdict';
import { useGateClient } from '@/hooks/useGateClient';
import type { StoredDecision } from '@/services/api';

export function ReviewQueuePage() {
  const client = useGateClient();
  const [items, setItems] = useState<StoredDecision[]>([]);
  const [history, setHistory] = useState<StoredDecision[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await client.decisions();
      setItems(all.filter((d) => d.review_status === 'PENDING'));
      setHistory(all.filter((d) => d.review_status === 'APPROVED' || d.review_status === 'REJECTED').slice(0, 20));
    } catch (e) {
      setError(e);
    }
  }, [client]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function act(id: string, decision: 'APPROVE' | 'REJECT') {
    setBusyId(id);
    try {
      await client.reviewTrustDecision(id, decision, 'reviewer');
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Actions TrustLayer would not allow on its own. A human approves or rejects each one; the choice is recorded in the audit trail. Approving a step from the Agent workspace runs it in the sandbox; for external agents, the agent polls for your answer."
      />
      <div className="space-y-4">
        {error != null && <ErrorBanner error={error} />}
        {items.length === 0 ? (
          <EmptyState icon={<Inbox className="h-4 w-4" />} title="Nothing waiting" description="Run a task in the Agent workspace that needs sign-off, such as deleting many files." />
        ) : (
          items.map((d) => (
            <Panel
              key={d.evaluation_id}
              title={`${d.agent_name ?? d.agent_id} · ${d.action}`}
              subtitle={d.reason}
              actions={<><VerdictBadge decision={d.decision} /><Badge tone="neutral">{d.source}</Badge></>}
            >
              <pre className="mb-3 overflow-x-auto rounded-lg border border-line bg-raised p-2 text-2xs text-muted">{JSON.stringify(d.parameters, null, 2)}</pre>
              <Stages stages={d.stages} />
              <div className="mt-4 flex gap-2">
                <Button variant="primary" icon={<Check className="h-4 w-4" />} loading={busyId === d.evaluation_id} onClick={() => act(d.evaluation_id, 'APPROVE')}>Approve</Button>
                <Button icon={<X className="h-4 w-4" />} disabled={busyId === d.evaluation_id} onClick={() => act(d.evaluation_id, 'REJECT')}>Reject</Button>
              </div>
            </Panel>
          ))
        )}
        {history.length > 0 && (
          <Panel title="Recently reviewed">
            <ul className="divide-y divide-line text-xs">
              {history.map((d) => (
                <li key={d.evaluation_id} className="flex items-center justify-between py-2">
                  <span className="text-ink">{d.action} <span className="text-faint">· {d.agent_name ?? d.agent_id}</span></span>
                  <Badge tone={d.review_status === 'APPROVED' ? 'safe' : 'danger'}>{d.review_status}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
