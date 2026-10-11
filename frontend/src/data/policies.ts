import type { AnyPolicy, PolicySet } from '@/types';

export const POLICY_SET_ID = 'shopping-default';

export const POLICY_IDS = {
  spending: 'pol-spending-limit',
  vendors: 'pol-vendor-allowlist',
  restricted: 'pol-restricted-actions',
  evidence: 'pol-untrusted-evidence',
  review: 'pol-human-review',
} as const;

export function defaultPolicies(now = new Date().toISOString()): AnyPolicy[] {
  return [
    {
      id: POLICY_IDS.spending,
      kind: 'spending_limit',
      name: 'Maximum purchase amount',
      summary: 'Orders above the limit are blocked.',
      description:
        'Any place_order action whose total price exceeds the configured maximum is blocked before it reaches the checkout tool. The agent is offered compliant alternatives instead.',
      enabled: true,
      severity: 'HIGH',
      config: { max_amount: 80, currency: 'USD' },
      updated_at: now,
    },
    {
      id: POLICY_IDS.vendors,
      kind: 'vendor_allowlist',
      name: 'Allowed vendors only',
      summary: 'Purchases are limited to approved vendors.',
      description:
        'Orders may only be placed with vendors on the allowlist. Unknown or unapproved vendors are blocked, regardless of price.',
      enabled: true,
      severity: 'HIGH',
      config: { allowed_vendors: ['AudioMart', 'Approved Audio', 'SoundDepot'] },
      updated_at: now,
    },
    {
      id: POLICY_IDS.restricted,
      kind: 'restricted_actions',
      name: 'Restricted tool actions',
      summary: 'Sensitive tools can never be called autonomously.',
      description:
        'Actions on this list are denied for every agent even if the agent profile claims the permission. They require a separate, human-initiated workflow.',
      enabled: true,
      severity: 'CRITICAL',
      config: { restricted_actions: ['update_payment_method', 'change_shipping_address', 'delete_order_history'] },
      updated_at: now,
    },
    {
      id: POLICY_IDS.evidence,
      kind: 'untrusted_evidence',
      name: 'Untrusted evidence review',
      summary: 'Third-party content is scanned for instruction-like text.',
      description:
        'Evidence from reviews, listings and vendor pages is treated as untrusted data. Content that looks like instructions to an AI system (prompt injection) is flagged and never followed.',
      enabled: true,
      severity: 'MEDIUM',
      config: { scan_sources: ['product_review', 'product_listing', 'vendor_page', 'search_result'] },
      updated_at: now,
    },
    {
      id: POLICY_IDS.review,
      kind: 'human_review',
      name: 'Human review for flagged actions',
      summary: 'Flagged actions are routed to a human instead of executing.',
      description:
        'When an action passes hard policy checks but carries evidence warnings, it is held for human review. If this policy is disabled, flagged actions fail closed and are blocked.',
      enabled: true,
      severity: 'MEDIUM',
      config: { escalate_on: ['evidence_warning'] },
      updated_at: now,
    },
  ];
}

export function defaultPolicySet(now = new Date().toISOString()): PolicySet {
  return {
    id: POLICY_SET_ID,
    name: 'Shopping — default',
    version: 1,
    updated_at: now,
    policies: defaultPolicies(now),
  };
}
