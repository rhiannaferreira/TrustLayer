import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bot, KeyRound, ListChecks, Lock, RefreshCw, RotateCcw, Save, ShieldAlert, Store, Swords, Activity, Wallet, X } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { formatCurrency, titleCase } from '@/lib/format';
import { getWorkspaceId, newWorkspaceId } from '@/lib/workspace';
import type { LivePolicy } from '@/services/liveContract';

type Config = Record<string, unknown>;

const ACTION_LABEL: Record<string, string> = {
  place_order: 'Place orders',
  view_product: 'View products',
  update_payment_method: 'Change payment details',
  issue_refund: 'Issue refunds',
  delete_customer_database: 'Delete customer data',
};
const actionLabel = (a: string) => ACTION_LABEL[a] ?? titleCase(a.replace(/[_.-]+/g, ' '));
const LIMIT_PRESETS = [50, 80, 150, 500];

function configOf(policy: LivePolicy | undefined): Config {
  const c = policy?.raw.config;
  return typeof c === 'object' && c !== null && !Array.isArray(c) ? (c as Config) : {};
}

/**
 * Plain-language rules for a company trying TrustLayer. Each visitor edits the rules in their own
 * private sandbox on the backend, and every purchase their agent proposes is checked against them.
 */
export function RulesPage() {
  const { dataSource, live, loadLivePolicies, patchLivePolicy, resetDemo } = useAppStore();
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [workspace, setWorkspace] = useState(getWorkspaceId);
  const isLive = dataSource === 'api';

  const load = async () => {
    setLoading(true);
    try {
      await loadLivePolicies();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLive) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, workspace]);

  const save = async (id: string, patch: Record<string, unknown>, what: string) => {
    try {
      await patchLivePolicy(id, patch);
      notify({ tone: 'success', title: `${what} saved`, description: 'Applies to the next action your agent proposes.' });
    } catch (err) {
      notify({ tone: 'danger', title: `${what} not saved`, description: errorMessage(err).detail });
      throw err;
    }
  };

  const freshSandbox = () => {
    newWorkspaceId();
    resetDemo();
    setWorkspace(getWorkspaceId());
    notify({ tone: 'success', title: 'Fresh sandbox started', description: 'Default rules and an empty history.' });
  };

  const byId = (id: string) => live.policies?.find((p) => p.id === id);
  const spending = byId('spending-limit');
  const vendors = byId('approved-vendors');
  const actions = byId('allowed-actions');
  const evidence = byId('evidence-review');
  const quality = byId('decision-quality');

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="accent">Your rules</Badge>}
        title="Set the rules your agents must follow"
        description="TrustLayer checks every action your AI purchasing agent proposes against these rules before anything runs. Change a rule, then run the agent or try to trick it, and watch the decisions change."
        actions={
          isLive && (
            <Button size="sm" variant="secondary" icon={<RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => void load()} disabled={loading}>
              Reload
            </Button>
          )
        }
      />

      {!isLive ? (
        <EmptyState
          icon={<Lock className="h-4 w-4" />}
          title="Your rules live on the TrustLayer backend"
          description="Switch to Live Backend Mode in settings to get a private sandbox with your own rules. In Demo Mode, the Policies page edits the in-browser demo engine instead."
          action={
            <Link to="/policies" className="text-xs font-medium text-accent-soft hover:underline">
              Open the demo policies
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <Panel
            title="Your private sandbox"
            subtitle="Your rules and your purchasing agent's decisions belong to this browser only. Other visitors can't see or change them."
            icon={<KeyRound className="h-3.5 w-3.5" />}
            actions={
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={freshSandbox}>
                Start a fresh sandbox
              </Button>
            }
          >
            <p className="text-xs text-muted">
              Sandbox <span className="font-mono text-ink">{workspace.slice(0, 15)}…</span> · These rules apply to the purchasing agent in the Agent Playground, Attack Lab and Test Console.
              The Trust Gate, Agent Workspace and Agents pages use per-agent settings that all visitors share.
            </p>
          </Panel>

          {error !== null && <ErrorBanner error={error} />}

          {!live.policies ? (
            <EmptyState icon={<ListChecks className="h-4 w-4" />} title={loading ? 'Loading your rules…' : 'Rules not loaded'} description={loading ? undefined : 'Make sure the backend is reachable, then press Reload.'} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {spending && <SpendingRule key={`${spending.id}:${spending.version}`} policy={spending} onSave={(p) => save(spending.id, p, 'Spending limit')} />}
              {vendors && (
                <ListRule
                  key={`${vendors.id}:${vendors.version}`}
                  policy={vendors}
                  field="vendors"
                  icon={<Store className="h-3.5 w-3.5" />}
                  title="Approved vendors"
                  subtitle="Your agent may only buy from these sellers."
                  placeholder="Add a vendor, e.g. AudioMart"
                  label={(v) => v}
                  onSave={(p) => save(vendors.id, p, 'Approved vendors')}
                />
              )}
              {actions && (
                <ListRule
                  key={`${actions.id}:${actions.version}`}
                  policy={actions}
                  field="actions"
                  icon={<ListChecks className="h-3.5 w-3.5" />}
                  title="Actions your agent may take"
                  subtitle="Anything not on this list is blocked, however the agent asks."
                  placeholder="Add an action, e.g. issue_refund"
                  label={actionLabel}
                  onSave={(p) => save(actions.id, p, 'Allowed actions')}
                />
              )}
              <Panel title="Human review" subtitle="When TrustLayer should hold an action for a person to approve." icon={<ShieldAlert className="h-3.5 w-3.5" />}>
                <div className="space-y-3">
                  {evidence && (
                    <SwitchRule
                      key={`${evidence.id}:${evidence.version}`}
                      policy={evidence}
                      field="require_review_for_suspicious"
                      title="Suspicious evidence"
                      text="Hold the purchase when a product review or page contains hidden instructions aimed at AI agents."
                      onSave={(p) => save(evidence.id, p, 'Suspicious evidence rule')}
                    />
                  )}
                  {quality && (
                    <SwitchRule
                      key={`${quality.id}:${quality.version}`}
                      policy={quality}
                      field="require_review_if_insufficient"
                      title="Thin evidence"
                      text="Hold the purchase when the agent hasn't compared options or confirmed the full cost."
                      onSave={(p) => save(quality.id, p, 'Thin evidence rule')}
                    />
                  )}
                </div>
              </Panel>
            </div>
          )}

          <Panel title="Now try your rules" subtitle="Each run is checked against the rules above.">
            <div className="grid gap-2 sm:grid-cols-3">
              <TryLink to="/playground" icon={<Bot className="h-4 w-4" />} title="Give the agent a task" text="It proposes a purchase; TrustLayer approves, blocks or holds it." />
              <TryLink to="/attack-lab" icon={<Swords className="h-4 w-4" />} title="Try to trick it" text="Change the price or plant instructions in a review." />
              <TryLink to="/decisions" icon={<Activity className="h-4 w-4" />} title="See every decision" text="Your sandbox's history, with the rule behind each result." />
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function TryLink({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="text-accent-soft">{icon}</span>
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-muted">{text}</span>
    </Link>
  );
}

function OffNotice({ policy, onSave }: { policy: LivePolicy; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  if (policy.enabled !== false) return null;
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/30 bg-warn/[0.06] px-2.5 py-1.5 text-xs text-warn">
      This rule is turned off, so matching actions are held for review.
      <button type="button" className="font-medium underline" onClick={() => void onSave({ enabled: true }).catch(() => undefined)}>
        Turn it back on
      </button>
    </p>
  );
}

function SaveRow({ dirty, saving, onSave, note }: { dirty: boolean; saving: boolean; onSave: () => void; note?: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} disabled={!dirty} onClick={onSave}>
        Save
      </Button>
      {note && <span className="text-xs text-danger">{note}</span>}
    </div>
  );
}

function useSaver(onSave: (patch: Record<string, unknown>) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const run = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await onSave(patch);
    } catch {
      /* the page shows a toast; keep the draft so it can be corrected */
    } finally {
      setSaving(false);
    }
  };
  return { saving, run };
}

