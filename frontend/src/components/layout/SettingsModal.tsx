import { useEffect, useState } from 'react';
import { FlaskConical, Radio } from 'lucide-react';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { ENV_CONFIG, describeBaseUrl } from '@/lib/config';
import { cn } from '@/lib/cn';
import type { DataSource } from '@/types';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings } = useAppStore();
  const { notify } = useToast();
  const [mode, setMode] = useState<DataSource>(settings.dataSource);
  const [url, setUrl] = useState(settings.apiBaseUrl);
  const [useAi, setUseAi] = useState(settings.useAi);
  const [autoExecute, setAutoExecute] = useState(settings.autoExecute);

  useEffect(() => {
    if (open) {
      setMode(settings.dataSource);
      setUrl(settings.apiBaseUrl);
      setUseAi(settings.useAi);
      setAutoExecute(settings.autoExecute);
    }
  }, [open, settings]);

  const save = () => {
    setSettings({ dataSource: mode, apiBaseUrl: url.trim().replace(/\/+$/, ''), useAi, autoExecute });
    notify({
      tone: 'info',
      title: mode === 'mock' ? 'Demo Mode: simulated evaluations' : 'Live Backend Mode',
      description: mode === 'api' ? 'Real backend responses only. API errors are shown — never replaced with mock results.' : 'The deterministic in-browser engine is used. Nothing is sent to the backend.',
    });
    onClose();
  };

  const options: Array<{ value: DataSource; title: string; body: string; icon: typeof Radio }> = [
    { value: 'mock', title: 'Demo Mode', body: 'Deterministic simulated engine in your browser. No backend or credentials required. Reliable fallback.', icon: FlaskConical },
    { value: 'api', title: 'Live Backend Mode', body: 'Real FastAPI evaluations, execution gateway and database-backed history. Errors are shown, never replaced.', icon: Radio },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Operating mode"
      subtitle="Demo and live records are stored separately and never mixed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Operating mode" className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={mode === o.value}
              onClick={() => setMode(o.value)}
              className={cn('rounded-lg border p-3 text-left transition-colors', mode === o.value ? 'border-accent/60 bg-accent/[0.07]' : 'border-line hover:border-line-strong')}
            >
              <o.icon className={cn('mb-2 h-4 w-4', mode === o.value ? 'text-accent-soft' : 'text-faint')} aria-hidden />
              <p className="text-sm font-medium text-ink">{o.title}</p>
              <p className="mt-0.5 text-xs text-muted">{o.body}</p>
            </button>
          ))}
        </div>
        <Field
          label="Backend base URL"
          htmlFor="api-base"
          hint={
            <>
              Leave empty to use the Vite dev proxy (no CORS needed) → <span className="font-mono">{ENV_CONFIG.proxyTarget}</span>. Currently: <span className="font-mono">{describeBaseUrl(url.trim())}</span>
            </>
          }
        >
          <div className="flex gap-2">
            <input id="api-base" className="input font-mono" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} placeholder="(same origin via dev proxy)" />
            <Button variant="ghost" size="sm" className="h-auto" onClick={() => setUrl('')}>
              Use proxy
            </Button>
            <Button variant="ghost" size="sm" className="h-auto" onClick={() => setUrl('http://127.0.0.1:8000')}>
              Direct
            </Button>
          </div>
        </Field>
        <div className="space-y-3 rounded-lg border border-line bg-raised/50 p-3">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-ink">Request AI analysis</span>
              <span className="block text-xs text-muted">Sends <span className="font-mono">use_ai: true</span> in Live Backend Mode. AI is advisory; results are shown only if the backend completes them.</span>
            </span>
            <Toggle checked={useAi} onChange={setUseAi} label="Request AI analysis" />
          </label>
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-ink">Demo workflow: auto-execute approved actions</span>
              <span className="block text-xs text-muted">Off by default. When on, ALLOW decisions are submitted to the execution gateway immediately after evaluation.</span>
            </span>
            <Toggle checked={autoExecute} onChange={setAutoExecute} label="Auto-execute approved actions" />
          </label>
        </div>
        <p className="text-2xs text-faint">Credentials (e.g. Luminal API keys) live only on the backend. The frontend never sees them.</p>
      </div>
    </Modal>
  );
}
