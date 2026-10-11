import { cn } from '@/lib/cn';

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap rounded-lg border border-line bg-raised p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active ? 'bg-overlay text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cn('rounded px-1 text-2xs tabular-nums', active ? 'bg-accent/20 text-accent-soft' : 'bg-overlay text-faint')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
