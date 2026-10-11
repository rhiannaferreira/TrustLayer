import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText, Save, Radio } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { JsonView } from '@/components/ui/JsonView';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner, errorMessage } from '@/components/ui/ErrorBanner';
import { formatTime, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { LivePolicy } from '@/services/liveContract';

/** Fields that identify a policy rather than configure it. */
const READONLY = new Set(['id', 'policy_id', 'name', 'title', 'version', 'policy_version', 'created_at', 'updated_at', 'description']);

type Draft = Record<string, unknown>;

/** Editable fields are inferred from the backend's own JSON, so the editor matches whatever schema it returns. */
type FieldKind = 'boolean' | 'number' | 'string' | 'list';

function kindOf(v: unknown): FieldKind | null {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return 'list';
  return null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read a top-level or one-level-nested ("rules.max_amount") value. */
export function getPath(raw: Record<string, unknown>, key: string): unknown {
  const [a, b] = key.split('.');
  if (b === undefined) return raw[a];
  return isPlainObject(raw[a]) ? (raw[a] as Record<string, unknown>)[b] : undefined;
}

/**
 * Editable fields are inferred from the backend's own JSON (top level plus one nested level),
 * so the editor matches whatever schema the backend returns.
 */
export function editableFields(raw: Record<string, unknown>): Array<{ key: string; kind: FieldKind }> {
  return Object.entries(raw).flatMap(([key, v]): Array<{ key: string; kind: FieldKind }> => {
    if (READONLY.has(key)) return [];
    const k = kindOf(v);
    if (k) return [{ key, kind: k }];
    if (isPlainObject(v)) {
      return Object.entries(v).flatMap(([sub, sv]): Array<{ key: string; kind: FieldKind }> => {
        const sk = kindOf(sv);
        return sk && !READONLY.has(sub) ? [{ key: `${key}.${sub}`, kind: sk }] : [];
      });
    }
    return [];
  });
}

/** Build a PATCH body with only changed fields. A changed nested field sends its whole parent object, merged. */
export function diffPatch(raw: Record<string, unknown>, draft: Draft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (JSON.stringify(getPath(raw, k)) === JSON.stringify(v)) continue;
    const [a, b] = k.split('.');
    if (b === undefined) patch[a] = v;
    else patch[a] = { ...(isPlainObject(patch[a]) ? (patch[a] as Record<string, unknown>) : (raw[a] as Record<string, unknown>)), [b]: v };
  }
  return patch;
}

/** True when the draft value for `key` differs from the backend's. */
function changedKey(raw: Record<string, unknown>, draft: Draft, key: string): boolean {
  return JSON.stringify(getPath(raw, key)) !== JSON.stringify(draft[key]);
}

export function LivePoliciesPage() {
  const { live, loadLivePolicies, patchLivePolicy } = useAppStore();
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const policies = live.policies ?? [];
  const selected = policies.find((p) => p.id === selectedId) ?? policies[0];

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <Badge tone="accent">Policies</Badge>
            <Badge tone="accent" icon={<Radio className="h-3 w-3" aria-hidden />}>
              Live backend
            </Badge>
          </div>
        }
        title="Backend policies"
        description="Read from GET /api/v1/policies and edited with PATCH /api/v1/policies/{policy_id}. A change is shown only after the backend confirms it, and applies to the next evaluation."
        actions={
          <Button size="sm" variant="secondary" icon={<RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => void load()} disabled={loading}>
            Reload
          </Button>
        }
      />
      {error !== null && (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      )}
      {live.policiesLoadedAt && <p className="mb-3 text-xs text-faint">Loaded {formatTime(live.policiesLoadedAt)} · {policies.length} polic{policies.length === 1 ? 'y' : 'ies'}</p>}

      {policies.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-4 w-4" />} title={loading ? 'Loading backend policies…' : 'No backend policies loaded'} description={loading ? undefined : 'Make sure the backend is running, then press Reload.'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Panel title="Policies" subtitle="As returned by the backend" icon={<ScrollText className="h-3.5 w-3.5" />} bodyClassName="p-2">
            <ul className="space-y-1">
              {policies.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    aria-current={selected?.id === p.id ? 'true' : undefined}
                    className={cn('w-full rounded-lg border px-3 py-2.5 text-left transition-colors', selected?.id === p.id ? 'border-accent/40 bg-accent/[0.05]' : 'border-transparent hover:bg-overlay/40')}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                      {p.version !== undefined && <Badge tone="accent">v{p.version}</Badge>}
                      {p.enabled === false && <Badge>disabled</Badge>}
                    </span>
                    <span className="block truncate font-mono text-2xs text-faint">{p.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {selected && <PolicyEditorLive key={`${selected.id}:${JSON.stringify(selected.raw)}`} policy={selected} onSave={async (patch) => {
            try {
              await patchLivePolicy(selected.id, patch);
              notify({ tone: 'success', title: 'Policy updated by backend', description: `PATCH accepted for ${selected.id}. Applies to the next evaluation.` });
            } catch (err) {
              notify({ tone: 'danger', title: 'Policy change not applied', description: `${errorMessage(err).detail} The backend configuration is unchanged.` });
              throw err;
            }
          }} />}
        </div>
      )}
      {live.policiesRaw !== null && live.policiesRaw !== undefined && (
        <Panel className="mt-4" title="Raw policies response" subtitle="GET /api/v1/policies">
          <JsonView value={live.policiesRaw} maxHeight="max-h-80" />
        </Panel>
      )}
    </>
  );
}

