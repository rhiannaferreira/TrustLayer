import type { CheckStatus, EvaluationCheck, StageId } from '@/types';

export type StageState = 'idle' | 'processing' | 'passed' | 'failed' | 'warning' | 'skipped';

export interface StageDefinition {
  id: StageId;
  title: string;
  description: string;
}

export const PIPELINE_STAGES: StageDefinition[] = [
  { id: 'receive', title: 'Receive agent action', description: 'Parse the proposed tool call, parameters and stated intent.' },
  { id: 'permissions', title: 'Validate permissions', description: 'Confirm the agent may use this tool, with this vendor.' },
  { id: 'evidence', title: 'Verify evidence', description: 'Treat third-party content as untrusted and scan it for manipulation.' },
  { id: 'quality', title: 'Assess decision quality', description: 'Compare against the user’s goal and better available options.' },
  { id: 'risk', title: 'Evaluate risk', description: 'Apply spending policy and aggregate risk signals.' },
  { id: 'decision', title: 'Produce final decision', description: 'Approve, block, or escalate to a human reviewer.' },
];

const KEYWORDS: Array<[StageId, RegExp]> = [
  ['receive', /schema|intent|receiv|parse|format/i],
  ['permissions', /permission|authori[sz]|tool|vendor|restricted|access|scope/i],
  ['evidence', /evidence|inject|untrusted|source|manipulat|review content/i],
  ['quality', /quality|alternative|value|alignment|compar|depth/i],
  ['risk', /spend|budget|limit|risk|amount|price/i],
  ['decision', /final|decision|overall/i],
];

/** Assign a stage to a check. Backend checks may omit `stage`; fall back to keywords. */
export function stageForCheck(check: EvaluationCheck): StageId {
  if (check.stage && PIPELINE_STAGES.some((s) => s.id === check.stage)) return check.stage;
  for (const [stage, re] of KEYWORDS) if (re.test(check.name)) return stage;
  return 'risk';
}

export function groupChecksByStage(checks: EvaluationCheck[]): Record<StageId, EvaluationCheck[]> {
  const groups = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, [] as EvaluationCheck[]])) as Record<StageId, EvaluationCheck[]>;
  for (const c of checks) groups[stageForCheck(c)].push(c);
  return groups;
}

export function worstStatus(statuses: CheckStatus[]): CheckStatus | undefined {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('WARN')) return 'WARN';
  if (statuses.includes('PASS')) return 'PASS';
  return undefined;
}

export function stageStateFromChecks(checks: EvaluationCheck[]): StageState {
  const worst = worstStatus(checks.map((c) => c.status));
  if (worst === 'FAIL') return 'failed';
  if (worst === 'WARN') return 'warning';
  if (worst === 'PASS') return 'passed';
  return 'skipped';
}
