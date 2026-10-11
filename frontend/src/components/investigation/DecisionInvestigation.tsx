import { useEffect, useMemo, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, RotateCcw, History, Radio, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InvestigationGraph } from './InvestigationGraph';
import { NodeDetail } from './NodeDetail';
import { buildInvestigation, STATUS_LABEL, type NodeId } from '@/lib/investigation';
import { useAppStore } from '@/context/AppStore';
import { cn } from '@/lib/cn';
import type { EvaluationRecord } from '@/types';

/** Visual pacing for replay only. It is not, and is never labelled as, processing time. */
const REPLAY_STEP_MS = 900;

export function DecisionInvestigation({ record, initialReplay = false }: { record: EvaluationRecord; initialReplay?: boolean }) {
  const { policySet, live } = useAppStore();
  const livePolicy = useMemo(() => {
    const id = record.request.policy_id;
    const found = live.policies?.find((p) => p.id === id) ?? (live.policies?.length === 1 ? live.policies[0] : undefined);
    return found?.raw ?? null;
  }, [live.policies, record.request.policy_id]);
  const model = useMemo(() => buildInvestigation(record, { demoPolicies: policySet.policies, livePolicy }), [record, policySet.policies, livePolicy]);
  const total = model.nodes.length;

  const [replaying, setReplaying] = useState(initialReplay);
  const [revealed, setRevealed] = useState(initialReplay ? 1 : total);
  const [playing, setPlaying] = useState(initialReplay);
  const [selected, setSelected] = useState<NodeId>(initialReplay ? 'proposal' : (model.nodes.find((n) => n.status === 'fail') ?? model.nodes.find((n) => n.status === 'warn') ?? model.nodes[0]).id);

  // Reset when switching to another evaluation.
  useEffect(() => {
    setReplaying(initialReplay);
    setRevealed(initialReplay ? 1 : total);
    setPlaying(initialReplay);
    setSelected(initialReplay ? 'proposal' : (model.nodes.find((n) => n.status === 'fail') ?? model.nodes.find((n) => n.status === 'warn') ?? model.nodes[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);

  useEffect(() => {
    if (!playing) return;
    if (revealed >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      setRevealed((r) => Math.min(total, r + 1));
      setSelected(model.nodes[Math.min(total - 1, revealed)].id);
    }, REPLAY_STEP_MS);
    return () => clearTimeout(t);
  }, [playing, revealed, total, model.nodes]);

  const startReplay = () => {
    setReplaying(true);
    setRevealed(1);
    setSelected('proposal');
    setPlaying(true);
  };
  const step = (delta: number) => {
    setPlaying(false);
    setReplaying(true);
    setRevealed((r) => {
      const next = Math.max(1, Math.min(total, r + delta));
      setSelected(model.nodes[next - 1].id);
      return next;
    });
  };
  const showAll = () => {
    setPlaying(false);
    setReplaying(false);
    setRevealed(total);
  };

  const selectedIndex = model.nodes.findIndex((n) => n.id === selected);
  const selectedNode = model.nodes[selectedIndex] ?? model.nodes[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {record.source === 'api' ? (
            <Badge tone="accent" icon={<Radio className="h-3 w-3" aria-hidden />}>
              Recorded backend evaluation
            </Badge>
          ) : (
            <Badge tone="violet" icon={<FlaskConical className="h-3 w-3" aria-hidden />}>
              Simulated demo evaluation
            </Badge>
          )}
          {replaying && (
            <Badge tone="warn" icon={<History className="h-3 w-3" aria-hidden />}>
              Replay · step {revealed}/{total} · not live processing
            </Badge>
          )}
          {model.unclassifiedCount > 0 && <Badge>{model.unclassifiedCount} unmapped check(s) in Final Decision</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Replay controls">
          {!replaying ? (
            <Button size="sm" variant="secondary" icon={<History className="h-3.5 w-3.5" />} onClick={startReplay}>
              Replay evaluation
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" icon={<SkipBack className="h-3.5 w-3.5" />} onClick={() => step(-1)} disabled={revealed <= 1} aria-label="Previous step">
                Back
              </Button>
              {playing ? (
                <Button size="sm" variant="secondary" icon={<Pause className="h-3.5 w-3.5" />} onClick={() => setPlaying(false)}>
                  Pause
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<Play className="h-3.5 w-3.5" />} onClick={() => (revealed >= total ? startReplay() : setPlaying(true))}>
                  {revealed >= total ? 'Replay again' : 'Play'}
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<SkipForward className="h-3.5 w-3.5" />} onClick={() => step(1)} disabled={revealed >= total} aria-label="Next step">
                Next step
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={showAll}>
                Show all
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <InvestigationGraph nodes={model.nodes} revealed={revealed} selected={selected} onSelect={setSelected} />
          <ol className="flex flex-wrap gap-1.5" aria-label="Pipeline stages">
            {model.nodes.map((n, i) => {
              const hidden = i >= revealed;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => setSelected(n.id)}
                    aria-current={selected === n.id ? 'step' : undefined}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs transition-colors',
                      selected === n.id ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line text-muted hover:border-line-strong',
                      hidden && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        hidden ? 'bg-line-strong' : n.status === 'pass' ? 'bg-safe' : n.status === 'fail' ? 'bg-danger' : n.status === 'warn' ? 'bg-warn' : n.status === 'info' ? 'bg-accent' : 'bg-faint',
                      )}
                      aria-hidden
                    />
                    {n.title}
                    <span className="sr-only">: {hidden ? 'not yet replayed' : STATUS_LABEL[n.status]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {replaying && <p className="text-2xs text-faint">Replay walks through the checks stored with this evaluation. The animation pace is for presentation only; the backend did not report per-stage timings.</p>}
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
          <NodeDetail node={selectedNode} record={record} hidden={selectedIndex >= revealed} />
        </div>
      </div>
    </div>
  );
}
