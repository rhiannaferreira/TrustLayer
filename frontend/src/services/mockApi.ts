/**
 * In-browser mock of the TrustLayer API, used when VITE_USE_MOCKS=true.
 * Mirrors the HTTP client's method names so the store can swap them.
 */
import { evaluateLocally } from './evaluationSimulator';
import type { AnyPolicy, EvaluationRequest, EvaluationResponse, PolicyPatch, PolicySet } from '@/types';

/** Short artificial latency so loading states are visible; the evaluation itself is instant. */
const MOCK_LATENCY_MS = 250;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function createMockClient(getPolicySet: () => PolicySet) {
  return {
    async evaluate(payload: EvaluationRequest): Promise<EvaluationResponse> {
      return delay(evaluateLocally(payload, getPolicySet()));
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
