import { Sparkles, AlertOctagon, CircleSlash, HelpCircle, CheckCircle2 } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { JsonView } from '@/components/ui/JsonView';
import { classifyAiStatus, summarizeAiAnalysis } from '@/services/liveContract';
import { useConnection } from '@/context/ConnectionContext';
import type { AiOutcome, EvaluationRecord } from '@/types';

export const AI_OUTCOME: Record<AiOutcome, { label: string; tone: Tone; icon: typeof Sparkles; body: string }> = {
  completed: { label: 'AI analysis completed', tone: 'safe', icon: CheckCircle2, body: 'The backend reports that the AI advisory analysis finished for this evaluation.' },
  failed: { label: 'AI request failed', tone: 'danger', icon: AlertOctagon, body: 'AI analysis was attempted but failed. The decision was made by deterministic checks only.' },
  unavailable: { label: 'AI unavailable', tone: 'neutral', icon: CircleSlash, body: 'The backend did not run AI analysis because AI is not available or not configured.' },
  not_requested: { label: 'AI not requested', tone: 'neutral', icon: CircleSlash, body: 'This evaluation did not use AI analysis.' },
  none: { label: 'No AI information', tone: 'neutral', icon: HelpCircle, body: 'The response carries no AI status or analysis.' },
  unknown: { label: 'AI status not recognised', tone: 'warn', icon: HelpCircle, body: 'The backend sent an AI status this frontend does not recognise. It is shown verbatim below and is not treated as a completed analysis.' },
};

export function aiOutcomeOf(record: EvaluationRecord): AiOutcome {
  return classifyAiStatus(record.response.ai_status, record.response.ai_analysis, record.response.ai_error);
}

export function AiAnalysisView({ record, compact }: { record: EvaluationRecord; compact?: boolean }) {
  const { ai } = useConnection();
  const { response } = record;
  if (record.source === 'mock') {
    return (
      <div className="rounded-lg border border-violet/25 bg-violet/[0.05] p-3 text-xs text-muted">
        <p className="flex items-center gap-1.5 font-medium text-ink">
          <Sparkles className="h-3.5 w-3.5 text-violet" aria-hidden /> Demo Mode — no AI model was called
        </p>
        <p className="mt-1">Evidence was checked with deterministic patterns only. Switch to Live Backend Mode to request Luminal analysis from the backend.</p>
      </div>
    );
  }
  const outcome = aiOutcomeOf(record);
  const meta = AI_OUTCOME[outcome];
  // Only present analysis content as findings when the backend says it completed.
  const view = outcome === 'completed' ? summarizeAiAnalysis(response.ai_analysis) : null;
  const provider = view?.provider ?? ai?.provider;
  const model = view?.model ?? ai?.model;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone} icon={<meta.icon className="h-3 w-3" aria-hidden />}>
          {meta.label}
        </Badge>
        <span className="font-mono text-2xs text-faint">ai_status: {response.ai_status === null || response.ai_status === undefined ? 'null' : JSON.stringify(response.ai_status)}</span>
        {record.request.use_ai !== undefined && <span className="font-mono text-2xs text-faint">use_ai: {String(record.request.use_ai)}</span>}
      </div>
      <p className="text-xs text-muted">{meta.body}</p>
      {!compact && (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-line bg-raised/60 px-3 py-2">
            <dt className="label">Provider</dt>
            <dd className="mt-0.5 text-ink">{provider ?? '—'}</dd>
          </div>
          <div className="rounded-lg border border-line bg-raised/60 px-3 py-2">
            <dt className="label">Model</dt>
            <dd className="mt-0.5 break-all font-mono text-2xs text-ink">{model ?? '—'}</dd>
          </div>
        </dl>
      )}
      {response.ai_error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/[0.06] p-2.5 text-xs">
          <p className="font-medium text-danger">AI error reported by the backend</p>
          <p className="mt-0.5 break-words font-mono text-2xs text-muted">{response.ai_error}</p>
        </div>
      )}
      {view && (
        <div className="space-y-2 rounded-lg border border-accent/25 bg-accent/[0.04] p-3">
          <p className="label !text-accent-soft">AI-generated findings (advisory, not a policy decision)</p>
          {view.summary && <p className="text-sm text-ink">{view.summary}</p>}
          {view.findings.length > 0 && (
            <ul className="space-y-1.5">
              {view.findings.map((f, i) => (
                <li key={i} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {f.severity && <Badge tone={/high|crit/i.test(f.severity) ? 'danger' : 'warn'}>{f.severity}</Badge>}
                    {f.evidence_id && <span className="font-mono text-2xs text-faint">{f.evidence_id}</span>}
                  </span>
                  <span className="mt-0.5 block text-muted">{f.text}</span>
                  {f.quote && <span className="mt-0.5 block font-mono text-2xs text-faint">“{f.quote}”</span>}
                </li>
              ))}
            </ul>
          )}
          {(view.recommendation || view.risk) && (
            <p className="text-xs text-muted">
              {view.recommendation && (
                <>
                  Model recommendation: <span className="font-medium text-ink">{view.recommendation}</span>{' '}
                </>
              )}
              {view.risk && (
                <>
                  · Model risk: <span className="font-medium text-ink">{view.risk}</span>
                </>
              )}
            </p>
          )}
          {Object.keys(view.other).length > 0 && !compact && <JsonView value={view.other} maxHeight="max-h-48" />}
        </div>
      )}
      {outcome !== 'completed' && response.ai_analysis !== null && response.ai_analysis !== undefined && !compact && (
        <div>
          <p className="label mb-1">Raw ai_analysis (not presented as a completed analysis)</p>
          <JsonView value={response.ai_analysis} maxHeight="max-h-48" />
        </div>
      )}
    </div>
  );
}
