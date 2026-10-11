import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-line bg-raised text-faint">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
