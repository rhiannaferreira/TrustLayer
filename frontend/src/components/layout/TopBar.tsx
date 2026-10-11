import { Link } from 'react-router-dom';
import { Menu, Moon, Sun, Settings2, FlaskConical, Radio, Presentation } from 'lucide-react';
import { useAppStore } from '@/context/AppStore';
import { useTheme } from '@/hooks/useTheme';
import { LogoMark } from '@/components/ui/Logo';
import { ConnectionIndicator } from './ConnectionIndicator';
import { cn } from '@/lib/cn';

export function TopBar({ onMenu, onSettings }: { onMenu: () => void; onSettings: () => void }) {
  const { dataSource } = useAppStore();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-muted hover:bg-overlay hover:text-ink lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <LogoMark className="h-6 w-6 lg:hidden" />

      <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
        <span className="text-faint">Workspace</span>
        <span className="text-line-strong">/</span>
        <span className="truncate font-medium text-ink">Agent Command Center</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onSettings}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            dataSource === 'mock' ? 'border-violet/30 bg-violet/10 text-violet hover:bg-violet/15' : 'border-accent/30 bg-accent/10 text-accent-soft hover:bg-accent/15',
          )}
          title="Change operating mode"
        >
          {dataSource === 'mock' ? <FlaskConical className="h-3.5 w-3.5" aria-hidden /> : <Radio className="h-3.5 w-3.5" aria-hidden />}
          <span className="hidden sm:inline">{dataSource === 'mock' ? 'Demo Mode · simulated' : 'Live Backend Mode'}</span>
          <span className="sm:hidden">{dataSource === 'mock' ? 'Demo' : 'Live'}</span>
        </button>

        <ConnectionIndicator />

        <Link
          to="/demo"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white shadow-glow hover:bg-accent/90"
        >
          <Presentation className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Launch Demo</span>
          <span className="sm:hidden">Demo</span>
        </Link>

        <button onClick={toggle} className="rounded-md p-1.5 text-muted hover:bg-overlay hover:text-ink" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {/* Hidden on phones to fit the bar; the mode pill above opens the same settings. */}
        <button onClick={onSettings} className="hidden rounded-md p-1.5 text-muted hover:bg-overlay hover:text-ink sm:block" aria-label="Connection settings">
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
