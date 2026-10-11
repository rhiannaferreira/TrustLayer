import { useState } from 'react';
import { ScrollText, RotateCcw, Wallet, Store, KeyRound, FileSearch, UserRoundCheck, ShieldCheck } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge, RiskBadge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Overlay';
import { JsonView } from '@/components/ui/JsonView';
import { errorMessage } from '@/components/ui/ErrorBanner';
import { PolicyEditor } from '@/components/policies/PolicyEditor';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AnyPolicy, PolicyKind, PolicyPatch } from '@/types';

const ICONS: Record<PolicyKind, typeof Wallet> = {
  spending_limit: Wallet,
  vendor_allowlist: Store,
  restricted_actions: KeyRound,
  untrusted_evidence: FileSearch,
  human_review: UserRoundCheck,
};

function summarize(p: AnyPolicy): string {
  switch (p.kind) {
    case 'spending_limit':
      return `Max ${formatCurrency(p.config.max_amount)} per order`;
    case 'vendor_allowlist':
      return `${p.config.allowed_vendors.length} approved vendor${p.config.allowed_vendors.length === 1 ? '' : 's'}`;
    case 'restricted_actions':
      return `${p.config.restricted_actions.length} restricted tool action${p.config.restricted_actions.length === 1 ? '' : 's'}`;
    case 'untrusted_evidence':
      return `Scans ${p.config.scan_sources.length} source type${p.config.scan_sources.length === 1 ? '' : 's'}`;
    case 'human_review':
      return p.enabled ? 'Flagged actions → review' : 'Flagged actions → blocked (fail closed)';
  }
}

export function PoliciesPage() {
  const { policySet, updatePolicy, resetPolicies, dataSource } = useAppStore();
  const { notify } = useToast();
  const [selectedId, setSelectedId] = useState(policySet.policies[0]?.id);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);

  const selected = policySet.policies.find((p) => p.id === selectedId) ?? policySet.policies[0];

  const apply = async (policy: AnyPolicy, patch: PolicyPatch, label: string) => {
    setSaving(policy.id);
    try {
      await updatePolicy(policy.id, patch);
      notify({ tone: 'success', title: label, description: dataSource === 'api' ? 'Confirmed by the backend. Applies to the next evaluation.' : 'Saved locally. Applies to the next evaluation.' });
    } catch (err) {
      notify({ tone: 'danger', title: 'Policy change not applied', description: `${errorMessage(err).detail} The previous configuration is still active.` });
    } finally {
      setSaving(null);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      await resetPolicies();
      notify({ tone: 'success', title: 'Policies reset to defaults' });
      setConfirmReset(false);
    } catch (err) {
      notify({ tone: 'danger', title: 'Reset failed', description: errorMessage(err).detail });
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="accent">Policies</Badge>}
        title="Rules every agent action must pass"
        description="Deterministic policies are enforced before any tool call. Changes apply to the very next evaluation."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setJsonOpen(true)}>
              View as JSON
            </Button>
            <Button variant="secondary" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setConfirmReset(true)}>
              Reset to defaults
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-accent-soft" aria-hidden />
        <span className="font-mono text-ink">{policySet.id}</span>
        <Badge tone="accent">v{policySet.version}</Badge>
        <span className="text-faint">updated {formatDateTime(policySet.updated_at)}</span>
        <span className="text-faint">·</span>
        <span>{dataSource === 'api' ? 'Changes are applied only after the backend confirms them.' : 'Stored in this browser (localStorage).'}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel title="Configured rules" subtitle={`${policySet.policies.filter((p) => p.enabled).length} of ${policySet.policies.length} enabled`} icon={<ScrollText className="h-3.5 w-3.5" />} bodyClassName="p-2">
          <ul className="space-y-1">
            {policySet.policies.map((p, i) => {
              const Icon = ICONS[p.kind];
              const active = p.id === selected?.id;
              return (
                <li key={p.id}>
                  <div className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors', active ? 'border-accent/40 bg-accent/[0.05]' : 'border-transparent hover:bg-overlay/40')}>
                    <button onClick={() => setSelectedId(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-current={active ? 'true' : undefined}>
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', p.enabled ? 'border-accent/30 bg-accent/10 text-accent-soft' : 'border-line bg-raised text-faint')}>
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-2xs text-faint">{i + 1}</span>
                          <span className={cn('truncate text-sm font-medium', p.enabled ? 'text-ink' : 'text-muted line-through decoration-faint')}>{p.name}</span>
                        </span>
                        <span className="block truncate text-xs text-faint">{summarize(p)}</span>
                      </span>
                    </button>
                    <Toggle
                      checked={p.enabled}
                      label={`${p.enabled ? 'Disable' : 'Enable'} ${p.name}`}
                      disabled={saving === p.id}
                      onChange={(enabled) => void apply(p, { enabled }, `${p.name} ${enabled ? 'enabled' : 'disabled'}`)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

        {selected && (
          <Panel
            title={selected.name}
            subtitle={<span className="font-mono">{selected.id}</span>}
            icon={(() => {
              const Icon = ICONS[selected.kind];
              return <Icon className="h-3.5 w-3.5" />;
            })()}
            actions={
              <div className="flex items-center gap-2">
                <RiskBadge risk={selected.severity} />
                <Badge tone={selected.enabled ? 'safe' : 'neutral'}>{selected.enabled ? 'Enforced' : 'Disabled'}</Badge>
              </div>
            }
          >
            <div className="space-y-4">
              <p className="text-sm text-muted">{selected.description}</p>
              <PolicyEditor policy={selected} saving={saving === selected.id} onSave={(patch) => void apply(selected, patch, `${selected.name} updated`)} />
              <div className="border-t border-line pt-3">
                <p className="label mb-1.5">Current configuration</p>
                <JsonView value={selected.config} maxHeight="max-h-48" />
                <p className="mt-2 text-2xs text-faint">Last changed {formatDateTime(selected.updated_at)}</p>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset policies to defaults?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={resetting} onClick={() => void doReset()}>
              Reset policies
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Restores the $80 limit, the default vendor allowlist and restricted actions, and re-enables every policy. Existing evaluations keep the policy version they were evaluated under.</p>
      </Modal>

      <Modal open={jsonOpen} onClose={() => setJsonOpen(false)} title="Policy set" subtitle="Shape of GET /api/v1/policies" width="max-w-2xl">
        <JsonView value={policySet} />
      </Modal>
    </>
  );
}
