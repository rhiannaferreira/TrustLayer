import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, Play, Bot } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useAppStore } from '@/context/AppStore';
import { createHttpClient, type TrustDecision, type TrustScenario } from '@/services/api';

const VERDICT = {
  ALLOW: { tone: 'safe', label: 'ALLOW', icon: ShieldCheck, text: 'Authorized. The agent may proceed.' },
  REVIEW: { tone: 'warn', label: 'REVIEW', icon: ShieldAlert, text: 'Held for a human to approve.' },
  BLOCK: { tone: 'danger', label: 'BLOCK', icon: ShieldX, text: 'Refused. The action will not run.' },
} as const;
const STATUS_TONE = { PASS: 'safe', WARN: 'warn', FAIL: 'danger' } as const;
const DOMAIN_LABEL: Record<string, string> = {
  finance: 'Finance', data: 'Data access', database: 'Database', healthcare: 'Healthcare', workplace: 'Workplace', commerce: 'Purchasing', any: 'Any agent',
};

export function TrustGatePage() {
  const { dataSource, settings } = useAppStore();
  const live = dataSource === 'api';
  const client = useMemo(() => createHttpClient(settings.apiBaseUrl), [settings.apiBaseUrl]);
  const [scenarios, setScenarios] = useState<TrustScenario[]>([]);
  const [selected, setSelected] = useState<TrustScenario | null>(null);
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [decision, setDecision] = useState<TrustDecision | null>(null);
  const [useAi, setUseAi] = useState(false);

  useEffect(() => {
    if (!live) return;
    client.trustScenarios().then((list) => {
      setScenarios(list);
      if (list[0]) pick(list[0]);
    }).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, client]);

  function pick(s: TrustScenario) {
    setSelected(s);
    setJson(JSON.stringify(s.request, null, 2));
    setDecision(null);
    setError(null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const req = JSON.parse(json);
      setDecision(await client.trustEvaluate({ ...req, use_ai: useAi }));
    } catch (err) {
      setDecision(null);
      setError(err instanceof SyntaxError ? new Error('The proposed action is not valid JSON') : err);
    } finally {
      setBusy(false);
    }
  }

  const verdict = decision ? VERDICT[decision.decision] : null;
  const byDomain = scenarios.reduce<Record<string, TrustScenario[]>>((acc, s) => ((acc[s.domain] ??= []).push(s), acc), {});

  return (
    <div>
      <PageHeader
        eyebrow={<Badge tone="accent">AI agents can propose actions. TrustLayer decides.</Badge>}
        title="Trust Gate"
        description="An independent authorization layer between any AI agent and the real world. The agent proposes an action with evidence; TrustLayer checks permissions, verifies the evidence, applies policy and ethics, scores the risk, and returns ALLOW, REVIEW or BLOCK with a full audit trail."
      />
      {!live ? (
        <EmptyState icon={<Bot className="h-4 w-4" />} title="Switch to Live Backend Mode" description="The Trust Gate runs on the backend. Turn on Live Backend Mode in settings." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
            <Panel title="1. Pick what the agent wants to do" subtitle="Finance, data, databases, healthcare, workplace, purchasing">
              <div className="space-y-3">
                {Object.entries(byDomain).map(([domain, list]) => (
                  <div key={domain}>
                    <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">{DOMAIN_LABEL[domain] ?? domain}</p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pick(s)}
                          className={`rounded-lg border px-3 py-1.5 text-left text-xs ${selected?.id === s.id ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}
                        >
                          {s.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="2. The agent's proposal" subtitle="Edit it freely: change the amount, the SQL, the evidence">
              <textarea className="input h-80 w-full font-mono text-xs" spellCheck={false} aria-label="Proposed action" value={json} onChange={(e) => setJson(e.target.value)} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Add an AI critique (advisory only)
                </label>
                <Button variant="primary" icon={<Play className="h-4 w-4" />} loading={busy} onClick={run}>Ask TrustLayer</Button>
              </div>
            </Panel>
          </div>
          <div className="space-y-4">
            {error != null && <ErrorBanner error={error} />}
            {!decision ? (
              <EmptyState icon={<ShieldCheck className="h-4 w-4" />} title="No decision yet" description="Pick a scenario and press Ask TrustLayer." />
            ) : (
              verdict && (
                <>
                  <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Badge tone={verdict.tone} className="px-3 py-1.5 text-sm" icon={<verdict.icon className="h-4 w-4" aria-hidden />}>{verdict.label}</Badge>
                        <div>
                          <p className="text-sm font-semibold text-ink">{verdict.text}</p>
                          <p className="text-xs text-muted">{decision.reason}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xs uppercase text-faint">Risk</p>
                        <p className="text-lg font-semibold text-ink">{decision.risk_score}<span className="text-xs text-faint">/100 · {decision.risk_level}</span></p>
                      </div>
                    </div>
                    <p className="mt-3 text-2xs text-faint">{decision.agent_name ?? 'Unknown agent'} · {decision.action} · recorded in the audit trail as {decision.evaluation_id}</p>
                  </Panel>
                  {decision.stages.map((stage, i) => (
                    <Panel key={stage.name} title={`${i + 1}. ${stage.name}`} actions={<Badge tone={STATUS_TONE[stage.status]}>{stage.status}</Badge>}>
                      <ul className="space-y-2">
                        {stage.checks.map((c) => (
                          <li key={c.name} className="flex items-start gap-2 text-xs">
                            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                            <span><span className="font-medium text-ink">{c.name}.</span> <span className="text-muted">{c.reason}</span></span>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  ))}
                  {decision.ai_analysis && (
                    <Panel title="AI critique" subtitle="Advisory only. It cannot grant permission.">
                      <p className="whitespace-pre-wrap text-xs text-muted">{decision.ai_analysis}</p>
                    </Panel>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
