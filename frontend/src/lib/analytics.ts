/** Analytics derived only from the evaluation records in the active mode. Nothing is extrapolated. */
import { RISK_LEVELS, type EvaluationRecord, type RiskLevel } from '@/types';

export interface Analytics {
  total: number;
  allow: number;
  block: number;
  review: number;
  pct: (n: number) => number;
  risk: Record<RiskLevel, number>;
  failedChecks: Array<{ name: string; count: number; warnCount: number }>;
  highRisk: EvaluationRecord[];
}

export function computeAnalytics(records: EvaluationRecord[]): Analytics {
  const total = records.length;
  const allow = records.filter((r) => r.response.decision === 'ALLOW').length;
  const block = records.filter((r) => r.response.decision === 'BLOCK').length;
  const review = records.filter((r) => r.response.decision === 'REVIEW_REQUIRED').length;
  const risk = Object.fromEntries(RISK_LEVELS.map((l) => [l, records.filter((r) => r.response.risk_level === l).length])) as Record<RiskLevel, number>;
  const fails = new Map<string, { count: number; warnCount: number }>();
  for (const r of records) {
    for (const c of r.response.checks) {
      // The final-decision check restates the outcome; it is not a policy that failed.
      if (/^final\b|^overall\b/i.test(c.name) || c.stage === 'decision') continue;
      if (c.status === 'PASS') continue;
      const e = fails.get(c.name) ?? { count: 0, warnCount: 0 };
      if (c.status === 'FAIL') e.count++;
      else e.warnCount++;
      fails.set(c.name, e);
    }
  }
  const failedChecks = Array.from(fails.entries())
    .map(([name, v]) => ({ name, ...v }))
    .filter((f) => f.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const highRisk = records.filter((r) => r.response.risk_level === 'HIGH' || r.response.risk_level === 'CRITICAL');
  return { total, allow, block, review, pct: (n) => (total ? Math.round((n / total) * 100) : 0), risk, failedChecks, highRisk };
}
