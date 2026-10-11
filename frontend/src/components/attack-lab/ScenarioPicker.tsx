import { Wallet, Syringe, CheckCircle2, KeyRound } from 'lucide-react';
import { ATTACK_SCENARIOS, type ScenarioId } from '@/data/scenarios';
import { cn } from '@/lib/cn';

const ICONS: Record<ScenarioId, typeof Wallet> = { budget: Wallet, injection: Syringe, valid: CheckCircle2, unauthorized: KeyRound };

export function ScenarioPicker({ value, onChange, disabled }: { value: ScenarioId; onChange: (id: ScenarioId) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Attack scenario" className="grid grid-cols-2 gap-2">
      {ATTACK_SCENARIOS.map((s) => {
        const Icon = ICONS[s.id];
        const active = s.id === value;
        return (
          <button
            key={s.id}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(s.id)}
            className={cn(
              'rounded-lg border p-2.5 text-left transition-colors disabled:opacity-60',
              active ? 'border-violet/50 bg-violet/[0.08]' : 'border-line hover:border-line-strong hover:bg-overlay/40',
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4', active ? 'text-violet' : 'text-faint')} aria-hidden />
              <span className="text-sm font-medium text-ink">{s.title}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-2xs text-muted">{s.description}</p>
          </button>
        );
      })}
    </div>
  );
}
