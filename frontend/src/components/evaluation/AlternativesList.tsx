import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatCurrency } from '@/lib/format';
import type { Alternative } from '@/types';

export function AlternativesList({ alternatives, action }: { alternatives: Alternative[]; action?: (alt: Alternative) => ReactNode }) {
  if (!alternatives.length) return <p className="text-xs text-faint">No alternatives suggested.</p>;
  return (
    <ul className="space-y-2">
      {alternatives.map((alt) => (
        <li key={alt.product_id} className="flex items-center gap-3 rounded-lg border border-line bg-raised/60 px-3 py-2">
          <Sparkles className="h-4 w-4 shrink-0 text-violet" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-ink">{alt.name}</span>
              <span className="font-mono text-xs text-safe">{formatCurrency(alt.price)}</span>
              <span className="text-xs text-faint">{alt.vendor}</span>
            </p>
            {alt.reason && <p className="truncate text-xs text-muted" title={alt.reason}>{alt.reason}</p>}
          </div>
          {action?.(alt)}
        </li>
      ))}
    </ul>
  );
}
