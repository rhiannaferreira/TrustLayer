import { Check, X, AlertTriangle, Loader2, Minus, Radio, FlaskConical } from 'lucide-react';
import { PIPELINE_STAGES, groupChecksByStage, type StageState } from '@/lib/pipeline';
import { cn } from '@/lib/cn';
import type { DataSource, EvaluationCheck, StageId } from '@/types';
import type { PipelinePhase } from '@/hooks/usePipelineRun';

const STATE_LABEL: Record<StageState, string> = {
  idle: 'Idle',
  processing: 'Processing',
  passed: 'Passed',
  failed: 'Failed',
  warning: 'Warning',
  skipped: 'No checks',
};

const NODE: Record<StageState, string> = {
  idle: 'border-line-strong bg-raised text-faint',
  processing: 'border-accent bg-accent/15 text-accent-soft animate-pulse-ring',
  passed: 'border-safe/60 bg-safe/15 text-safe',
  failed: 'border-danger/60 bg-danger/15 text-danger',
  warning: 'border-warn/60 bg-warn/15 text-warn',
  skipped: 'border-line bg-raised text-faint',
};

const CHIP: Record<StageState, string> = {
  idle: 'text-faint',
  processing: 'text-accent-soft',
  passed: 'text-safe',
  failed: 'text-danger',
  warning: 'text-warn',
  skipped: 'text-faint',
};

function NodeIcon({ state, index }: { state: StageState; index: number }) {
  const cls = 'h-3.5 w-3.5';
  if (state === 'processing') return <Loader2 className={cn(cls, 'animate-spin')} aria-hidden />;
  if (state === 'passed') return <Check className={cls} strokeWidth={3} aria-hidden />;
  if (state === 'failed') return <X className={cls} strokeWidth={3} aria-hidden />;
  if (state === 'warning') return <AlertTriangle className={cls} aria-hidden />;
  if (state === 'skipped') return <Minus className={cls} aria-hidden />;
  return <span className="font-mono text-[11px]">{index + 1}</span>;
}

interface PipelineViewProps {
  states: Record<StageId, StageState>;
  checks: EvaluationCheck[];
  revealed: number;
  phase: PipelinePhase;
  source: DataSource;
}

export function PipelineView({ states, checks, revealed, phase, source }: PipelineViewProps) {
  const groups = groupChecksByStage(checks);
  return (
    <div>
      <div
        className={cn(
          'mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          source === 'mock' ? 'border-violet/25 bg-violet/[0.06] text-muted' : 'border-accent/25 bg-accent/[0.06] text-muted',
        )}
      >
        {source === 'mock' ? <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet" aria-hidden /> : <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />}
        <span>
          {source === 'mock' ? (
            <>
              <strong className="font-medium text-ink">Demo visualization.</strong> Results come from deterministic local rules in your browser; the stage-by-stage timing is animated, not backend execution.
            </>
          ) : (
            <>
              <strong className="font-medium text-ink">Backend evaluation.</strong> {phase === 'awaiting' ? 'Waiting for the TrustLayer API to respond…' : 'Showing the checks returned by the TrustLayer API.'}
            </>
          )}
        </span>
      </div>

      <ol className="relative" aria-label="Evaluation pipeline">
        {PIPELINE_STAGES.map((stage, i) => {
          const state = states[stage.id];
          const stageChecks = i < revealed ? groups[stage.id] : [];
          const last = i === PIPELINE_STAGES.length - 1;
          return (
            <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0" aria-current={state === 'processing' ? 'step' : undefined}>
              {!last && (
                <span
                  className={cn(
                    'absolute left-[13px] top-7 bottom-0 w-px transition-colors duration-500',
                    i < revealed - 1 || (i < revealed && state !== 'idle') ? 'bg-gradient-to-b from-accent/60 to-violet/40' : 'bg-line',
                  )}
                  aria-hidden
                />
              )}
              <span className={cn('relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all duration-300', NODE[state])}>
                <NodeIcon state={state} index={i} />
              </span>
              <div
                className={cn(
                  'min-w-0 flex-1 rounded-lg border px-3 py-2 transition-colors duration-300',
                  state === 'processing' ? 'border-accent/40 bg-accent/[0.05]' : state === 'idle' ? 'border-transparent' : 'border-line bg-raised/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('text-sm font-medium', state === 'idle' ? 'text-muted' : 'text-ink')}>{stage.title}</p>
                  <span className={cn('font-mono text-2xs uppercase tracking-wide', CHIP[state])}>{STATE_LABEL[state]}</span>
                </div>
                <p className="mt-0.5 text-xs text-faint">{stage.description}</p>
                {stageChecks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {stageChecks.map((c, j) => (
                      <li key={j} className="flex animate-fade-in gap-2 text-xs">
                        <span className={cn('mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full', c.status === 'PASS' ? 'bg-safe' : c.status === 'WARN' ? 'bg-warn' : 'bg-danger')} aria-hidden />
                        <span className="text-muted">
                          <span className="text-ink">{c.name}:</span> {c.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
