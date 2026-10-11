import { Menu, Moon, Sun, Settings2, FlaskConical, Radio } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import { useTheme } from '@/hooks/useTheme';
import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';

export function TopBar({ onMenu, onSettings }: { onMenu: () => void; onSettings: () => void }) {
  const { dataSource, apiBaseUrl } = useAppStore();
  const health = useBackendHealth(apiBaseUrl);
  const { theme, toggle } = useTheme();

  const healthLabel = health.state === 'online' ? 'Backend online' : health.state === 'offline' ? 'Backend offline' : 'Checking backend';
  const healthTitle = `${apiBaseUrl}/health${health.checkedAt ? ` · checked ${formatTime(health.checkedAt)}` : ''}${health.latency !== null ? ` · ${health.latency}ms` : ''}`;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-muted hover:bg-overlay hover:text-ink lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <LogoMark className="h-6 w-6 lg:hidden" />

      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden text-faint sm:inline">Workspace</span>
        <span className="hidden text-line-strong sm:inline">/</span>
        <span className="truncate font-medium text-ink">TrustLayer Demo</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onSettings}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            dataSource === 'mock' ? 'border-violet/30 bg-violet/10 text-violet hover:bg-violet/15' : 'border-accent/30 bg-accent/10 text-accent-soft hover:bg-accent/15',
          )}
          title="Change data source"
        >
          {dataSource === 'mock' ? <FlaskConical className="h-3.5 w-3.5" aria-hidden /> : <Radio className="h-3.5 w-3.5" aria-hidden />}
          <span className="hidden sm:inline">{dataSource === 'mock' ? 'Demo mode · mock' : 'Live API'}</span>
          <span className="sm:hidden">{dataSource === 'mock' ? 'Demo' : 'API'}</span>
        </button>

        <button
          onClick={() => void health.check()}
          className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-ink md:inline-flex"
          title={healthTitle}
          aria-label={`${healthLabel}. Click to re-check.`}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health.state === 'online' ? 'bg-safe shadow-[0_0_6px_rgb(var(--safe))]' : health.state === 'offline' ? 'bg-danger' : 'animate-pulse bg-faint',
            )}
            aria-hidden
          />
          {healthLabel}
        </button>

        <button onClick={toggle} className="rounded-md p-1.5 text-muted hover:bg-overlay hover:text-ink" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button onClick={onSettings} className="rounded-md p-1.5 text-muted hover:bg-overlay hover:text-ink" aria-label="Connection settings">
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
