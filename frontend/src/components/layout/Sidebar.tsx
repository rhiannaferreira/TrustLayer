import { NavLink } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/context/AppStore';
import { needsReview } from '@/lib/records';

export function SidebarContent({ onNavigate, onReset }: { onNavigate?: () => void; onReset: () => void }) {
  const { records, policySet } = useAppStore();
  const pending = records.filter(needsReview).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-0.5 px-2 py-2">
        <p className="label px-2 pb-2 pt-1">Workspace</p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                isActive ? 'bg-overlay text-ink' : 'text-muted hover:bg-overlay/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden />}
                <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent-soft' : 'text-faint group-hover:text-muted')} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.to === '/decisions' && pending > 0 && (
                  <span className="rounded bg-warn/15 px-1.5 text-2xs font-medium tabular-nums text-warn" aria-label={`${pending} pending review`}>
                    {pending}
                  </span>
                )}
                {item.to === '/attack-lab' && <span className="rounded bg-violet/15 px-1.5 text-2xs font-medium text-violet">Lab</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line p-3">
        <div className="rounded-lg border border-line bg-raised/60 px-3 py-2">
          <p className="label">Active policy set</p>
          <p className="mt-0.5 font-mono text-xs text-ink">
            {policySet.id} <span className="text-faint">v{policySet.version}</span>
          </p>
        </div>
        <button onClick={onReset} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-overlay/60 hover:text-ink">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset demo
        </button>
      </div>
    </div>
  );
}
