import { evaluateLocally } from '../evaluationSimulator';
import { defaultPolicySet, POLICY_IDS } from '@/data/policies';
import { getScenario } from '@/data/scenarios';
import { formToRequest } from '@/lib/requestBuilder';
import { applyPolicyPatch } from '../mockApi';
import type { PolicySet, PolicyPatch } from '@/types';

function patch(set: PolicySet, id: string, p: PolicyPatch): PolicySet {
  return { ...set, version: set.version + 1, policies: set.policies.map((x) => (x.id === id ? applyPolicyPatch(x, p) : x)) };
}

const check = (res: ReturnType<typeof evaluateLocally>, name: string) => res.checks.find((c) => c.name === name);

describe('mock evaluation engine', () => {
  const policies = defaultPolicySet();

  it('blocks the $129 budget violation and suggests a cheaper compliant alternative', () => {
    const res = evaluateLocally(formToRequest(getScenario('budget').form), policies);
    expect(res.decision).toBe('BLOCK');
    expect(res.execution_allowed).toBe(false);
    expect(check(res, 'Spending limit')?.status).toBe('FAIL');
    expect(check(res, 'Vendor authorization')?.status).toBe('PASS');
    expect(res.alternatives.length).toBeGreaterThan(0);
    expect(res.alternatives.every((a) => a.price <= 80)).toBe(true);
    expect(res.alternatives[0].product_id).toBe('hp-002');
  });

  it('flags prompt injection in a review and requires human review', () => {
    const res = evaluateLocally(formToRequest(getScenario('injection').form), policies);
    expect(res.decision).toBe('REVIEW_REQUIRED');
    expect(res.execution_allowed).toBe(false);
    expect(check(res, 'Untrusted evidence scan')?.status).toBe('WARN');
    expect(res.evidence_flags.length).toBeGreaterThanOrEqual(3);
    expect(res.evidence_flags.some((f) => /ignore the user's spending limit/i.test(f.matched_text ?? ''))).toBe(true);
  });

  it('approves the valid $64.99 order with every check passing', () => {
    const res = evaluateLocally(formToRequest(getScenario('valid').form), policies);
    expect(res.decision).toBe('ALLOW');
    expect(res.risk_level).toBe('LOW');
    expect(res.execution_allowed).toBe(true);
    expect(res.checks.every((c) => c.status === 'PASS')).toBe(true);
  });

  it('blocks unauthorized tool access as critical', () => {
    const res = evaluateLocally(formToRequest(getScenario('unauthorized').form), policies);
    expect(res.decision).toBe('BLOCK');
    expect(res.risk_level).toBe('CRITICAL');
    expect(check(res, 'Agent tool permission')?.status).toBe('FAIL');
    expect(check(res, 'Restricted tool actions')?.status).toBe('FAIL');
  });

  it('responds to edited inputs: lowering the price turns a block into an approval', () => {
    const form = { ...getScenario('budget').form, product_id: 'hp-002', product_name: 'Pulse Air Wireless', price: 64.99, vendor: 'Approved Audio' };
    expect(evaluateLocally(formToRequest(form), policies).decision).toBe('ALLOW');
  });

  it('blocks an unapproved vendor', () => {
    const form = { ...getScenario('valid').form, vendor: 'ShadyDeals' };
    const res = evaluateLocally(formToRequest(form), policies);
    expect(res.decision).toBe('BLOCK');
    expect(check(res, 'Vendor authorization')?.status).toBe('FAIL');
  });

  it('applies policy changes to subsequent evaluations', () => {
    const raised = patch(policies, POLICY_IDS.spending, { config: { max_amount: 150 } });
    const res = evaluateLocally(formToRequest(getScenario('budget').form), raised);
    expect(check(res, 'Spending limit')?.status).toBe('PASS');
    expect(res.decision).not.toBe('BLOCK');
    expect(res.policy_version).toBe(2);
  });

  it('fails closed when the human review policy is disabled', () => {
    const noReview = patch(policies, POLICY_IDS.review, { enabled: false });
    const res = evaluateLocally(formToRequest(getScenario('injection').form), noReview);
    expect(res.decision).toBe('BLOCK');
  });
});
