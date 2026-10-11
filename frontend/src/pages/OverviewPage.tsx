import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ShieldCheck, ShieldX, ShieldAlert, Bot, Swords, ArrowRight, Wrench, Sparkles, Presentation, Network, Flame, ListX, Inbox } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { RiskChart } from '@/components/dashboard/RiskChart';
import { RecentDecisions } from '@/components/dashboard/RecentDecisions';
import { AgentCards } from '@/components/dashboard/AgentCards';
import { DecisionDrawer } from '@/components/evaluation/DecisionDrawer';
import { LogoMark } from '@/components/ui/Logo';
import { needsReview, describeAction } from '@/lib/records';
import { computeAnalytics } from '@/lib/analytics';
import { EmptyState } from '@/components/ui/EmptyState';
import { DecisionBadge, RiskBadge } from '@/components/ui/Badge';
import { formatTime } from '@/lib/format';

export function OverviewPage() {
  const { records, dataSource } = useAppStore();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const a = computeAnalytics(records);
  const total = a.total;
  const pending = records.filter(needsReview).length;
  const seeded = records.filter((r) => r.seeded).length;
  const share = (n: number) => (total ? n / total : 0);
  const maxFail = a.failedChecks[0]?.count ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Command center</Badge>
            {dataSource === 'mock' ? <Badge tone="violet">Demo Mode · simulated data</Badge> : <Badge tone="accent">Live backend records</Badge>}
          </div>
        }
        title="Your AI agents. Under control."
        description="TrustLayer makes autonomous AI agents observable, auditable, and controllable before their actions affect real systems."
        actions={
          <>
            <Link to="/demo" className="inline-flex h-9 items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3.5 text-sm font-medium text-accent-soft hover:bg-accent/15">
              <Presentation className="h-4 w-4" aria-hidden /> Launch Demo
            </Link>
            <Link to="/attack-lab" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-overlay px-3.5 text-sm font-medium text-ink hover:border-line-strong">
              <Swords className="h-4 w-4" aria-hidden /> Attack Lab
            </Link>
            <Link to="/playground" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent/90">
              <Bot className="h-4 w-4" aria-hidden /> Run an agent
            </Link>
          </>
        }
      />

      <FlowStrip />

      <section aria-label="Key metrics" className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard to="/decisions" label="Total evaluations" value={total} icon={Activity} tone="accent" caption={total ? (seeded ? `Includes ${seeded} labelled seed record${seeded === 1 ? '' : 's'}` : dataSource === 'api' ? 'Backend + this browser' : 'This demo session') : 'No evaluations yet'} />
        <MetricCard to="/decisions?decision=ALLOW" label="Approved" value={a.allow} icon={ShieldCheck} tone="safe" caption={total ? `${a.pct(a.allow)}% of evaluations` : 'No data yet'} share={share(a.allow)} />
        <MetricCard to="/decisions?decision=BLOCK" label="Blocked" value={a.block} icon={ShieldX} tone="danger" caption={total ? `${a.pct(a.block)}% of evaluations` : 'No data yet'} share={share(a.block)} />
        <MetricCard to="/decisions?decision=REVIEW_REQUIRED" label="Review required" value={a.review} icon={ShieldAlert} tone="warn" caption={total ? `${a.pct(a.review)}% · ${pending} pending review` : 'No data yet'} share={share(a.review)} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Activity over time" subtitle="Cumulative evaluations by outcome, by evaluation time" icon={<Activity className="h-3.5 w-3.5" />}>
          {total ? <ActivityChart records={records} /> : <EmptyState icon={<Inbox className="h-4 w-4" />} title="No activity yet" description="Run the Agent Playground, Attack Lab or the guided demo to record evaluations." className="h-56" />}
        </Panel>
        <Panel title="Risk distribution" subtitle="Click a level to see those records" icon={<ShieldX className="h-3.5 w-3.5" />}>
          {total ? <RiskChart records={records} onSelect={(level) => navigate(`/decisions?risk=${level}`)} /> : <EmptyState title="No risk data" description="Risk levels appear once evaluations are recorded." className="h-56" />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Most commonly failed policies" subtitle="Checks that returned FAIL, across recorded evaluations" icon={<ListX className="h-3.5 w-3.5" />}>
          {a.failedChecks.length ? (
            <ul className="space-y-1.5">
              {a.failedChecks.slice(0, 6).map((f) => (
                <li key={f.name}>
                  <Link to={`/decisions?check=${encodeURIComponent(f.name)}`} className="group block rounded-lg px-2 py-1.5 hover:bg-overlay/50">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-ink">{f.name}</span>
                      <span className="font-mono text-xs text-muted">
                        {f.count} fail{f.count === 1 ? '' : 's'}
                        {f.warnCount > 0 && <span className="text-faint"> · {f.warnCount} warn</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-overlay" aria-hidden>
                      <div className="h-full rounded-full bg-danger/80 transition-all duration-500" style={{ width: `${maxFail ? (f.count / maxFail) * 100 : 0}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ShieldCheck className="h-4 w-4" />} title={total ? 'No failed policy checks' : 'No evaluations yet'} description={total ? 'Every recorded evaluation passed its hard policy checks.' : 'Failed checks are listed here once evaluations are recorded.'} />
          )}
        </Panel>
        <Panel title="Recent high-risk evaluations" subtitle="Risk HIGH or CRITICAL" icon={<Flame className="h-3.5 w-3.5 text-danger" />} actions={a.highRisk.length > 0 && <Link to="/decisions?risk=HIGH,CRITICAL" className="text-xs font-medium text-accent-soft hover:underline">View all</Link>}>
          {a.highRisk.length ? (
            <ul className="-mx-2 divide-y divide-line">
              {a.highRisk.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-overlay/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{describeAction(r.request)}</span>
                      <span className="block truncate text-xs text-faint">{r.response.reason}</span>
                    </span>
                    <RiskBadge risk={r.response.risk_level} />
                    <DecisionBadge decision={r.response.decision} />
                    <span className="hidden font-mono text-2xs text-faint sm:inline">{formatTime(r.response.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<ShieldCheck className="h-4 w-4" />} title="No high-risk evaluations" description={total ? 'None of the recorded evaluations was rated HIGH or CRITICAL.' : 'High-risk evaluations appear here once recorded.'} />
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Recently evaluated decisions"
          subtitle="Select a decision to inspect it"
          actions={
            <Link to="/decisions" className="inline-flex items-center gap-1 text-xs font-medium text-accent-soft hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <RecentDecisions records={records.slice(0, 6)} onSelect={setSelected} />
        </Panel>
        <Panel title="Quick launch" subtitle="Two-minute demo path">
          <div className="space-y-3">
            <QuickLink to="/demo" icon={Presentation} title="Guided demo" body="A five-scene walkthrough for judges: normal action, unsafe action, adversarial evidence, audit." step="0" />
            <QuickLink to="/playground" icon={Bot} title="Agent Playground" body="Give PurchasePilot a goal and watch TrustLayer evaluate its proposal stage by stage." step="1" />
            <QuickLink to="/attack-lab" icon={Swords} title="Attack Lab" body="Inject a malicious review or raise the price, then see how the decision changes." step="2" />
            <QuickLink to="/investigate" icon={Network} title="Decision Investigation" body="Open any evaluation as a pipeline graph and replay its recorded checks." step="3" />
            <QuickLink to="/audit" icon={Sparkles} title="Audit Trail" body="Inspect checks, JSON and execution status for every decision; export it." step="4" />
          </div>
        </Panel>
      </div>

      <Panel className="mt-6" title="Configured agents" subtitle="Static demo profiles; counts reflect evaluations in this session">
        <AgentCards records={records} />
      </Panel>

      <DecisionDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function QuickLink({ to, icon: Icon, title, body, step }: { to: string; icon: typeof Bot; title: string; body: string; step: string }) {
  return (
    <Link to={to} className="group flex gap-3 rounded-lg border border-line bg-raised/50 p-3 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-accent-soft">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="font-mono text-2xs text-faint">0{step}</span> {title}
          <ArrowRight className="ml-auto h-3.5 w-3.5 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-soft" aria-hidden />
        </p>
        <p className="mt-0.5 text-xs text-muted">{body}</p>
      </div>
    </Link>
  );
}

/** One-glance explanation of where TrustLayer sits. */
function FlowStrip() {
  const steps = [
    { icon: Bot, title: 'AI agent', body: 'Proposes a tool action' },
    { icon: null, title: 'TrustLayer', body: 'Permissions · evidence · policy · risk' },
    { icon: ShieldCheck, title: 'Authorization', body: 'Approve, block or escalate' },
    { icon: Wrench, title: 'Tool gateway', body: 'Executes only what was authorized' },
  ];
  return (
    <div className="card grid-bg relative overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/[0.06] via-transparent to-violet/[0.06]" aria-hidden />
      <ol className="relative grid gap-3 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3">
            <span
              className={
                s.icon
                  ? 'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted'
                  : 'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent/10 shadow-glow'
              }
            >
              {s.icon ? <s.icon className="h-4 w-4" aria-hidden /> : <LogoMark className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className={s.icon ? 'text-sm font-medium text-ink' : 'text-sm font-semibold text-accent-soft'}>{s.title}</p>
              <p className="truncate text-xs text-faint">{s.body}</p>
            </div>
            {i < steps.length - 1 && <ArrowRight className="ml-auto hidden h-4 w-4 shrink-0 text-line-strong sm:block" aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
}
