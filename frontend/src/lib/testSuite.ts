/**
 * Test Console suite: scenario cases that run against whichever backend is active.
 * Cases only use the app store's normal paths (evaluate, review, execute), so every run also
 * appears in history, and nothing here can bypass server-side authorization.
 */
import type { EvaluationRecord, EvaluationRequest, ExecutionResult } from '@/types';

export type Scenario = 'valid' | 'budget' | 'prompt_injection' | 'unauthorized';
export type CaseStatus = 'idle' | 'running' | 'pass' | 'fail' | 'error';

export interface Ops {
  /** Build the request for a scenario (backend proposal in live mode, local fixture in demo mode). */
  request: (scenario: Scenario) => Promise<EvaluationRequest>;
  evaluate: (request: EvaluationRequest, useAi: boolean) => Promise<EvaluationRecord>;
  execute: (id: string) => Promise<ExecutionResult>;
  approve: (id: string) => Promise<void>;
  /** Latest copy of a record (after execute / review). */
  get: (id: string) => EvaluationRecord | undefined;
}

export interface CaseOutcome {
  pass: boolean;
  /** What was observed, shown whether or not the case passed. */
  actual: string;
  evaluationId?: string;
}

export interface TestCase {
  id: string;
  title: string;
  expectation: string;
  liveOnly?: boolean;
  run: (ops: Ops, ctx: Ctx) => Promise<CaseOutcome>;
}

/** Records shared between cases, so later cases can build on earlier ones. */
export interface Ctx {
  records: Partial<Record<string, EvaluationRecord>>;
}

const decisionOf = (r: EvaluationRecord) => `${r.response.decision} (execution_allowed=${r.response.execution_allowed})`;

async function evaluateScenario(ops: Ops, ctx: Ctx, key: string, scenario: Scenario, useAi = false) {
  const record = await ops.evaluate(await ops.request(scenario), useAi);
  ctx.records[key] = record;
  return record;
}

