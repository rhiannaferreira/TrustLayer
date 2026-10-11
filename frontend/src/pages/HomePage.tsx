import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, KeyRound, Inbox, Bot } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { useGateClient } from '@/hooks/useGateClient';
import type { TrustStats } from '@/services/api';

const STEPS = [
  ['An agent proposes', 'Any AI agent says what it wants to do, with its reasoning and evidence.'],
  ['TrustLayer checks', 'Permissions, evidence, policy, ethics and risk run on the server. A model can never grant permission.'],
  ['ALLOW, REVIEW or BLOCK', 'Safe actions go through, risky ones wait for a human, dangerous ones stop.'],
  ['Everything is recorded', 'Every decision and every human review lands in the audit trail.'],
];

export function HomePage() {
  const client = useGateClient();
  const [stats, setStats] = useState<TrustStats | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    client.trustStats().then(setStats).catch(() => setOffline(true));
  }, [client]);

  const tiles: Array<[string, number | string]> = stats
    ? [['Actions checked', stats.total], ['Allowed', stats.allowed], ['Held for review', stats.held_for_review], ['Blocked', stats.blocked]]
    : [];

  return (
    <div className="space-y-6">
      <section className="py-6">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-accent-soft"><ShieldCheck className="h-4 w-4" /> The trust engine for AI agents</p>
        <h1 className="max-w-3xl text-3xl font-semibold text-ink sm:text-4xl">AI agents can propose actions. TrustLayer decides.</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          An independent authorization layer between any AI agent and the real world: payments, data, databases, healthcare, workplace tools, purchases. One layer to plug in, instead of a different safety system for every agent.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/workspace" className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors bg-accent text-white hover:bg-accent/90"><Bot className="h-4 w-4" /> Try it: give an agent a task <ArrowRight className="h-4 w-4" /></Link>
          <Link to="/agents" className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors border border-line text-ink hover:border-line-strong hover:bg-overlay/60"><KeyRound className="h-4 w-4" /> Connect your own agent</Link>
          <Link to="/reviews" className="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors border border-line text-ink hover:border-line-strong hover:bg-overlay/60"><Inbox className="h-4 w-4" /> Review queue{stats && stats.pending_reviews > 0 ? ` (${stats.pending_reviews})` : ''}</Link>
        </div>
      </section>
      {offline && <p className="text-sm text-warn">The backend is not reachable right now, so live numbers are unavailable.</p>}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <Panel key={label}><p className="text-2xs uppercase text-faint">{label}</p><p className="text-2xl font-semibold text-ink">{value}</p></Panel>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {STEPS.map(([t, d], i) => (
          <Panel key={t}><p className="text-2xs text-faint">Step {i + 1}</p><p className="mb-1 text-sm font-semibold text-ink">{t}</p><p className="text-xs text-muted">{d}</p></Panel>
        ))}
      </div>
      <Panel title="What is real and what is simulated">
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Real: the decision engine, permissions, limits, evidence scanning, API keys, review queue and audit trail, all enforced on the server.</li>
          <li>Real: the planning model that turns a task into steps, and web research.</li>
          <li>Sandboxed: database queries run on a throwaway demo database.</li>
          <li>Simulated: email, payments, purchases, deletions and medical actions contact no outside system.</li>
          <li>Storage: {stats?.storage === 'postgres' ? 'durable Postgres.' : 'temporary SQLite that resets on server restarts until a Postgres DATABASE_URL is set.'}</li>
        </ul>
      </Panel>
    </div>
  );
}
