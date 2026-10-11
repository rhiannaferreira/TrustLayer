import { FileWarning, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EvidenceText } from './EvidenceText';
import { titleCase } from '@/lib/format';
import { classifyAiStatus, summarizeAiAnalysis } from '@/services/liveContract';
import type { EvaluationRecord, EvidenceFlag, EvidenceItem } from '@/types';

const ORIGIN_LABEL = {
  deterministic: { label: 'Pattern detection', tone: 'warn' as const },
  ai: { label: 'AI suspicion', tone: 'violet' as const },
  unknown: { label: 'Detector not stated', tone: 'neutral' as const },
};

/**
 * AI findings that quote evidence text, turned into highlight-only flags. Only produced when
 * the backend reports that AI analysis completed.
 */
export function aiSuspicionFlags(record: EvaluationRecord): EvidenceFlag[] {
  if (record.source !== 'api') return [];
  if (classifyAiStatus(record.response.ai_status, record.response.ai_analysis, record.response.ai_error) !== 'completed') return [];
  const view = summarizeAiAnalysis(record.response.ai_analysis);
  if (!view) return [];
  const out: EvidenceFlag[] = [];
  for (const f of view.findings) {
    if (!f.quote) continue;
    const item = record.request.evidence.find((e) => (f.evidence_id ? e.id === f.evidence_id : e.content.includes(f.quote!)) && e.content.includes(f.quote!));
    if (!item) continue;
    out.push({ evidence_id: item.id, type: 'ai-finding', severity: /high|crit/i.test(f.severity ?? '') ? 'HIGH' : 'MEDIUM', description: f.text, matched_text: f.quote, origin: 'ai' });
  }
  return out;
}

export function EvidenceList({ evidence, flags, aiFlags = [] }: { evidence: EvidenceItem[]; flags: EvidenceFlag[]; aiFlags?: EvidenceFlag[] }) {
  if (!evidence.length) {
    return <p className="text-xs text-faint">No evidence was attached to this action (or the backend history did not include it).</p>;
  }
  const all = [...flags, ...aiFlags];
  const unmatched = flags.filter((f) => !f.evidence_id || !evidence.some((e) => e.id === f.evidence_id));
  return (
    <ul className="space-y-3">
      {evidence.map((item) => {
        const itemFlags = all.filter((f) => f.evidence_id === item.id);
        const flagged = itemFlags.length > 0;
        return (
          <li key={item.id} className={flagged ? 'rounded-lg border border-warn/35 bg-warn/[0.04] p-3' : 'rounded-lg border border-line bg-raised p-3'}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {flagged ? <FileWarning className="h-4 w-4 text-warn" aria-hidden /> : <FileText className="h-4 w-4 text-faint" aria-hidden />}
              <span className="mono text-ink">{item.id}</span>
              <Badge>{titleCase(item.source)}</Badge>
              <Badge tone="neutral">Untrusted data</Badge>
              {flagged && <Badge tone="warn">{itemFlags.length} flag{itemFlags.length === 1 ? '' : 's'}</Badge>}
            </div>
            <EvidenceText content={item.content} flags={itemFlags} />
            {flagged && <FlagList flags={itemFlags} />}
          </li>
        );
      })}
      {unmatched.length > 0 && (
        <li className="rounded-lg border border-warn/25 p-3">
          <p className="label mb-1">Flags not linked to a specific evidence item</p>
          <FlagList flags={unmatched} />
        </li>
      )}
      {all.length > 0 && (
        <li className="space-y-1 text-2xs text-faint">
          <p className="flex flex-wrap items-center gap-1.5">
            Legend: <Badge tone="warn">Pattern detection</Badge> deterministic suspicious-pattern match · <Badge tone="violet">AI suspicion</Badge> raised by the AI advisory model · confirmed policy violations are the FAIL checks.
          </p>
          <p>Flagged passages were treated as data and not followed. Detection is best-effort and does not catch every prompt injection.</p>
        </li>
      )}
    </ul>
  );
}

function FlagList({ flags }: { flags: EvidenceFlag[] }) {
  return (
    <ul className="mt-3 space-y-1.5 border-t border-warn/20 pt-2">
      {flags.map((f, i) => {
        const origin = ORIGIN_LABEL[f.origin ?? 'deterministic'];
        return (
          <li key={i} className="flex flex-wrap items-start gap-2 text-xs">
            <Badge tone={f.severity === 'HIGH' ? 'danger' : 'warn'}>{f.severity}</Badge>
            <Badge tone={origin.tone}>{origin.label}</Badge>
            <span className="min-w-0 flex-1 text-muted">
              {f.description}
              {f.matched_text && <span className="ml-1 font-mono text-faint">“{f.matched_text}”</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
