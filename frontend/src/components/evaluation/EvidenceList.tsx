import { FileWarning, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EvidenceText } from './EvidenceText';
import { titleCase } from '@/lib/format';
import type { EvidenceFlag, EvidenceItem } from '@/types';

export function EvidenceList({ evidence, flags }: { evidence: EvidenceItem[]; flags: EvidenceFlag[] }) {
  if (!evidence.length) {
    return <p className="text-xs text-faint">No evidence was attached to this action.</p>;
  }
  return (
    <ul className="space-y-3">
      {evidence.map((item) => {
        const itemFlags = flags.filter((f) => f.evidence_id === item.id);
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
            {flagged && (
              <ul className="mt-3 space-y-1.5 border-t border-warn/20 pt-2">
                {itemFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <Badge tone={f.severity === 'HIGH' ? 'danger' : 'warn'}>{f.severity}</Badge>
                    <span className="text-muted">
                      {f.description}
                      {f.matched_text && <span className="ml-1 font-mono text-faint">“{f.matched_text}”</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      {flags.length > 0 && (
        <li className="text-2xs text-faint">
          Highlighted passages matched demo heuristics for instruction-like content. They were treated as data and not followed. These heuristics are not a complete injection detector.
        </li>
      )}
    </ul>
  );
}
