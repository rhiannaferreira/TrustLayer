import { useState } from 'react';
import { Drawer } from '@/components/ui/Overlay';
import { Segmented } from '@/components/ui/Segmented';
import { JsonView } from '@/components/ui/JsonView';
import { DecisionBadge, RiskBadge, ExecutionBadge, ReviewBadge, Badge } from '@/components/ui/Badge';
import { CheckList } from '@/components/evaluation/CheckList';
import { Timeline } from '@/components/evaluation/Timeline';
import { ReviewControls } from '@/components/evaluation/ReviewControls';
import { useRecord } from '@/context/AppStore';
import { actionLabel, agentName } from '@/data/agents';
import { formatDateTime } from '@/lib/format';
import type { AuditEvent } from '@/types';

type Tab = 'event' | 'json';

export function AuditDrawer({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('event');
  const record = useRecord(event?.evaluation_id);
  return (
    <Drawer
      open={!!event}
      onClose={onClose}
      title={event ? `Audit event · ${event.evaluation_id}` : 'Audit event'}
      subtitle={event && <span className="font-mono">{event.event_id} · {formatDateTime(event.timestamp)}</span>}
    >
      {event && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {event.decision ? <DecisionBadge decision={event.decision} size="lg" /> : <Badge>{event.event_type ?? 'Event'}</Badge>}
            {event.risk_level && <RiskBadge risk={event.risk_level} />}
            <ExecutionBadge status={event.execution_status} />
            <ReviewBadge status={event.review_state} source={event.source} />
            <Badge tone={event.source === 'api' ? 'accent' : 'neutral'}>{event.source === 'api' ? 'Backend' : 'Local demo record'}</Badge>
          </div>
          <Segmented<Tab> label="View" value={tab} onChange={setTab} options={[{ value: 'event', label: 'Event' }, { value: 'json', label: 'JSON' }]} />
          {tab === 'event' ? (
            <div className="space-y-4 animate-fade-in">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <Item k="Agent" v={`${agentName(event.agent_id)} (${event.agent_id})`} />
                <Item k="Original action" v={`${actionLabel(event.action.type)} · ${event.action.type}`} />
                <Item k="Policy version" v={event.policy_version !== null ? `v${event.policy_version}` : '—'} />
                <Item k="Timestamp" v={formatDateTime(event.timestamp)} />
              </dl>
              <section>
                <p className="label mb-1.5">Explanation</p>
                <p className="text-sm text-ink">{event.explanation}</p>
              </section>
              <section>
                <p className="label mb-1.5">Evaluation checks</p>
                <CheckList checks={event.checks} dense />
              </section>
              {record && (
                <>
                  <section>
                    <p className="label mb-1.5">Human oversight</p>
                    <ReviewControls record={record} />
                  </section>
                  <section>
                    <p className="label mb-1.5">Event timeline</p>
                    <Timeline events={record.timeline} />
                  </section>
                </>
              )}
            </div>
          ) : (
            <JsonView value={record ? { audit_event: event.raw ?? event, request: record.request, response: record.response, timeline: record.timeline } : { audit_event: event.raw ?? event }} />
          )}
        </div>
      )}
    </Drawer>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised/60 px-3 py-2">
      <dt className="label">{k}</dt>
      <dd className="mt-0.5 break-words text-ink">{v}</dd>
    </div>
  );
}
