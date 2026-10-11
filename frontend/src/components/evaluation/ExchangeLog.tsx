import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { JsonView } from '@/components/ui/JsonView';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ApiExchange } from '@/types';

/** Collapsible request/response JSON for technical inspection. Shows exactly what was sent and received. */
export function ExchangeLog({ exchanges, defaultOpen = false }: { exchanges: ApiExchange[]; defaultOpen?: boolean }) {
  if (!exchanges.length) return <p className="text-xs text-faint">No requests recorded yet.</p>;
  return (
    <ul className="space-y-1.5">
      {exchanges.map((x, i) => (
        <ExchangeRow key={x.id} x={x} defaultOpen={defaultOpen && i === exchanges.length - 1} />
      ))}
    </ul>
  );
}

function ExchangeRow({ x, defaultOpen }: { x: ApiExchange; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const tone = x.simulated ? 'violet' : x.ok ? 'safe' : x.status ? 'danger' : 'warn';
  return (
    <li className="rounded-lg border border-line bg-raised/40">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs">
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-faint transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="font-mono font-semibold text-ink">{x.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted">{x.path}</span>
        {x.simulated ? <Badge tone="violet">simulated · no HTTP</Badge> : <Badge tone={tone}>{x.status ? `HTTP ${x.status}` : 'no response'}</Badge>}
        {x.duration_ms !== undefined && <span className="font-mono text-2xs text-faint">{x.duration_ms}ms</span>}
        <span className="hidden font-mono text-2xs text-faint sm:inline">{formatTime(x.started_at)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-2.5">
          <p className="break-all font-mono text-2xs text-faint">{x.url}</p>
          {x.request_body !== undefined && (
            <div>
              <p className="label mb-1">Request body</p>
              <JsonView value={x.request_body} maxHeight="max-h-56" />
            </div>
          )}
          <div>
            <p className="label mb-1">Response body</p>
            {x.response_body !== undefined ? <JsonView value={x.response_body} maxHeight="max-h-72" /> : <p className="text-xs text-faint">{x.error ?? 'Empty response.'}</p>}
          </div>
          {x.error && x.response_body !== undefined && <p className="text-xs text-danger">{x.error}</p>}
        </div>
      )}
    </li>
  );
}
