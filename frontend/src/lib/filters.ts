import { describeAction, actionTarget } from './records';
import type { Decision, EvaluationRecord, RiskLevel } from '@/types';

export type DecisionFilter = 'ALL' | Decision;

export interface ExtraFilters {
  risk?: RiskLevel[];
  /** Only records where a check with this name FAILED. */
  failedCheck?: string;
}

export function filterRecords(records: EvaluationRecord[], decision: DecisionFilter, query: string, extra: ExtraFilters = {}): EvaluationRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter((r) => {
    if (decision !== 'ALL' && r.response.decision !== decision) return false;
    if (extra.risk?.length && !extra.risk.includes(r.response.risk_level)) return false;
    if (extra.failedCheck && !r.response.checks.some((c) => c.name === extra.failedCheck && c.status === 'FAIL')) return false;
    if (!q) return true;
    const haystack = [
      r.id,
      r.agent_name,
      r.request.agent_id,
      r.request.action.type,
      describeAction(r.request),
      actionTarget(r.request),
      r.response.risk_level,
      r.response.decision,
      r.response.reason,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function decisionCounts(records: EvaluationRecord[]) {
  return {
    ALL: records.length,
    ALLOW: records.filter((r) => r.response.decision === 'ALLOW').length,
    BLOCK: records.filter((r) => r.response.decision === 'BLOCK').length,
    REVIEW_REQUIRED: records.filter((r) => r.response.decision === 'REVIEW_REQUIRED').length,
  };
}
