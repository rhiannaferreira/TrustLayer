import { submitToGateway, authorizeExecution } from '../toolGateway';
import { evaluateLocally } from '../evaluationSimulator';
import { defaultPolicySet } from '@/data/policies';
import { getScenario, type ScenarioId } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { buildRecord } from '@/lib/records';
import type { EvaluationRecord } from '@/types';

function recordFor(id: ScenarioId): EvaluationRecord {
  const request = formToRequest(getScenario(id).form);
  const response = evaluateLocally(request, defaultPolicySet());
  return buildRecord({ request, response, source: 'mock', origin: 'attack-lab', policyVersion: 1, submittedAt: response.created_at });
}

describe('simulated tool gateway', () => {
  it('refuses a blocked action', () => {
    const result = submitToGateway(recordFor('budget'));
    expect(result.status).toBe('REFUSED');
    expect(result.reference).toBeUndefined();
  });

  it('refuses a blocked action even if a review was approved', () => {
    const record = { ...recordFor('unauthorized'), review: { status: 'APPROVED' as const } };
    expect(authorizeExecution(record).allowed).toBe(false);
  });

  it('refuses REVIEW_REQUIRED until an approval is recorded', () => {
    const record = recordFor('injection');
    expect(submitToGateway(record).status).toBe('REFUSED');
    expect(submitToGateway({ ...record, review: { status: 'PENDING' } }).status).toBe('REFUSED');
    expect(submitToGateway({ ...record, review: { status: 'REJECTED' } }).status).toBe('REFUSED');
    const approved = submitToGateway({ ...record, review: { status: 'APPROVED', resolved_by: 'demo-operator' } });
    expect(approved.status).toBe('EXECUTED');
  });

  it('executes an approved action through the simulated checkout', () => {
    const result = submitToGateway(recordFor('valid'));
    expect(result.status).toBe('EXECUTED');
    expect(result.reference).toMatch(/^sim-order-/);
    expect(result.message).toMatch(/No real payment/);
  });

  it('holds an allowed action while a requested review is pending', () => {
    const record = { ...recordFor('valid'), review: { status: 'PENDING' as const } };
    expect(submitToGateway(record).status).toBe('REFUSED');
  });
});