function PolicyEditorLive({ policy, onSave }: { policy: LivePolicy; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const fields = useMemo(() => editableFields(policy.raw), [policy.raw]);
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(fields.map((f) => [f.key, getPath(policy.raw, f.key)])));
  const [listText, setListText] = useState<Record<string, string>>(() => Object.fromEntries(fields.filter((f) => f.kind === 'list').map((f) => [f.key, (getPath(policy.raw, f.key) as string[]).join(', ')])));
  const [saving, setSaving] = useState(false);
  const patch = diffPatch(policy.raw, draft);
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(patch);
    } catch {
      /* reported by the caller; draft stays for correction */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={policy.name} subtitle={<span className="font-mono">{policy.id}</span>} actions={policy.version !== undefined && <Badge tone="accent">version {policy.version}</Badge>}>
      {fields.length === 0 ? (
        <p className="text-sm text-muted">This policy has no simple fields to edit here. Its full JSON is shown below.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) void save();
          }}
        >
          {fields.map((f) => {
            const id = `pol-${f.key.replace(/\./g, '-')}`;
            const changed = changedKey(policy.raw, draft, f.key);
            return (
              <div key={f.key} className={cn('rounded-lg border px-3 py-2', changed ? 'border-accent/40 bg-accent/[0.04]' : 'border-line')}>
                <label htmlFor={id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium text-ink">{titleCase(f.key)}</span>
                    <span className="block font-mono text-2xs text-faint">{f.key}</span>
                  </span>
                  {f.kind === 'boolean' && <Toggle checked={Boolean(draft[f.key])} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} label={f.key} />}
                </label>
                {f.kind === 'number' && (
                  <input id={id} type="number" step="any" className="input mt-1.5 font-mono" value={String(draft[f.key] ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                )}
                {f.kind === 'string' && <input id={id} className="input mt-1.5" value={String(draft[f.key] ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />}
                {f.kind === 'list' && (
                  <>
                    <input
                      id={id}
                      className="input mt-1.5 font-mono text-xs"
                      value={listText[f.key] ?? ''}
                      onChange={(e) => {
                        const text = e.target.value;
                        setListText((t) => ({ ...t, [f.key]: text }));
                        setDraft((d) => ({ ...d, [f.key]: text.split(',').map((x) => x.trim()).filter(Boolean) }));
                      }}
                    />
                    <p className="mt-0.5 text-2xs text-faint">Comma-separated</p>
                  </>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} disabled={!dirty}>
              Save to backend
            </Button>
            {dirty && <span className="font-mono text-2xs text-muted">PATCH {JSON.stringify(patch)}</span>}
          </div>
        </form>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <p className="label mb-1.5">Policy JSON (confirmed by backend)</p>
        <JsonView value={policy.raw} maxHeight="max-h-64" />
      </div>
    </Panel>
  );
}
