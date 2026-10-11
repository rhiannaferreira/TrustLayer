import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EvidenceText } from '@/components/evaluation/EvidenceText';
import { ACTION_TYPES } from '@/data/agents';
import { CATALOG, KNOWN_VENDORS } from '@/data/catalog';
import { scanEvidence } from '@/lib/injection';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/context/AppStore';
import type { AttackForm as AttackFormValues } from '@/data/scenarios';
import type { Product } from '@/types';

interface AttackFormProps {
  value: AttackFormValues;
  onChange: (value: AttackFormValues) => void;
  onRun: () => void;
  onReset: () => void;
  running: boolean;
  dirty: boolean;
  /** Baseline values: fields that differ are marked as modified. */
  original?: AttackFormValues;
  /** Product list to choose from (the backend catalog in Live Backend Mode). */
  catalog?: Product[];
  /** Replaces the default Run/Reset bar. */
  footer?: ReactNode;
}

export function AttackForm({ value, onChange, onRun, onReset, running, dirty, original, catalog = CATALOG, footer }: AttackFormProps) {
  const { policySet, dataSource } = useAppStore();
  const mark = (key: keyof AttackFormValues, label: string) =>
    original && JSON.stringify(original[key]) !== JSON.stringify(value[key]) ? `${label} · modified` : label;
  const set = <K extends keyof AttackFormValues>(key: K, v: AttackFormValues[K]) => onChange({ ...value, [key]: v });
  const isOrder = value.action_type === 'place_order';

  const preview = useMemo(() => scanEvidence({ id: 'preview', source: value.evidence_source, content: value.evidence_text }), [value.evidence_text, value.evidence_source]);

  const spending = policySet.policies.find((p) => p.kind === 'spending_limit');
  const vendors = policySet.policies.find((p) => p.kind === 'vendor_allowlist');

  const togglePermission = (perm: string) => {
    const has = value.permissions.includes(perm);
    set('permissions', has ? value.permissions.filter((p) => p !== perm) : [...value.permissions, perm]);
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      {dataSource === 'mock' && (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-raised/50 px-3 py-2 text-xs text-muted">
        <span className="text-faint">Active demo policies:</span>
        {spending && <Badge tone={spending.enabled ? 'accent' : 'neutral'}>Limit {spending.enabled && spending.kind === 'spending_limit' ? formatCurrency(spending.config.max_amount) : 'off'}</Badge>}
        {vendors && vendors.kind === 'vendor_allowlist' && <Badge tone={vendors.enabled ? 'accent' : 'neutral'}>{vendors.enabled ? `${vendors.config.allowed_vendors.length} allowed vendors` : 'Any vendor'}</Badge>}
        <span className="font-mono text-faint">v{policySet.version}</span>
        <Link to="/policies" className="ml-auto text-accent-soft hover:underline">
          Edit
        </Link>
      </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={mark('action_type', 'Proposed tool action')} htmlFor="atk-action">
          <select id="atk-action" className="input" value={value.action_type} onChange={(e) => set('action_type', e.target.value)}>
            {ACTION_TYPES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label={mark('vendor', 'Vendor')} htmlFor="atk-vendor">
          <input id="atk-vendor" className="input" list="atk-vendors" value={value.vendor} onChange={(e) => set('vendor', e.target.value)} />
          <datalist id="atk-vendors">
            {KNOWN_VENDORS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label={mark('product_id', 'Product')} htmlFor="atk-product">
          <select
            id="atk-product"
            className="input"
            value={value.product_id}
            onChange={(e) => {
              const p = catalog.find((x) => x.id === e.target.value);
              onChange({ ...value, product_id: e.target.value, product_name: p?.name ?? '', price: p && Number.isFinite(p.price) ? p.price : value.price, vendor: p?.vendor || value.vendor });
            }}
          >
            <option value="">— none —</option>
            {catalog.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCurrency(p.price)}
              </option>
            ))}
            {value.product_id && !catalog.some((p) => p.id === value.product_id) && <option value={value.product_id}>{value.product_name || value.product_id} (not in catalog)</option>}
          </select>
        </Field>
        <Field label={mark('price', 'Purchase amount (USD)')} htmlFor="atk-price" hint={isOrder ? undefined : 'Not used for non-purchase actions'}>
          <input
            id="atk-price"
            className="input font-mono"
            type="number"
            min={0}
            step="0.01"
            value={Number.isFinite(value.price) ? value.price : ''}
            onChange={(e) => set('price', e.target.value === '' ? 0 : Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label={mark('intent', 'Agent objective (user intent)')} htmlFor="atk-intent">
        <input id="atk-intent" className="input" value={value.intent} onChange={(e) => set('intent', e.target.value)} />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="atk-evidence" className="text-xs font-medium text-muted">
            {mark('evidence_text', 'Untrusted review / evidence text')} <span className="text-faint">(untrusted)</span>
          </label>
          <select aria-label="Evidence source" className="rounded-md border border-line bg-raised px-2 py-0.5 text-2xs text-muted" value={value.evidence_source} onChange={(e) => set('evidence_source', e.target.value)}>
            <option value="product_review">product_review</option>
            <option value="product_listing">product_listing</option>
            <option value="vendor_page">vendor_page</option>
            <option value="search_result">search_result</option>
            <option value="user_message">user_message (trusted)</option>
          </select>
        </div>
        <textarea id="atk-evidence" className="input min-h-[96px] resize-y font-mono text-xs" value={value.evidence_text} onChange={(e) => set('evidence_text', e.target.value)} />
        <div className="rounded-lg border border-line bg-canvas/50 p-2.5">
          <div className="mb-1 flex items-center gap-2">
            <ShieldAlert className={preview.length ? 'h-3.5 w-3.5 text-warn' : 'h-3.5 w-3.5 text-faint'} aria-hidden />
            <span className="text-2xs text-faint">
              {preview.length ? `${preview.length} suspicious passage${preview.length === 1 ? '' : 's'} highlighted (live preview of demo heuristics)` : 'Live preview: no instruction-like patterns detected'}
            </span>
          </div>
          {value.evidence_text ? <EvidenceText content={value.evidence_text} flags={preview} className="max-h-28 overflow-y-auto" /> : <p className="text-2xs text-faint">No evidence.</p>}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">Agent permission context</legend>
        <div className="flex flex-wrap gap-1.5">
          {ACTION_TYPES.map((a) => {
            const on = value.permissions.includes(a.id);
            return (
              <label key={a.id} className={on ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-2xs text-accent-soft' : 'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 py-1 text-2xs text-muted hover:border-line-strong'}>
                <input type="checkbox" className="h-3 w-3 accent-[rgb(var(--accent))]" checked={on} onChange={() => togglePermission(a.id)} />
                {a.id}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-2xs text-faint">
          {dataSource === 'api'
            ? 'Demo Mode only: the live backend request has no permissions field, so these are not sent (see BACKEND_REQUESTS.md).'
            : 'Tools granted to the agent for this run. Restricted actions stay blocked by policy even if granted here.'}
        </p>
      </fieldset>

      <Field label="Agent reasoning" htmlFor="atk-reasoning">
        <input id="atk-reasoning" className="input" value={value.reasoning} onChange={(e) => set('reasoning', e.target.value)} />
      </Field>

      {footer ?? (
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button type="submit" variant="primary" loading={running} icon={<Play className="h-4 w-4" />}>
          Run attack
        </Button>
        <Button type="button" variant="ghost" onClick={onReset} icon={<RotateCcw className="h-3.5 w-3.5" />} disabled={running}>
          Reset scenario
        </Button>
        {dirty && <span className="text-2xs text-warn">Inputs changed — run again to re-evaluate</span>}
      </div>
      )}
    </form>
  );
}
