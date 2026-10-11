import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MetricCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'accent' | 'safe' | 'danger' | 'warn';
  caption: string;
  share?: number;
}

const TONE = {
  accent: { icon: 'text-accent-soft bg-accent/10 border-accent/20', bar: 'bg-accent' },
  safe: { icon: 'text-safe bg-safe/10 border-safe/20', bar: 'bg-safe' },
  danger: { icon: 'text-danger bg-danger/10 border-danger/20', bar: 'bg-danger' },
  warn: { icon: 'text-warn bg-warn/10 border-warn/20', bar: 'bg-warn' },
} as const;

export function MetricCard({ label, value, icon: Icon, tone, caption, share }: MetricCardProps) {
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg border', TONE[tone].icon)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-ink">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-faint">{caption}</p>
      {share !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-overlay" aria-hidden>
          <div className={cn('h-full rounded-full transition-all duration-500', TONE[tone].bar)} style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
