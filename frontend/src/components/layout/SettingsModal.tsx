import { useEffect, useState } from 'react';
import { FlaskConical, Radio } from 'lucide-react';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { ENV_CONFIG } from '@/lib/config';
import { cn } from '@/lib/cn';
import type { DataSource } from '@/types';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dataSource, apiBaseUrl, setSettings } = useAppStore();
  const { notify } = useToast();
  const [mode, setMode] = useState<DataSource>(dataSource);
  const [url, setUrl] = useState(apiBaseUrl);

  useEffect(() => {
    if (open) {
      setMode(dataSource);
      setUrl(apiBaseUrl);
    }
  }, [open, dataSource, apiBaseUrl]);

  const save = () => {
    setSettings({ dataSource: mode, apiBaseUrl: url.trim().replace(/\/+$/, '') || ENV_CONFIG.apiBaseUrl });
    notify({ tone: 'info', title: mode === 'mock' ? 'Using local mock evaluator' : 'Using live TrustLayer API', description: mode === 'api' ? 'API errors will be shown — no mock fallback.' : undefined });
    onClose();
  };

  const options: Array<{ value: DataSource; title: string; body: string; icon: typeof Radio }> = [
    { value: 'mock', title: 'Demo mode (mock)', body: 'Deterministic rules run in your browser. No backend required.', icon: FlaskConical },
    { value: 'api', title: 'Live API', body: 'Evaluations are sent to the FastAPI backend. Errors are shown, never replaced with mock results.', icon: Radio },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connection settings"
      subtitle="Defaults come from VITE_USE_MOCKS and VITE_API_BASE_URL."
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
        <div role="radiogroup" aria-label="Data source" className="grid gap-2 sm:grid-cols-2">
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
        <Field label="API base URL" htmlFor="api-base" hint={`Build default: ${ENV_CONFIG.apiBaseUrl} · mocks ${ENV_CONFIG.useMocks ? 'on' : 'off'}`}>
          <input id="api-base" className="input font-mono" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        </Field>
        <p className="text-2xs text-faint">Mock and backend records are kept separately; each view shows records from the active source only.</p>
      </div>
    </Modal>
  );
}
