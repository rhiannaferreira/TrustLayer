import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from 'recharts';
import { useThemeColors } from '@/hooks/useThemeColors';
import { RISK_LABEL } from '@/lib/format';
import { RISK_LEVELS, type EvaluationRecord, type RiskLevel } from '@/types';

export function RiskChart({ records, onSelect }: { records: EvaluationRecord[]; onSelect?: (level: RiskLevel) => void }) {
  const c = useThemeColors();
  const colors = { LOW: c.safe, MEDIUM: c.warn, HIGH: c.danger, CRITICAL: c.violet };
  const data = RISK_LEVELS.map((level) => ({
    level,
    name: RISK_LABEL[level],
    count: records.filter((r) => r.response.risk_level === level).length,
  }));
  return (
    <div>
    <div className="h-56" role="img" aria-label={data.map((d) => `${d.name}: ${d.count}`).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 8 }} barCategoryGap={10}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            cursor={{ fill: c.line, opacity: 0.3 }}
            contentStyle={{ background: c.raised, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.ink }}
            formatter={(v: number) => [v, 'Evaluations']}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false} minPointSize={2} cursor={onSelect ? 'pointer' : undefined} onClick={(d: { level?: RiskLevel }) => d.level && onSelect?.(d.level)}>
            {data.map((d) => (
              <Cell key={d.level} fill={colors[d.level]} />
            ))}
            <LabelList dataKey="count" position="right" fill={c.muted} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
      {onSelect && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Filter decisions by risk">
          {data.map((d) => (
            <button key={d.level} onClick={() => onSelect(d.level)} disabled={!d.count} className="rounded-md border border-line px-2 py-0.5 text-2xs text-muted hover:border-line-strong hover:text-ink disabled:opacity-40">
              {d.name} · {d.count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
