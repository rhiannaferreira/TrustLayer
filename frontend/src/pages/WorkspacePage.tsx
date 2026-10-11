import { useState } from 'react';
import { Play, Bot, Globe, Database, Ban, Hand, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Stages, VerdictBadge } from '@/components/gate/Verdict';
import { useGateClient } from '@/hooks/useGateClient';
import type { TaskRun, TaskStep } from '@/services/api';

const EXAMPLES = [
  'Find out who currently leads the Python Software Foundation, then count our customers in the database.',
  'Clean up the database: drop the customers table in production.',
  'Pay the $4,800 invoice from Northwind Consulting right now and wire it to their account.',
  'Delete 200 old files from the shared drive, then email the full customer list to partner@other.com.',
  'Buy a standing desk for the new hire, our budget is $300.',
];

function Outcome({ step }: { step: TaskStep }) {
  const d = step.decision.decision;
  const ex = step.execution;
  if (d === 'BLOCK') return <p className="flex items-center gap-1.5 text-xs text-danger"><Ban className="h-3.5 w-3.5" /> Refused. Nothing ran.</p>;
  if (d === 'REVIEW') return <p className="flex items-center gap-1.5 text-xs text-warn"><Hand className="h-3.5 w-3.5" /> Held. Waiting in the Review Queue; nothing ran.</p>;
  return (
    <div className="space-y-1.5 text-xs">
      <p className="flex items-center gap-1.5 text-safe">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ran
        {ex && <Badge tone={ex.mode === 'live' ? 'accent' : 'neutral'}>{ex.mode === 'live' ? 'live' : ex.mode === 'sandbox' ? 'sandbox' : 'simulated'}</Badge>}
      </p>
      {ex?.summary && <p className="whitespace-pre-wrap text-muted">{ex.summary}</p>}
      {ex?.columns && ex.rows && (
        <pre className="overflow-x-auto rounded-lg border border-line bg-raised p-2 text-2xs text-muted">{[ex.columns.join(' | '), ...ex.rows.map((r) => r.join(' | '))].join('\n')}</pre>
      )}
      {ex?.sources?.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-accent-soft hover:underline">{s.title}</a>
      ))}
    </div>
  );
}

export function WorkspacePage() {
  const client = useGateClient();
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [run, setRun] = useState<TaskRun | null>(null);

  async function go(text: string) {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      setRun(await client.runTask(text.trim()));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={<Badge tone="accent">Live: AI planner + trust gate</Badge>}
        title="Agent workspace"
        description="Give the agent any task in plain language. An AI model plans the steps, and every step must pass TrustLayer before it runs. Web research is real; the database runs on a throwaway demo database; email, payments, purchases and deletions are simulated and contact nothing."
      />
      <div className="space-y-4">
        <Panel>
          <form onSubmit={(e) => { e.preventDefault(); void go(task); }} className="space-y-3">
            <textarea className="input h-24 w-full" aria-label="Task" maxLength={2000} placeholder="What should the agent do?" value={task} onChange={(e) => setTask(e.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="max-w-xs truncate rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink" title={ex} onClick={() => setTask(ex)}>{ex}</button>
                ))}
              </div>
              <Button type="submit" variant="primary" icon={<Play className="h-4 w-4" />} loading={busy} disabled={task.trim().length < 3}>Run agent</Button>
            </div>
          </form>
        </Panel>
        {busy && <p className="text-sm text-muted">The agent is planning, and each step is being checked…</p>}
        {error != null && <ErrorBanner error={error} />}
        {run && (
          <>
            <Panel title="Agent plan" subtitle={run.summary} icon={<Bot className="h-4 w-4" />}>
              <p className="text-xs text-faint">{run.steps.length} step(s) proposed. Each decision below is made by TrustLayer, not by the model.</p>
            </Panel>
            {run.steps.map((s) => (
              <Panel
                key={s.index}
                title={`${s.index}. ${s.action}`}
                subtitle={s.reasoning}
                icon={s.action === 'web.research' ? <Globe className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                actions={<VerdictBadge decision={s.decision.decision} large />}
              >
                <div className="space-y-3">
                  <pre className="overflow-x-auto rounded-lg border border-line bg-raised p-2 text-2xs text-muted">{JSON.stringify(s.parameters, null, 2)}</pre>
                  <p className="text-sm text-ink">{s.decision.reason} <span className="text-xs text-faint">Risk {s.decision.risk_score}/100</span></p>
                  <Outcome step={s} />
                  <details>
                    <summary className="cursor-pointer text-xs text-faint">All checks</summary>
                    <div className="mt-2"><Stages stages={s.decision.stages} /></div>
                  </details>
                </div>
              </Panel>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
