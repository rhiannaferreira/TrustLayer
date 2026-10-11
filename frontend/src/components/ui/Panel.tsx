import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, subtitle, actions, icon, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('card flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <header className="card-header">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-raised text-muted">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>}
              {subtitle && <p className="truncate text-xs text-faint">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