export const TEST_CASES: TestCase[] = [
  {
    id: 'valid',
    title: 'Valid purchase is approved',
    expectation: 'decision ALLOW, execution_allowed true',
    run: async (ops, ctx) => {
      const r = await evaluateScenario(ops, ctx, 'valid', 'valid');
      return { pass: r.response.decision === 'ALLOW' && r.response.execution_allowed, actual: decisionOf(r), evaluationId: r.id };
    },
  },
  {
    id: 'budget',
    title: 'Over-budget purchase is blocked',
    expectation: 'decision BLOCK, execution_allowed false, a failed spending check',
    run: async (ops, ctx) => {
      const r = await evaluateScenario(ops, ctx, 'budget', 'budget');
      const spendFail = r.response.checks.some((c) => /spend|budget|limit/i.test(c.name) && c.status === 'FAIL');
      return { pass: r.response.decision === 'BLOCK' && !r.response.execution_allowed && spendFail, actual: `${decisionOf(r)}; spending check ${spendFail ? 'failed' : 'did not fail'}`, evaluationId: r.id };
    },
  },
  {
    id: 'unauthorized',
    title: 'Unauthorized tool action is blocked',
    expectation: 'decision BLOCK, execution_allowed false',
    run: async (ops, ctx) => {
      const r = await evaluateScenario(ops, ctx, 'unauthorized', 'unauthorized');
      return { pass: r.response.decision === 'BLOCK' && !r.response.execution_allowed, actual: decisionOf(r), evaluationId: r.id };
    },
  },
  {
    id: 'injection',
    title: 'Prompt injection in evidence needs review',
    expectation: 'decision REVIEW_REQUIRED, at least one evidence flag, execution_allowed false',
    run: async (ops, ctx) => {
      const r = await evaluateScenario(ops, ctx, 'injection', 'prompt_injection');
      const flags = r.response.evidence_flags.length;
      return { pass: r.response.decision === 'REVIEW_REQUIRED' && flags > 0 && !r.response.execution_allowed, actual: `${decisionOf(r)}; ${flags} evidence flag(s)`, evaluationId: r.id };
    },
  },
  {
    id: 'exec-blocked',
    title: 'Gateway refuses a blocked action',
    expectation: 'execution result REFUSED (HTTP 403 in live mode)',
    run: async (ops, ctx) => {
      const rec = ctx.records.budget;
      if (!rec) return { pass: false, actual: 'Skipped: the over-budget case did not produce an evaluation.' };
      const x = await ops.execute(rec.id);
      return { pass: x.status === 'REFUSED' && (x.http_status === undefined || x.http_status === 403), actual: `${x.status}${x.http_status ? ` HTTP ${x.http_status}` : ''}: ${x.message}`, evaluationId: rec.id };
    },
  },
  {
    id: 'exec-before-review',
    title: 'Gateway refuses a flagged action before review',
    expectation: 'execution result REFUSED until a human approves',
    run: async (ops, ctx) => {
      const rec = ctx.records.injection;
      if (!rec) return { pass: false, actual: 'Skipped: the injection case did not produce an evaluation.' };
      const x = await ops.execute(rec.id);
      return { pass: x.status === 'REFUSED', actual: `${x.status}${x.http_status ? ` HTTP ${x.http_status}` : ''}: ${x.message}`, evaluationId: rec.id };
    },
  },
  {
    id: 'exec-approved',
    title: 'Gateway executes an approved action',
    expectation: 'execution result EXECUTED (simulated), HTTP 200 in live mode',
    run: async (ops, ctx) => {
      const rec = ctx.records.valid;
      if (!rec) return { pass: false, actual: 'Skipped: the valid-purchase case did not produce an evaluation.' };
      const x = await ops.execute(rec.id);
      return { pass: x.status === 'EXECUTED' && (x.http_status === undefined || x.http_status === 200), actual: `${x.status}${x.http_status ? ` HTTP ${x.http_status}` : ''}${x.reference ? ` ref ${x.reference}` : ''}`, evaluationId: rec.id };
    },
  },
  {
    id: 'exec-duplicate',
    title: 'Second execution of the same authorization is refused',
    expectation: 'duplicate refused (HTTP 409 in live mode); first execution stays EXECUTED',
    run: async (ops, ctx) => {
      const rec = ctx.records.valid;
      if (!rec) return { pass: false, actual: 'Skipped: the valid-purchase case did not produce an evaluation.' };
      const x = await ops.execute(rec.id);
      const still = ops.get(rec.id)?.execution?.status;
      return { pass: x.status === 'REFUSED' && x.duplicate === true && still === 'EXECUTED', actual: `${x.status}${x.http_status ? ` HTTP ${x.http_status}` : ''}, duplicate=${String(x.duplicate)}; record still ${still}`, evaluationId: rec.id };
    },
  },
  {
    id: 'review-approve',
    title: 'Human approval unlocks a flagged action',
    expectation: 'after approval the gateway executes it',
    run: async (ops, ctx) => {
      const rec = ctx.records.injection;
      if (!rec) return { pass: false, actual: 'Skipped: the injection case did not produce an evaluation.' };
      await ops.approve(rec.id);
      const x = await ops.execute(rec.id);
      return { pass: x.status === 'EXECUTED', actual: `${x.status}${x.http_status ? ` HTTP ${x.http_status}` : ''}: ${x.message}`, evaluationId: rec.id };
    },
  },
  {
    id: 'ai-honesty',
    title: 'AI analysis status is reported honestly',
    expectation: 'completed → analysis present; error → ai_error present; never both missing',
    liveOnly: true,
    run: async (ops, ctx) => {
      const r = await evaluateScenario(ops, ctx, 'ai', 'prompt_injection', true);
      const s = r.response.ai_status ?? 'missing';
      const analysis = r.response.ai_analysis !== null && r.response.ai_analysis !== undefined && r.response.ai_analysis !== '';
      const err = Boolean(r.response.ai_error);
      const consistent = (s === 'completed' && analysis) || (/error|fail|unavailable/i.test(s) && err);
      return { pass: consistent, actual: `ai_status=${s}; analysis ${analysis ? 'present' : 'absent'}; ai_error ${err ? `"${r.response.ai_error}"` : 'absent'}`, evaluationId: r.id };
    },
  },
];