function SpendingRule({ policy, onSave }: { policy: LivePolicy; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const current = Number(configOf(policy).max_amount ?? 0);
  const [text, setText] = useState(String(current));
  const { saving, run } = useSaver(onSave);
  const value = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 100000;
  const dirty = valid && value !== current;

  return (
    <Panel title="Spending limit" subtitle="Your agent can't spend more than this on a single purchase." icon={<Wallet className="h-3.5 w-3.5" />} actions={<Badge tone="accent">now {formatCurrency(current)}</Badge>}>
      <OffNotice policy={policy} onSave={onSave} />
      <label htmlFor="rule-limit" className="text-xs text-muted">
        Maximum per purchase (USD)
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input id="rule-limit" type="number" min={1} max={100000} step="any" inputMode="decimal" className="input w-32" value={text} onChange={(e) => setText(e.target.value)} />
        {LIMIT_PRESETS.map((n) => (
          <button key={n} type="button" onClick={() => setText(String(n))} className="rounded-full border border-line px-2.5 py-1 text-2xs text-muted hover:border-line-strong hover:text-ink">
            ${n}
          </button>
        ))}
      </div>
      <SaveRow dirty={dirty} saving={saving} onSave={() => void run({ config: { max_amount: value } })} note={valid ? undefined : 'Enter an amount between $1 and $100,000.'} />
    </Panel>
  );
}

function ListRule({
  policy, field, icon, title, subtitle, placeholder, label, onSave,
}: {
  policy: LivePolicy;
  field: 'vendors' | 'actions';
  icon: ReactNode;
  title: string;
  subtitle: string;
  placeholder: string;
  label: (value: string) => string;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const raw = configOf(policy)[field];
  const current = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  const [items, setItems] = useState(current);
  const [entry, setEntry] = useState('');
  const { saving, run } = useSaver(onSave);
  const dirty = JSON.stringify(items) !== JSON.stringify(current);

  const add = () => {
    const v = entry.trim();
    if (v && !items.includes(v)) setItems([...items, v]);
    setEntry('');
  };

  return (
    <Panel title={title} subtitle={subtitle} icon={icon}>
      <OffNotice policy={policy} onSave={onSave} />
      <ul className="flex flex-wrap gap-1.5" aria-label={title}>
        {items.map((v) => (
          <li key={v} className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-1 text-xs text-ink">
            {label(v)}
            <button type="button" aria-label={`Remove ${label(v)}`} className="rounded-full text-faint hover:text-danger" onClick={() => setItems(items.filter((x) => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-danger">Add at least one before saving.</li>}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input aria-label={placeholder} className="input min-w-0 flex-1" placeholder={placeholder} value={entry} onChange={(e) => setEntry(e.target.value)} />
        <Button size="sm" type="submit" variant="secondary" disabled={!entry.trim()}>
          Add
        </Button>
      </form>
      <SaveRow dirty={dirty && items.length > 0} saving={saving} onSave={() => void run({ config: { [field]: items } })} />
    </Panel>
  );
}

function SwitchRule({
  policy, field, title, text, onSave,
}: {
  policy: LivePolicy;
  field: string;
  title: string;
  text: string;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const current = Boolean(configOf(policy)[field]);
  const { saving, run } = useSaver(onSave);
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <OffNotice policy={policy} onSave={onSave} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{text}</p>
        </div>
        <Toggle checked={current} disabled={saving} label={title} onChange={(v) => void run({ config: { [field]: v } })} />
      </div>
    </div>
  );
}
