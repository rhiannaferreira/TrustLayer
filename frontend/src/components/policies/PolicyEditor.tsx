import { useEffect, useState } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ACTION_TYPES } from '@/data/agents';
import { KNOWN_VENDORS } from '@/data/catalog';
import { formatCurrency } from '@/lib/format';
import type { AnyPolicy, PolicyPatch } from '@/types';

interface EditorProps {
  policy: AnyPolicy;
  saving: boolean;
  onSave: (patch: PolicyPatch) => void;
}

/** Config editor per policy kind. Changes apply to the next evaluation once saved. */
export function PolicyEditor({ policy, saving, onSave }: EditorProps) {
  switch (policy.kind) {
    case 'spending_limit':
      return <SpendingEditor key={policy.id + policy.updated_at} max={policy.config.max_amount} saving={saving} onSave={(max_amount) => onSave({ config: { max_amount } })} />;
    case 'vendor_allowlist':
      return <VendorEditor key={policy.id + policy.updated_at} vendors={policy.config.allowed_vendors} saving={saving} onSave={(allowed_vendors) => onSave({ config: { allowed_vendors } })} />;
    case 'restricted_actions':
      return (
        <ChecklistEditor
          key={policy.id + policy.updated_at}
          label="Restricted actions"
          options={ACTION_TYPES.map((a) => ({ id: a.id, label: a.label, hint: a.description }))}
          selected={policy.config.restricted_actions}
          saving={saving}
          onSave={(restricted_actions) => onSave({ config: { restricted_actions } })}
        />
      );
    case 'untrusted_evidence':
      return (
        <ChecklistEditor
          key={policy.id + policy.updated_at}
          label="Evidence sources scanned as untrusted"
          options={['product_review', 'product_listing', 'vendor_page', 'search_result', 'user_message'].map((s) => ({ id: s, label: s }))}
          selected={policy.config.scan_sources}
          saving={saving}
          onSave={(scan_sources) => onSave({ config: { scan_sources } })}
        />
      );
    case 'human_review':
      return (
        <div className="rounded-lg border border-line bg-raised/50 p-3 text-xs text-muted">
          <p>
            <span className="font-medium text-ink">Enabled:</span> actions with evidence warnings become <span className="text-warn">REVIEW_REQUIRED</span> and the gateway holds them until a review approval is recorded.
          </p>
          <p className="mt-1.5">
            <span className="font-medium text-ink">Disabled:</span> there is no review path, so flagged actions fail closed and are <span className="text-danger">BLOCKED</span>.
          </p>
        </div>
      );
  }
}

function SpendingEditor({ max, saving, onSave }: { max: number; saving: boolean; onSave: (v: number) => void }) {
  const [value, setValue] = useState(String(max));
  useEffect(() => setValue(String(max)), [max]);
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(Math.round(parsed * 100) / 100);
      }}
      className="space-y-3"
    >
      <Field label="Maximum purchase amount (USD)" htmlFor="pol-max" hint={`Current: ${formatCurrency(max)}. Orders above this are blocked.`}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">$</span>
            <input id="pol-max" type="number" min={0} step="0.01" className="input pl-7 font-mono" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!valid} />
          </div>
          <Button type="submit" variant="primary" loading={saving} disabled={!valid || parsed === max} icon={<Save className="h-3.5 w-3.5" />}>
            Save
          </Button>
        </div>
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {[50, 80, 100, 150].map((v) => (
          <button key={v} type="button" onClick={() => setValue(String(v))} className="rounded-md border border-line px-2 py-0.5 font-mono text-2xs text-muted hover:border-line-strong hover:text-ink">
            ${v}
          </button>
        ))}
      </div>
    </form>
  );
}

function VendorEditor({ vendors, saving, onSave }: { vendors: string[]; saving: boolean; onSave: (v: string[]) => void }) {
  const [list, setList] = useState(vendors);
  const [draft, setDraft] = useState('');
  useEffect(() => setList(vendors), [vendors]);
  const changed = JSON.stringify(list) !== JSON.stringify(vendors);
  const add = () => {
    const v = draft.trim();
    if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) setList([...list, v]);
    setDraft('');
  };
  const suggestions = KNOWN_VENDORS.filter((v) => !list.includes(v));
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted">Approved vendors</p>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((v) => (
          <li key={v} className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1 text-xs text-ink">
            {v}
            <button onClick={() => setList(list.filter((x) => x !== v))} className="rounded text-faint hover:text-danger" aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-warn">No vendors approved — every order will be blocked.</li>}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input aria-label="Add vendor" className="input h-8 py-1 text-xs" placeholder="Add vendor…" value={draft} onChange={(e) => setDraft(e.target.value)} list="pol-vendor-suggest" />
        <datalist id="pol-vendor-suggest">
          {suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!draft.trim()}>
          Add
        </Button>
      </form>
      <Button variant="primary" size="sm" loading={saving} disabled={!changed} onClick={() => onSave(list)} icon={<Save className="h-3.5 w-3.5" />}>
        Save allowlist
      </Button>
    </div>
  );
}

function ChecklistEditor({ label, options, selected, saving, onSave }: { label: string; options: Array<{ id: string; label: string; hint?: string }>; selected: string[]; saving: boolean; onSave: (v: string[]) => void }) {
  const [list, setList] = useState(selected);
  useEffect(() => setList(selected), [selected]);
  const changed = JSON.stringify([...list].sort()) !== JSON.stringify([...selected].sort());
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-medium text-muted">{label}</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o) => {
          const on = list.includes(o.id);
          return (
            <label key={o.id} className={on ? 'flex cursor-pointer items-start gap-2 rounded-lg border border-accent/40 bg-accent/[0.06] px-2.5 py-2' : 'flex cursor-pointer items-start gap-2 rounded-lg border border-line px-2.5 py-2 hover:border-line-strong'}>
              <input type="checkbox" className="mt-0.5 accent-[rgb(var(--accent))]" checked={on} onChange={() => setList(on ? list.filter((x) => x !== o.id) : [...list, o.id])} />
              <span className="min-w-0">
                <span className="block font-mono text-xs text-ink">{o.id}</span>
                {o.hint && <span className="block text-2xs text-faint">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <Button variant="primary" size="sm" loading={saving} disabled={!changed} onClick={() => onSave(list)} icon={<Save className="h-3.5 w-3.5" />}>
        Save
      </Button>
    </fieldset>
  );
}
