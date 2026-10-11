import { ArrowRight, Equal, GitCompareArrows } from 'lucide-react';
import { DecisionBadge, RiskBadge, CheckStatusBadge, Badge } from '@/components/ui/Badge';
import { compareEvaluations } from '@/lib/compare';
import { cn } from '@/lib/cn';
import type { EvaluationRecord } from '@/types';

export function WhatChanged({ original, modified }: { original: EvaluationRecord; modified: EvaluationRecord }) {
  const c = compareEvaluations(original, modified);
  return (
    <div className="space-y-4" aria-label="What changed">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <GitCompareArrows className="h-4 w-4 text-accent-soft" aria-hidden />
        Comparing <span className="font-mono text-ink">{original.id}</span> (original) with <span className="font-mono text-ink">{modified.id}</span> (modified). Both are separate recorded evaluations.
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Outcome title="Final decision" changed={c.decision.changed}>
          <DecisionBadge decision={c.decision.before} />
          <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />
          <DecisionBadge decision={c.decision.after} />
        </Outcome>
        <Outcome title="Execution permission" changed={c.execution.changed}>
          <Badge tone={c.execution.before ? 'safe' : 'danger'}>{c.execution.before ? 'allowed' : 'denied'}</Badge>
          <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />
          <Badge tone={c.execution.after ? 'safe' : 'danger'}>{c.execution.after ? 'allowed' : 'denied'}</Badge>
        </Outcome>
        <Outcome title="Risk level" changed={c.risk.changed}>
          <RiskBadge risk={c.risk.before} />
          <ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />
          <RiskBadge risk={c.risk.after} />
        </Outcome>
      </div>

      {c.outcomeUnchanged && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-raised/60 px-3 py-2 text-sm text-muted">
          <Equal className="h-4 w-4 text-faint" aria-hidden />
          {c.inputChanges.length ? 'The inputs changed, but TrustLayer’s evaluation did not: same decision, checks and flags.' : 'Nothing changed: the two runs had identical inputs and identical results.'}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <p className="label mb-1.5">Changed input fields ({c.inputChanges.length})</p>
          {c.inputChanges.length ? (
            <ul className="space-y-1.5">
              {c.inputChanges.map((f) => (
                <li key={f.field} className="rounded-lg border border-line bg-raised/50 px-2.5 py-1.5 text-xs">
                  <p className="font-mono text-2xs text-accent-soft">{f.field}</p>
                  <p className="mt-0.5 break-words">
                    <span className="text-danger line-through decoration-danger/50">{truncate(f.before)}</span>
                    <span className="mx-1 text-faint">→</span>
                    <span className="text-ink">{truncate(f.after)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-faint">No input fields differ.</p>
          )}
        </section>

        <div className="space-y-4">
          <section>
            <p className="label mb-1.5">Changed policy outcomes ({c.checkChanges.length})</p>
            {c.checkChanges.length ? (
              <ul className="space-y-1.5">
                {c.checkChanges.map((ch) => (
                  <li key={ch.name} className="rounded-lg border border-line bg-raised/50 px-2.5 py-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{ch.name}</span>
                      <span className="ml-auto inline-flex items-center gap-1">
                        {ch.before ? <CheckStatusBadge status={ch.before} /> : <Badge>absent</Badge>}
                        <ArrowRight className="h-3 w-3 text-faint" aria-hidden />
                        {ch.after ? <CheckStatusBadge status={ch.after} /> : <Badge>absent</Badge>}
                      </span>
                    </div>
                    {ch.afterReason && <p className="mt-0.5 text-muted">{ch.afterReason}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-faint">Every check has the same status in both runs.</p>
            )}
          </section>

          <section>
            <p className="label mb-1.5">Newly flagged evidence ({c.newFlags.length})</p>
            {c.newFlags.length ? (
              <ul className="space-y-1">
                {c.newFlags.map((f, i) => (
                  <li key={i} className="rounded-md border border-warn/30 bg-warn/[0.05] px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-warn">{f.description}</span>
                    {f.matched_text && <span className="mt-0.5 block font-mono text-2xs text-muted">“{f.matched_text}”</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-faint">No new evidence flags.</p>
            )}
            {c.resolvedFlags.length > 0 && <p className="mt-1 text-2xs text-faint">{c.resolvedFlags.length} flag(s) from the original run are no longer raised.</p>}
          </section>

          {c.ai.changed && (
            <p className="text-xs text-muted">
              AI status: <span className="font-mono">{c.ai.before ?? 'null'}</span> → <span className="font-mono">{c.ai.after ?? 'null'}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Outcome({ title, changed, children }: { title: string; changed: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border p-2.5', changed ? 'border-accent/40 bg-accent/[0.05]' : 'border-line bg-raised/40')}>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="label">{title}</p>
        <span className={cn('text-2xs font-medium', changed ? 'text-accent-soft' : 'text-faint')}>{changed ? 'Changed' : 'Unchanged'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function truncate(s: string, n = 160): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
