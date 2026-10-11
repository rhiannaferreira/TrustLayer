import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatTime } from '@/lib/format';
import type { EvaluationRecord } from '@/types';

interface Point {
  label: string;
  Approved: number;
  Blocked: number;
  'Review required': number;
}

/** Cumulative evaluations by outcome, in the order they were evaluated this session. */
export function ActivityChart({ records }: { records: EvaluationRecord[] }) {
  const c = useThemeColors();
  const sorted = [...records].sort((a, b) => a.response.created_at.localeCompare(b.response.created_at));
  const data: Point[] = [{ label: 'start', Approved: 0, Blocked: 0, 'Review required': 0 }];
  let allow = 0;
  let block = 0;
  let review = 0;
  for (const r of sorted) {
    if (r.response.decision === 'ALLOW') allow++;
    else if (r.response.decision === 'BLOCK') block++;
    else review++;
    data.push({ label: formatTime(r.response.created_at), Approved: allow, Blocked: block, 'Review required': review });
  }

  const series = [
    { key: 'Approved', color: c.safe },
    { key: 'Review required', color: c.warn },
    { key: 'Blocked', color: c.danger },
  ] as const;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.key}
          </span>
        ))}
      </div>
      <div className="h-56" role="img" aria-label={`Cumulative evaluations: ${allow} approved, ${review} review required, ${block} blocked.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.04} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.line }} minTickGap={28} />
            <YAxis allowDecimals={false} tick={{ fill: c.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: c.raised, border: `1px solid ${c.line}`, borderRadius: 8, fontSize: 12, color: c.ink }}
              labelStyle={{ color: c.muted }}
              cursor={{ stroke: c.faint, strokeDasharray: '3 3' }}
            />
            {series.map((s) => (
              <Area key={s.key} type="stepAfter" dataKey={s.key} stackId="1" stroke={s.color} strokeWidth={2} fill={`url(#fill-${s.key.replace(/\s/g, '')})`} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
