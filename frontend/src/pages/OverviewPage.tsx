import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, ShieldX, UserRoundSearch, Bot, Swords, ArrowRight, Wrench, Sparkles } from 'lucide-react';
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
import { needsReview } from '@/lib/records';

export function OverviewPage() {
  const { records, dataSource } = useAppStore();
  const [selected, setSelected] = useState<string | null>(null);

  const total = records.length;
  const approved = records.filter((r) => r.response.decision === 'ALLOW').length;
  const blocked = records.filter((r) => r.response.decision === 'BLOCK').length;
  const pending = records.filter(needsReview).length;
  const seeded = records.filter((r) => r.seeded).length;
  const share = (n: number) => (total ? n / total : 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Command center</Badge>
            {dataSource === 'mock' && <Badge tone="violet">Demo data · local mock evaluator</Badge>}
          </div>
        }
        title="Your AI agents. Under control."
        description="Monitor, investigate, and govern autonomous decisions in real time."
        actions={
          <>
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
        <MetricCard label="Total evaluations" value={total} icon={Activity} tone="accent" caption={seeded ? `Includes ${seeded} labelled seed record${seeded === 1 ? '' : 's'}` : 'This session'} />
        <MetricCard label="Approved actions" value={approved} icon={ShieldCheck} tone="safe" caption={`${Math.round(share(approved) * 100)}% of evaluations`} share={share(approved)} />
        <MetricCard label="Blocked actions" value={blocked} icon={ShieldX} tone="danger" caption={`${Math.round(share(blocked) * 100)}% of evaluations`} share={share(blocked)} />
        <MetricCard label="Pending human review" value={pending} icon={UserRoundSearch} tone="warn" caption={pending ? 'Execution held until resolved' : 'Nothing waiting'} share={share(pending)} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Decision activity" subtitle="Cumulative evaluations by outcome, in evaluation order" icon={<Activity className="h-3.5 w-3.5" />}>
          <ActivityChart records={records} />
        </Panel>
        <Panel title="Risk distribution" subtitle="Risk level assigned per evaluation" icon={<ShieldX className="h-3.5 w-3.5" />}>
          <RiskChart records={records} />
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
            <QuickLink to="/playground" icon={Bot} title="Agent Playground" body="Give PurchasePilot a goal and watch TrustLayer evaluate its proposal stage by stage." step="1" />
            <QuickLink to="/attack-lab" icon={Swords} title="Attack Lab" body="Inject a malicious review or raise the price, then see how the decision changes." step="2" />
            <QuickLink to="/audit" icon={Sparkles} title="Audit Trail" body="Inspect checks, JSON and execution status for every decision; export it." step="3" />
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
