import { CheckList } from '@/components/evaluation/CheckList';
import { EvidenceList, aiSuspicionFlags } from '@/components/evaluation/EvidenceList';
import { AiAnalysisView } from '@/components/evaluation/AiAnalysisView';
import { Badge, type Tone } from '@/components/ui/Badge';
import { STATUS_LABEL, type NodeStatus, type NodeView } from '@/lib/investigation';
import type { EvaluationRecord } from '@/types';

const TONE: Record<NodeStatus, Tone> = { pass: 'safe', warn: 'warn', fail: 'danger', info: 'accent', not_evaluated: 'neutral', pending: 'neutral' };

export function NodeDetail({ node, record, hidden }: { node: NodeView; record: EvaluationRecord; hidden?: boolean }) {
  if (hidden) {
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
        <p className="font-medium text-ink">{node.title}</p>
        <p className="mt-1">The replay has not reached this step yet. Press Next step or Play.</p>
      </div>
    );
  }
  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">{node.title}</h3>
          <Badge tone={TONE[node.status]}>{STATUS_LABEL[node.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{node.headline}</p>
      </div>

      {node.inputs.length > 0 && node.id !== 'evidence' && (
        <section>
          <p className="label mb-1.5">Inputs</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-raised p-3 font-mono text-xs">
            {node.inputs.map((i, idx) => (
              <div key={idx} className="contents">
                <dt className="text-faint">{i.label}</dt>
                <dd className="break-words text-ink">{i.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <p className="label mb-1.5">Recorded output</p>
        {node.checks.length ? <CheckList checks={node.checks} dense /> : <p className="text-xs text-faint">No check for this stage was returned by the {record.source === 'api' ? 'backend' : 'demo engine'}.</p>}
      </section>

      {node.unclassified.length > 0 && (
        <section>
          <p className="label mb-1.5">Checks without a stage</p>
          <CheckList checks={node.unclassified} dense />
        </section>
      )}

      {node.conditions.length > 0 && (
        <section>
          <p className="label mb-1.5">Relevant policy conditions {record.source === 'api' ? '(current backend policy)' : '(current demo policy)'}</p>
          <dl className="space-y-1 rounded-lg border border-line bg-raised/60 p-3 text-xs">
            {node.conditions.map((c) => (
              <div key={c.label} className="flex justify-between gap-3">
                <dt className="text-faint">{c.label}</dt>
                <dd className="min-w-0 break-words text-right font-mono text-ink">{c.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-2xs text-faint">Shows the policy as configured now; it may have changed since this evaluation ran. See the policy versions recorded on the evaluation.</p>
        </section>
      )}

      {node.id === 'evidence' && (
        <>
          <section>
            <p className="label mb-1.5">Supporting evidence</p>
            <EvidenceList evidence={record.request.evidence} flags={record.response.evidence_flags} aiFlags={aiSuspicionFlags(record)} />
          </section>
          <section>
            <p className="label mb-1.5">AI investigator</p>
            <AiAnalysisView record={record} compact />
          </section>
        </>
      )}

      {node.notes.length > 0 && (
        <ul className="space-y-1 text-2xs text-faint">
          {node.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
