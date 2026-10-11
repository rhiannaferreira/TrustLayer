import { ATTACK_SCENARIOS } from '@/data/scenarios';
import { evaluateLocally } from '@/services/evaluationSimulator';
import { submitToGateway } from '@/services/toolGateway';
import { buildRecord, withExecution } from '@/lib/records';
import { formToRequest } from '@/lib/requestBuilder';
import type { EvaluationRecord, PolicySet } from '@/types';

/**
 * A deliberately small, clearly labelled seed dataset so the dashboard is not empty on first
 * load. Records are evaluated by the same mock engine and stamped with the real creation time.
 */
export function createSeedRecords(policySet: PolicySet, now = new Date()): EvaluationRecord[] {
  const ids: Array<'valid' | 'budget' | 'injection'> = ['valid', 'budget', 'injection'];
  return ids
    .map((id, i) => {
      const scenario = ATTACK_SCENARIOS.find((s) => s.id === id)!;
      const at = new Date(now.getTime() + i);
      const request = formToRequest(scenario.form, `seed-evidence-${i + 1}`);
      const response = evaluateLocally(request, policySet, { now: at, evaluationId: `eval-seed-${i + 1}` });
      const record = buildRecord({
        request,
        response,
        source: 'mock',
        origin: 'seed',
        policyVersion: policySet.version,
        scenario: scenario.title,
        seeded: true,
        submittedAt: at.toISOString(),
      });
      return withExecution(record, submitToGateway(record, at));
    })
    .reverse();
}
