import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Copy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useGateClient } from '@/hooks/useGateClient';
import type { AgentRecord, TrustTools } from '@/services/api';

const LIMIT_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'budget', label: 'Purchase budget ($)' },
  { key: 'auto_limit', label: 'Payment auto-approve ($)' },
  { key: 'hard_limit', label: 'Payment hard limit ($)' },
  { key: 'max_records', label: 'Max records per read' },
  { key: 'max_recipients', label: 'Max email recipients' },
  { key: 'max_deletes', label: 'Max files per delete' },
];

export function AgentsPage() {
  const client = useGateClient();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [tools, setTools] = useState<TrustTools | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [newKey, setNewKey] = useState<{ agent: string; key: string } | null>(null);
  const [name, setName] = useState('');
  const base = client.baseUrl || window.location.origin;

  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([client.agents(), client.trustTools()]);
      setAgents(a);
      setTools(t);
    } catch (e) {
      setError(e);
    }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  async function guard<T>(fn: () => Promise<T>) {
    try { setError(null); await fn(); await load(); } catch (e) { setError(e); }
  }

  const snippet = `curl -X POST ${base}/api/v1/gate/check \\
  -H "Authorization: Bearer tl_YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{"action":"db.run_query","parameters":{"sql":"DROP TABLE users","environment":"production"}}'

# -> {"decision":"BLOCK","allowed":false,"reason":"DROP/TRUNCATE/ALTER statements are never allowed for agents", ...}`;

  return (
    <div>
      <PageHeader
        title="Agents & API"
        description="Register any outside agent, choose what it may ever attempt, set its limits, and give it a key. Its identity comes from the key, and every check runs on the server. TrustLayer returns the verdict; your agent must honour it."
      />
      <div className="space-y-4">
        {error != null && <ErrorBanner error={error} />}
        {newKey && (
          <Panel title="Copy this key now" subtitle={`API key for ${newKey.agent}. It is shown once and only its hash is stored.`} icon={<KeyRound className="h-4 w-4" />}>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg border border-line bg-raised p-2 text-xs text-ink">{newKey.key}</code>
              <Button icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard?.writeText(newKey.key)}>Copy</Button>
            </div>
          </Panel>
        )}
        <Panel title="Create an agent">
          <form className="flex gap-2" onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return;
            void guard(async () => {
              const created = await client.createAgent(name.trim(), ['web.research'], { budget: 100 });
              setNewKey({ agent: created.name, key: created.api_key });
              setName('');
            });
          }}>
            <input className="input flex-1" placeholder="Agent name, e.g. Support bot" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />}>Create</Button>
          </form>
          <p className="mt-2 text-xs text-faint">New agents start with web research only and conservative limits. Grant more below.</p>
        </Panel>
        {agents.map((a) => (
          <Panel
            key={a.id}
            title={a.name}
            subtitle={`${a.id} · ${a.has_key ? `key ${a.key_prefix}…` : 'no API key yet'}`}
            actions={
              <>
                <Badge tone={a.enabled ? 'safe' : 'danger'}>{a.enabled ? 'enabled' : 'disabled'}</Badge>
                <Button onClick={() => guard(async () => { const r = await client.rotateKey(a.id); setNewKey({ agent: a.name, key: r.api_key }); })}>
                  {a.has_key ? 'Rotate key' : 'Create key'}
                </Button>
                <Button onClick={() => guard(async () => { await client.patchAgent(a.id, { enabled: !a.enabled }); })}>{a.enabled ? 'Disable' : 'Enable'}</Button>
              </>
            }
          >
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">Allowed actions</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(tools?.actions ?? []).map((act) => {
                const on = a.scopes.includes(act);
                return (
                  <button key={act} type="button" onClick={() => guard(async () => { await client.patchAgent(a.id, { scopes: on ? a.scopes.filter((s) => s !== act) : [...a.scopes, act] }); })}
                    className={`rounded-md border px-2 py-1 text-2xs ${on ? 'border-accent text-ink' : 'border-line text-faint hover:text-ink'}`}>{act}</button>
                );
              })}
            </div>
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">Limits</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LIMIT_FIELDS.map((f) => (
                <label key={f.key} className="text-2xs text-muted">
                  {f.label}
                  <input
                    className="input mt-1 w-full" type="number" min={0}
                    defaultValue={typeof a.limits[f.key] === 'number' ? (a.limits[f.key] as number) : ''}
                    placeholder="default"
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      if (v !== null && v !== a.limits[f.key]) void guard(async () => { await client.patchAgent(a.id, { limits: { [f.key]: v } }); });
                    }}
                  />
                </label>
              ))}
            </div>
          </Panel>
        ))}
        <Panel title="Connect any agent" subtitle="Python and JS clients are in backend/clients; full steps in backend/QUICKSTART.md">
          <pre className="overflow-x-auto rounded-lg border border-line bg-raised p-3 text-2xs text-muted">{snippet}</pre>
          <p className="mt-2 text-xs text-faint">Management is open to anyone with this link unless the backend sets TRUSTLAYER_ADMIN_TOKEN. Do not share the demo publicly with real data.</p>
        </Panel>
      </div>
    </div>
  );
}
