import { render, screen } from '@testing-library/react';
import { evaluateLocally } from '@/services/evaluationSimulator';
import { defaultPolicySet } from '@/data/policies';
import { getScenario, type ScenarioId } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { buildRecord, withExecution } from '@/lib/records';
import { compareEvaluations } from '@/lib/compare';
import { checkContract } from '@/lib/openapiCheck';
import { buildInvestigation, INVESTIGATION_NODES, nodeForCheck } from '@/lib/investigation';
import { canRequestExecution } from '@/components/evaluation/ExecutionPanel';
import { AiAnalysisView } from '@/components/evaluation/AiAnalysisView';
import type { EvaluationRecord } from '@/types';

function mockRecord(id: ScenarioId, patch: Record<string, unknown> = {}): EvaluationRecord {
  const form = { ...getScenario(id).form, ...patch };
  const request = formToRequest(form);
  const response = evaluateLocally(request, defaultPolicySet());
  return buildRecord({ request, response, source: 'mock', origin: 'attack-lab', policyVersion: 1, submittedAt: response.created_at });
}

function liveRecord(over: Partial<EvaluationRecord['response']>): EvaluationRecord {
  const base = mockRecord('valid');
  return { ...base, source: 'api', response: { ...base.response, ...over } };
}

describe('execution gating (UI hint only)', () => {
  it('blocked evaluations cannot request execution; approved ones can', () => {
    expect(canRequestExecution(mockRecord('budget'))).toBe(false);
    expect(canRequestExecution(mockRecord('valid'))).toBe(true);
    expect(canRequestExecution(liveRecord({ decision: 'BLOCK', execution_allowed: false }))).toBe(false);
    expect(canRequestExecution(liveRecord({ decision: 'ALLOW', execution_allowed: true }))).toBe(true);
  });

  it('a 409 duplicate is recorded without erasing the earlier execution', () => {
    const r = liveRecord({ execution_allowed: true });
    const once = withExecution(r, { status: 'EXECUTED', at: 't1', gateway: 'backend', message: 'ok', http_status: 200 });
    const twice = withExecution(once, { status: 'REFUSED', duplicate: true, at: 't2', gateway: 'backend', message: 'dup', http_status: 409 });
    expect(twice.execution?.status).toBe('EXECUTED');
    expect(twice.execution_attempts?.map((a) => a.http_status)).toEqual([200, 409]);
    expect(twice.timeline.at(-1)?.kind).toBe('EXECUTION_DUPLICATE');
    expect(canRequestExecution(twice)).toBe(false);
  });
});

describe('attack lab comparison', () => {
  it('reflects the changed input and the changed outcome', () => {
    const original = mockRecord('valid');
    const modified = mockRecord('valid', { price: 129 });
    const c = compareEvaluations(original, modified);
    expect(c.inputChanges.length).toBeGreaterThan(0);
    expect(c.decision).toMatchObject({ before: 'ALLOW', changed: true });
    expect(c.execution).toMatchObject({ before: true, after: false, changed: true });
    expect(c.outcomeUnchanged).toBe(false);
  });

  it('identical runs report no outcome change', () => {
    expect(compareEvaluations(mockRecord('valid'), mockRecord('valid')).outcomeUnchanged).toBe(true);
  });
});

describe('policy edits affect the next evaluation', () => {
  it('lowering the spending cap blocks a previously approved purchase', () => {
    const request = formToRequest(getScenario('valid').form);
    const set = defaultPolicySet();
    expect(evaluateLocally(request, set).decision).toBe('ALLOW');
    const price = Number((request.action.parameters as Record<string, unknown>).price);
    const tightened = {
      ...set,
      policies: set.policies.map((p) => (p.kind === 'spending_limit' ? { ...p, config: { ...p.config, max_amount: price - 1 } } : p)),
    } as typeof set;
    expect(evaluateLocally(request, tightened).decision).not.toBe('ALLOW');
  });
});

describe('investigation mapping', () => {
  it('builds all eight nodes and routes checks by name', () => {
    const model = buildInvestigation(mockRecord('budget'));
    expect(model.nodes.map((n) => n.id)).toEqual(INVESTIGATION_NODES.map((n) => n.id));
    expect(nodeForCheck({ name: 'Spending limit', status: 'FAIL', detail: '' } as never).node).toBe('spending');
  });
});

describe('OpenAPI contract check', () => {
  it('flags a missing required endpoint and missing response fields', () => {
    const spec = {
      paths: {
        '/api/v1/evaluations': {
          post: {
            requestBody: { content: { 'application/json': { schema: { properties: { agent_id: {}, action: {}, secret: {} }, required: ['secret'] } } } },
            responses: { '200': { content: { 'application/json': { schema: { properties: { evaluation_id: {}, decision: {} } } } } } },
          },
        },
      },
    };
    const r = checkContract(spec);
    expect(r.problems.some((p) => p.includes('/api/v1/actions/execute'))).toBe(true);
    expect(r.evaluationFields?.missing).toContain('execution_allowed');
    expect(r.problems.some((p) => p.includes('secret'))).toBe(true);
  });
});

describe('Luminal failures are reported honestly', () => {
  it('shows the failure and no findings when inference failed', () => {
    const r = liveRecord({ ai_status: 'failed', ai_error: 'Luminal timeout', ai_analysis: { summary: 'should not show as a finding' } });
    render(<AiAnalysisView record={r} />);
    expect(screen.getAllByText(/fail/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Luminal timeout/)).toBeInTheDocument();
  });
});
