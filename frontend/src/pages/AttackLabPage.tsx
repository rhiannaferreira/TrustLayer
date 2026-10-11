import { useMemo, useRef, useState } from 'react';
import { Swords, Crosshair, Workflow, Target } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { ScenarioPicker } from '@/components/attack-lab/ScenarioPicker';
import { AttackForm } from '@/components/attack-lab/AttackForm';
import { AttackResult } from '@/components/attack-lab/AttackResult';
import { PipelineView } from '@/components/evaluation/PipelineView';
import { useAppStore, useRecord } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { usePipelineRun } from '@/hooks/usePipelineRun';
import { ATTACK_SCENARIOS, getScenario, type AttackForm as AttackFormValues, type ScenarioId } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { DECISION_LABEL } from '@/lib/format';

type Forms = Record<ScenarioId, AttackFormValues>;

function initialForms(): Forms {
  return Object.fromEntries(ATTACK_SCENARIOS.map((s) => [s.id, structuredClone(s.form)])) as Forms;
}

export function AttackLabPage() {
  const { runEvaluation, dataSource } = useAppStore();
  const { notify } = useToast();
  const pipeline = usePipelineRun();

  const [scenarioId, setScenarioId] = useState<ScenarioId>('budget');
  const [forms, setForms] = useState<Forms>(initialForms);
  const [results, setResults] = useState<Partial<Record<ScenarioId, string[]>>>({});
  const [lastRunForm, setLastRunForm] = useState<Partial<Record<ScenarioId, string>>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const token = useRef(0);

  const scenario = getScenario(scenarioId);
  const form = forms[scenarioId];
  const history = results[scenarioId] ?? [];
  const record = useRecord(history[0]);
  const previous = useRecord(history[1]);
  const pendingRecord = useRecord(pendingId);
  const dirty = useMemo(() => lastRunForm[scenarioId] !== undefined && lastRunForm[scenarioId] !== JSON.stringify(form), [lastRunForm, scenarioId, form]);

  const selectScenario = (id: ScenarioId) => {
    token.current++;
    setScenarioId(id);
    setError(null);
    setRunning(false);
    setPendingId(null);
    const latest = results[id]?.[0];
    if (latest) pipelineShow(latest);
    else pipeline.reset();
  };

  const { getRecord } = useAppStore();
  const pipelineShow = (id: string) => {
    const r = getRecord(id);
    if (r) pipeline.showInstant(r);
    else pipeline.reset();
  };

  const run = async () => {
    const my = ++token.current;
    setRunning(true);
    setError(null);
    const snapshot = JSON.stringify(form);
    try {
      const pending = runEvaluation({ request: formToRequest(form), origin: 'attack-lab', scenario: scenario.title });
      pending.then((r) => my === token.current && setPendingId(r.id)).catch(() => undefined);
      const r = await pipeline.run(pending, dataSource);
      if (my !== token.current || !r) return;
      setResults((prev) => ({ ...prev, [scenarioId]: [r.id, ...(prev[scenarioId] ?? [])].slice(0, 10) }));
      setLastRunForm((prev) => ({ ...prev, [scenarioId]: snapshot }));
      setPendingId(null);
      notify({
        tone: r.response.decision === 'ALLOW' ? 'success' : r.response.decision === 'BLOCK' ? 'danger' : 'warning',
        title: `${scenario.title}: ${DECISION_LABEL[r.response.decision]}`,
        description: r.response.reason,
      });
    } catch (err) {
      if (my !== token.current) return;
      setError(err);
      notify({ tone: 'danger', title: 'Attack run failed', description: errorMessage(err).detail });
    } finally {
      if (my === token.current) setRunning(false);
    }
  };

  const reset = () => {
    token.current++;
    setForms((f) => ({ ...f, [scenarioId]: structuredClone(scenario.form) }));
    setResults((r) => ({ ...r, [scenarioId]: [] }));
    setLastRunForm((l) => ({ ...l, [scenarioId]: undefined }));
    setPendingId(null);
    setError(null);
    setRunning(false);
    pipeline.reset();
  };

  const showPipeline = running || pipeline.phase === 'animating' || pipeline.phase === 'awaiting';
  const pipelineChecks = (running ? pendingRecord : record)?.response.checks ?? [];

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <Badge tone="violet">Attack Lab</Badge>
            <Badge>Adversarial testing</Badge>
          </div>
        }
        title="Try to trick the agent"
        description="Pick a scenario, edit the price, vendor, action, evidence or permissions, and see how TrustLayer’s decision changes. Every run is a real evaluation recorded in the audit trail."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel title="Attack configuration" subtitle={scenario.category} icon={<Crosshair className="h-3.5 w-3.5 text-violet" />}>
          <div className="space-y-4">
            <ScenarioPicker value={scenarioId} onChange={selectScenario} disabled={running} />
            <div className="rounded-lg border border-violet/20 bg-violet/[0.05] px-3 py-2 text-xs">
              <p className="text-muted">
                <span className="font-medium text-ink">Expected:</span> {scenario.expected}
              </p>
            </div>
            <AttackForm value={form} onChange={(v) => setForms((f) => ({ ...f, [scenarioId]: v }))} onRun={() => void run()} onReset={reset} running={running} dirty={dirty} />
            {dataSource === 'mock' && (
              <p className="text-2xs text-faint">
                Mock mode uses simple deterministic rules (budget limit, vendor allowlist, tool permissions, known suspicious phrases). They demonstrate the flow; they are not comprehensive attack detection.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="TrustLayer response" subtitle="Side-by-side proposal and evaluation" icon={<Target className="h-3.5 w-3.5 text-accent-soft" />}>
          {error !== null && (
            <div className="mb-4">
              <ErrorBanner error={error} />
            </div>
          )}
          {showPipeline ? (
            <div>
              <p className="label mb-3 flex items-center gap-1.5">
                <Workflow className="h-3.5 w-3.5" aria-hidden /> Evaluating
              </p>
              <PipelineView states={pipeline.states} checks={pipelineChecks} revealed={pipeline.revealed} phase={pipeline.phase} source={dataSource} />
            </div>
          ) : record ? (
            <AttackResult record={record} previous={previous} />
          ) : (
            <EmptyState
              icon={<Swords className="h-4 w-4" />}
              title="No attack run yet"
              description="Configure the scenario on the left and press Run attack. Then change an input and run again to compare."
              className="min-h-[360px]"
            />
          )}
        </Panel>
      </div>
    </>
  );
}
