import { useEffect, useMemo, useRef, useState } from 'react';
import { Swords, Crosshair, Workflow, Play, RotateCcw, GitCompareArrows, Sparkles, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { ScenarioPicker } from '@/components/attack-lab/ScenarioPicker';
import { AttackForm } from '@/components/attack-lab/AttackForm';
import { SideBySide } from '@/components/attack-lab/SideBySide';
import { WhatChanged } from '@/components/attack-lab/WhatChanged';
import { PipelineView } from '@/components/evaluation/PipelineView';
import { useAppStore, useRecord } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { usePipelineRun } from '@/hooks/usePipelineRun';
import { ATTACK_SCENARIOS, getScenario, type AttackForm as AttackFormValues, type ScenarioId } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { DECISION_LABEL } from '@/lib/format';

type Forms = Record<ScenarioId, AttackFormValues>;
type RunKind = 'original' | 'modified';
type Runs = Partial<Record<ScenarioId, Partial<Record<RunKind, string>>>>;

function initialForms(): Forms {
  return Object.fromEntries(ATTACK_SCENARIOS.map((s) => [s.id, structuredClone(s.form)])) as Forms;
}

export function AttackLabPage() {
  const { runEvaluation, dataSource, settings, live, loadCatalog } = useAppStore();
  const { notify } = useToast();
  const pipeline = usePipelineRun();

  const [scenarioId, setScenarioId] = useState<ScenarioId>('budget');
  const [forms, setForms] = useState<Forms>(initialForms);
  const [runs, setRuns] = useState<Runs>({});
  const [view, setView] = useState<RunKind>('modified');
  const [running, setRunning] = useState<RunKind | 'both' | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [useAi, setUseAi] = useState(settings.useAi);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const token = useRef(0);

  const scenario = getScenario(scenarioId);
  const form = forms[scenarioId];
  const scenarioRuns = runs[scenarioId] ?? {};
  const original = useRecord(scenarioRuns.original);
  const modified = useRecord(scenarioRuns.modified);
  const pendingRecord = useRecord(pendingId);
  const shown = view === 'original' ? original ?? modified : modified ?? original;
  const changedFields = useMemo(() => (Object.keys(form) as Array<keyof AttackFormValues>).filter((k) => JSON.stringify(form[k]) !== JSON.stringify(scenario.form[k])).length, [form, scenario.form]);

  useEffect(() => {
    if (dataSource !== 'api' || live.catalog) return;
    loadCatalog()
      .then(() => setCatalogError(null))
      .catch((err) => setCatalogError(errorMessage(err).detail));
  }, [dataSource, live.catalog, loadCatalog]);

  const selectScenario = (id: ScenarioId) => {
    token.current++;
    setScenarioId(id);
    setError(null);
    setRunning(null);
    setPendingId(null);
    pipeline.reset();
  };

  const runOne = async (kind: RunKind, my: number) => {
    const values = kind === 'original' ? scenario.form : form;
    const pending = runEvaluation({ request: formToRequest(values), origin: 'attack-lab', scenario: `${scenario.title} · ${kind}`, useAi });
    pending.then((r) => my === token.current && setPendingId(r.id)).catch(() => undefined);
    const r = await pipeline.run(pending, dataSource);
    if (my !== token.current || !r) return null;
    setRuns((prev) => ({ ...prev, [scenarioId]: { ...prev[scenarioId], [kind]: r.id } }));
    return r;
  };

  const run = async (which: RunKind | 'both') => {
    const my = ++token.current;
    setRunning(which);
    setError(null);
    try {
      const kinds: RunKind[] = which === 'both' ? ['original', 'modified'] : [which];
      let last = null;
      for (const k of kinds) {
        last = await runOne(k, my);
        if (!last) return;
      }
      setPendingId(null);
      setView(which === 'original' ? 'original' : 'modified');
      if (last) {
        notify({
          tone: last.response.decision === 'ALLOW' ? 'success' : last.response.decision === 'BLOCK' ? 'danger' : 'warning',
          title: `${scenario.title}: ${DECISION_LABEL[last.response.decision]}`,
          description: last.response.reason,
        });
      }
    } catch (err) {
      if (my !== token.current) return;
      setError(err);
      notify({ tone: 'danger', title: 'Evaluation failed', description: errorMessage(err).detail });
    } finally {
      if (my === token.current) setRunning(null);
    }
  };

  const reset = () => {
    token.current++;
    setForms((f) => ({ ...f, [scenarioId]: structuredClone(scenario.form) }));
    setRuns((r) => ({ ...r, [scenarioId]: {} }));
    setPendingId(null);
    setError(null);
    setRunning(null);
    pipeline.reset();
  };

  const busy = running !== null;
  const showPipeline = busy || pipeline.phase === 'animating' || pipeline.phase === 'awaiting';

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <Badge tone="violet">Attack Lab</Badge>
            <Badge>Adversarial experiments</Badge>
            {dataSource === 'mock' ? <Badge tone="violet">Demo Mode · simulated</Badge> : <Badge tone="accent">Live backend evaluations</Badge>}
          </div>
        }
        title="Try to trick the agent"
        description="Run a scenario as-is, then manipulate the amount, product, vendor, review text or tool call and run it again. Each run is a separate recorded evaluation, and TrustLayer shows exactly what changed."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Panel title="Experiment controls" subtitle={scenario.category} icon={<Crosshair className="h-3.5 w-3.5 text-violet" />}>
          <div className="space-y-4">
            <ScenarioPicker value={scenarioId} onChange={selectScenario} disabled={busy} />
            <div className="rounded-lg border border-violet/20 bg-violet/[0.05] px-3 py-2 text-xs">
              <p className="text-muted">
                <span className="font-medium text-ink">Original scenario expectation:</span> {scenario.expected}
              </p>
              {dataSource === 'api' && <p className="mt-1 text-faint">Expectation describes the demo rules; the live backend’s actual result is what is shown.</p>}
            </div>
            {catalogError && <p className="text-2xs text-warn">Backend catalog unavailable ({catalogError}); product list below is the local demo catalog.</p>}
            <AttackForm
              value={form}
              original={scenario.form}
              catalog={dataSource === 'api' && live.catalog?.length ? live.catalog : undefined}
              onChange={(v) => setForms((f) => ({ ...f, [scenarioId]: v }))}
              onRun={() => void run('modified')}
              onReset={reset}
              running={busy}
              dirty={changedFields > 0}
              footer={
                <div className="space-y-3 border-t border-line pt-4">
                  {dataSource === 'api' && (
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised/50 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-muted">
                        <Sparkles className="h-3.5 w-3.5 text-accent-soft" aria-hidden /> Request AI analysis (<span className="font-mono">use_ai</span>)
                      </span>
                      <Toggle size="sm" checked={useAi} onChange={setUseAi} label="Request AI analysis" />
                    </label>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" loading={running === 'original'} disabled={busy} onClick={() => void run('original')} icon={<Play className="h-3.5 w-3.5" />}>
                      Run original
                    </Button>
                    <Button type="submit" variant="primary" loading={running === 'modified'} disabled={busy} icon={<Swords className="h-3.5 w-3.5" />}>
                      Run modified
                    </Button>
                    <Button type="button" variant="outline" loading={running === 'both'} disabled={busy} onClick={() => void run('both')} icon={<GitCompareArrows className="h-3.5 w-3.5" />}>
                      Run both &amp; compare
                    </Button>
                    <Button type="button" variant="ghost" onClick={reset} icon={<RotateCcw className="h-3.5 w-3.5" />} disabled={busy}>
                      Reset
                    </Button>
                  </div>
                  <p className="text-2xs text-faint">{changedFields ? `${changedFields} field${changedFields === 1 ? '' : 's'} modified from the original scenario.` : 'Inputs match the original scenario. Edit any field to create a modified experiment.'}</p>
                </div>
              }
            />
          </div>
        </Panel>

        <Panel
          title="Proposal vs. evaluation"
          subtitle={shown ? `Showing the ${shown.id === original?.id ? 'original' : 'modified'} run` : 'Side-by-side'}
          icon={<Workflow className="h-3.5 w-3.5 text-accent-soft" />}
          actions={
            (original || modified) && (
              <>
                <Segmented<RunKind>
                  label="Run shown"
                  value={shown?.id === original?.id ? 'original' : 'modified'}
                  onChange={setView}
                  options={[
                    { value: 'original', label: original ? 'Original' : 'Original (not run)' },
                    { value: 'modified', label: modified ? 'Modified' : 'Modified (not run)' },
                  ]}
                />
                {shown && (
                  <Link to={`/investigate?id=${encodeURIComponent(shown.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-soft hover:underline">
                    <Network className="h-3.5 w-3.5" aria-hidden /> Investigate
                  </Link>
                )}
              </>
            )
          }
        >
          {error !== null && (
            <div className="mb-4">
              <ErrorBanner error={error} />
            </div>
          )}
          {showPipeline ? (
            <div>
              <p className="label mb-3">Evaluating {running === 'both' ? 'original, then modified' : running}…</p>
              <PipelineView states={pipeline.states} checks={pendingRecord?.response.checks ?? []} revealed={pipeline.revealed} phase={pipeline.phase} source={dataSource} />
            </div>
          ) : shown ? (
            <SideBySide record={shown} />
          ) : (
            <EmptyState
              icon={<Swords className="h-4 w-4" />}
              title="No experiment run yet"
              description="Press Run original for the baseline, change an input, then Run modified — or Run both & compare."
              className="min-h-[360px]"
            />
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="What changed?" subtitle="Original vs. modified evaluation" icon={<GitCompareArrows className="h-3.5 w-3.5 text-accent-soft" />}>
        {original && modified ? (
          <WhatChanged original={original} modified={modified} />
        ) : (
          <p className="text-sm text-muted">
            {original || modified ? `Run the ${original ? 'modified' : 'original'} scenario too, and the differences between the two recorded evaluations appear here.` : 'Run both the original and the modified scenario to compare them.'}
          </p>
        )}
      </Panel>
    </>
  );
}
