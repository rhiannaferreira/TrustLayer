import { Bot, Play, Square, FileText, Store, Tag, Package } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PLAYGROUND_PRESETS } from '@/data/scenarios';
import { actionLabel } from '@/data/agents';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AgentProposal } from '@/services/agentPlanner';

interface AgentPanelProps {
  goal: string;
  onGoalChange: (goal: string) => void;
  onRun: () => void;
  onStop: () => void;
  running: boolean;
  activity: string[];
  proposal: AgentProposal | null;
}

export function AgentPanel({ goal, onGoalChange, onRun, onStop, running, activity, proposal }: AgentPanelProps) {
  const params = proposal?.request.action.parameters;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent-soft">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-ink">PurchasePilot</p>
          <p className="text-xs text-faint">Autonomous purchasing agent · tools: search, compare, place_order</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!running && goal.trim()) onRun();
        }}
        className="space-y-2"
      >
        <label htmlFor="agent-goal" className="text-xs font-medium text-muted">
          Task for the agent
        </label>
        <textarea
          id="agent-goal"
          className="input min-h-[76px] resize-y"
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder="Find the best wireless headphones for under $80."
          disabled={running}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !running && goal.trim()) onRun();
          }}
        />
        <div className="flex flex-wrap gap-1.5" aria-label="Example goals">
          {PLAYGROUND_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={running}
              onClick={() => onGoalChange(p.goal)}
              title={p.hint}
              className={cn(
                'rounded-full border px-2.5 py-1 text-2xs transition-colors disabled:opacity-50',
                goal === p.goal ? 'border-accent/50 bg-accent/10 text-accent-soft' : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          {running ? (
            <Button type="button" variant="secondary" onClick={onStop} icon={<Square className="h-3.5 w-3.5" />}>
              Stop
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!goal.trim()} icon={<Play className="h-4 w-4" />}>
              Run agent
            </Button>
          )}
          <span className="hidden text-2xs text-faint sm:inline">
            <span className="kbd">⌘</span> <span className="kbd">Enter</span>
          </span>
        </div>
      </form>

      <div>
        <p className="label mb-2">Agent activity</p>
        <div className="min-h-[120px] rounded-lg border border-line bg-canvas/60 p-3 font-mono text-[11.5px]" aria-live="polite">
          {activity.length === 0 ? (
            <p className="text-faint">Waiting for a task…</p>
          ) : (
            <ol className="space-y-1.5">
              {activity.map((line, i) => (
                <li key={i} className="flex animate-fade-in gap-2 text-muted">
                  <span className="select-none text-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className={i === activity.length - 1 && running ? 'text-ink' : undefined}>{line}</span>
                </li>
              ))}
              {running && <li className="ml-6 inline-block h-3 w-1.5 animate-pulse bg-accent" aria-hidden />}
            </ol>
          )}
        </div>
        <p className="mt-1.5 text-2xs text-faint">Demo agent: deterministic rule-based planner, not an LLM.</p>
      </div>

      {proposal && params && (
        <div className="animate-fade-in rounded-lg border border-accent/25 bg-accent/[0.04] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="label !text-accent-soft">Proposed action</p>
            <Badge tone="accent">{actionLabel(proposal.request.action.type)}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Item icon={Package} label="Product" value={(params.product_name as string) ?? '—'} wide />
            <Item icon={Tag} label="Price" value={params.price !== undefined ? formatCurrency(params.price) : '—'} />
            <Item icon={Store} label="Vendor" value={(params.vendor as string) ?? '—'} />
          </dl>
          <p className="mt-3 text-xs text-muted">
            <span className="text-faint">Reasoning: </span>
            {proposal.reasoning}
          </p>
          <div className="mt-3">
            <p className="label mb-1">Evidence references</p>
            <ul className="flex flex-wrap gap-1.5">
              {proposal.request.evidence.map((e) => (
                <li key={e.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-2xs text-muted">
                  <FileText className="h-3 w-3" aria-hidden /> {e.id}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ icon: Icon, label, value, wide }: { icon: typeof Tag; label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="flex items-center gap-1 text-2xs text-faint">
        <Icon className="h-3 w-3" aria-hidden /> {label}
      </dt>
      <dd className="truncate font-medium text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}
