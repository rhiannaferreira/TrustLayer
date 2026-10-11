import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles, Server, FileJson } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useConnection, type AiIndicator, type BackendState } from '@/context/ConnectionContext';
import { describeBaseUrl } from '@/lib/config';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const BACKEND: Record<BackendState, { label: string; dot: string }> = {
  connected: { label: 'Connected', dot: 'bg-safe shadow-[0_0_6px_rgb(var(--safe))]' },
  disconnected: { label: 'Disconnected', dot: 'bg-danger' },
  checking: { label: 'Checking', dot: 'animate-pulse bg-faint' },
};

export const AI_INDICATOR: Record<AiIndicator, { label: string; cls: string; hint: string }> = {
  checking: { label: 'AI: checking', cls: 'border-line text-faint', hint: 'Reading /api/v1/ai/status…' },
  configured: { label: 'AI Configured', cls: 'border-accent/30 bg-accent/10 text-accent-soft', hint: 'Credentials are loaded on the backend. No AI inference has completed in this session yet.' },
  verified: { label: 'AI Inference Completed', cls: 'border-safe/30 bg-safe/10 text-safe', hint: 'A backend evaluation in this session reported a completed AI analysis.' },
  unavailable: { label: 'AI Unavailable', cls: 'border-line bg-overlay text-muted', hint: 'The backend reports AI is not configured, or /ai/status could not be read.' },
  failed: { label: 'AI Request Failed', cls: 'border-danger/30 bg-danger/10 text-danger', hint: 'The latest AI-assisted evaluation reported a failed AI request.' },
  unknown: { label: 'AI status unknown', cls: 'border-warn/30 bg-warn/10 text-warn', hint: 'The backend answered /ai/status, but not in a form the frontend recognises.' },
  off: { label: 'AI off (Demo Mode)', cls: 'border-line text-faint', hint: 'Demo Mode never calls an AI model.' },
};

export function ConnectionIndicator() {
  const { dataSource, apiBaseUrl } = useAppStore();
  const conn = useConnection();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const b = BACKEND[conn.backend];
  const ai = AI_INDICATOR[conn.aiIndicator];
  const live = dataSource === 'api';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-line-strong hover:text-ink"
        aria-label={`Backend ${b.label}${live ? `, ${ai.label}` : ''}. Show connection details.`}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', b.dot)} aria-hidden />
        <span className="hidden sm:inline">Backend {b.label.toLowerCase()}</span>
        <span className="sm:hidden">{b.label}</span>
        {live && <span className={cn('hidden rounded-full border px-1.5 py-px text-2xs font-medium md:inline', ai.cls)}>{ai.label}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Connection details" className="card absolute right-0 top-9 z-40 w-[340px] animate-fade-in border-line-strong p-3 shadow-pop">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Backend connection</p>
            <button onClick={() => void conn.check()} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-muted hover:bg-overlay hover:text-ink">
              <RefreshCw className="h-3 w-3" aria-hidden /> Re-check
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <Row icon={Server} k="Status" v={<span className="inline-flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', b.dot)} />{b.label}{conn.latency !== null && <span className="font-mono text-faint">{conn.latency}ms</span>}</span>} />
            <Row k="Target" v={<span className="break-all font-mono text-2xs">{describeBaseUrl(apiBaseUrl)}</span>} />
            <Row k="Last check" v={conn.checkedAt ? formatTime(conn.checkedAt) : '—'} />
            <Row k="Mode" v={live ? 'Live Backend Mode' : 'Demo Mode (simulated, backend not used)'} />
          </dl>

          <div className="mt-3 border-t border-line pt-3">
            <p className="label mb-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" aria-hidden /> AI advisory (Luminal)
            </p>
            <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-2xs font-medium', ai.cls)}>{ai.label}</span>
            <p className="mt-1.5 text-2xs text-muted">{ai.hint}</p>
            {conn.ai && (
              <dl className="mt-2 space-y-1 text-xs">
                <Row k="Provider" v={conn.ai.provider ?? '—'} />
                <Row k="Model" v={<span className="break-all font-mono text-2xs">{conn.ai.model ?? '—'}</span>} />
                {conn.ai.mode && <Row k="Mode" v={conn.ai.mode} />}
                <Row k="Configured" v={conn.ai.configured === undefined ? 'not reported' : conn.ai.configured ? 'yes' : 'no'} />
              </dl>
            )}
            {conn.aiError && <p className="mt-1.5 break-words text-2xs text-danger">/ai/status: {conn.aiError}</p>}
            {conn.lastAi && (
              <p className="mt-1.5 text-2xs text-faint">
                Latest AI result: <span className="font-mono text-muted">{conn.lastAi.status ?? 'n/a'}</span> on <span className="font-mono">{conn.lastAi.id}</span>
                {conn.lastAi.error && <span className="block text-danger">{conn.lastAi.error}</span>}
              </p>
            )}
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <p className="label mb-1.5 flex items-center gap-1.5">
              <FileJson className="h-3 w-3" aria-hidden /> OpenAPI contract
            </p>
            {conn.contract ? (
              <ContractSummary />
            ) : (
              <p className="text-2xs text-faint">{conn.contractError ? `Not checked: ${conn.contractError}` : conn.backend === 'connected' ? 'Checking…' : 'Checked once the backend is reachable.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractSummary() {
  const { contract } = useConnection();
  if (!contract) return null;
  const present = contract.operations.filter((o) => o.present).length;
  return (
    <div className="space-y-1 text-2xs">
      <p className="text-muted">
        {present}/{contract.operations.length} expected endpoints present{contract.title ? ` in “${contract.title}”` : ''}.
      </p>
      {contract.operations
        .filter((o) => !o.present)
        .map((o) => (
          <p key={o.method + o.path} className="font-mono text-warn">
            missing {o.method} {o.path}
          </p>
        ))}
      {contract.evaluationFields && contract.evaluationFields.missing.length > 0 && (
        <p className="text-warn">Evaluation fields not in schema: {contract.evaluationFields.missing.join(', ')}</p>
      )}
      {contract.problems.map((p) => (
        <p key={p} className="text-danger">
          {p}
        </p>
      ))}
      {contract.problems.length === 0 && present === contract.operations.length && <p className="text-safe">Schema matches the frontend’s expectations.</p>}
    </div>
  );
}

function Row({ k, v, icon: Icon }: { k: string; v: React.ReactNode; icon?: typeof Server }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1 text-faint">
        {Icon && <Icon className="h-3 w-3" aria-hidden />}
        {k}
      </dt>
      <dd className="min-w-0 text-right text-ink">{v}</dd>
    </div>
  );
}
