import { segmentText } from '@/lib/injection';
import { cn } from '@/lib/cn';
import type { EvidenceFlag } from '@/types';

/**
 * Renders untrusted evidence as plain text (React escapes it — never HTML) with flagged
 * passages highlighted. The content is displayed for inspection only and never executed.
 */
export function EvidenceText({ content, flags, className }: { content: string; flags: EvidenceFlag[]; className?: string }) {
  const segments = segmentText(content, flags);
  return (
    <p className={cn('whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted', className)}>
      {segments.map((s, i) =>
        s.flag ? (
          <mark
            key={i}
            title={s.flag.description}
            className={cn(
              'rounded px-0.5 text-ink decoration-2 underline-offset-2',
              s.flag.severity === 'HIGH' ? 'bg-danger/20 underline decoration-danger/70' : s.flag.severity === 'MEDIUM' ? 'bg-warn/20 underline decoration-warn/70' : 'bg-warn/10',
            )}
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}
