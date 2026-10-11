/**
 * In-browser mock of the TrustLayer API, used when VITE_USE_MOCKS=true.
 * Mirrors the HTTP client's method names so the store can swap them.
 */
import { evaluateLocally } from './evaluationSimulator';
import { newId } from '@/lib/ids';
import type { AnyPolicy, ApiExchange, EvaluationRequest, EvaluationResponse, PolicyPatch, PolicySet } from '@/types';

/** Short artificial latency so loading states are visible; the evaluation itself is instant. */
const MOCK_LATENCY_MS = 250;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function createMockClient(getPolicySet: () => PolicySet) {
  return {
    /** Evaluates in the browser. The optional trace gets a clearly-marked simulated exchange. */
    async evaluate(payload: EvaluationRequest, trace?: ApiExchange[]): Promise<EvaluationResponse> {
      const startedAt = new Date().toISOString();
      const response: EvaluationResponse = {
        ...evaluateLocally(payload, getPolicySet()),
        agent_id: payload.agent_id,
        action: payload.action,
      };
      trace?.push({
        id: newId('xchg'),
        method: 'LOCAL',
        path: 'evaluateLocally()',
        url: 'in-browser mock engine (no HTTP request)',
        started_at: startedAt,
        request_body: payload,
        ok: true,
        response_body: response,
        simulated: true,
      });
      return delay(response);
    },

    async getPolicies(): Promise<PolicySet> {
      return delay(structuredClone(getPolicySet()), 0);
    },

    /** Returns the patched policy; the store persists it and bumps the version. */
    async updatePolicy(id: string, patch: PolicyPatch): Promise<AnyPolicy> {
      const current = getPolicySet().policies.find((p) => p.id === id);
      if (!current) throw new Error(`Unknown policy ${id}`);
      return delay(applyPolicyPatch(current, patch), 120);
    },
  };
}

export type MockClient = ReturnType<typeof createMockClient>;

export function applyPolicyPatch(policy: AnyPolicy, patch: PolicyPatch, now = new Date().toISOString()): AnyPolicy {
  return {
    ...policy,
    enabled: patch.enabled ?? policy.enabled,
    config: patch.config ? { ...policy.config, ...patch.config } : policy.config,
    updated_at: now,
  } as AnyPolicy;
}
