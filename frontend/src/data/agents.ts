import type { AgentProfile } from '@/types';

/** Configured demo agents. These are static profiles, not live processes. */
export const AGENTS: AgentProfile[] = [
  {
    id: 'purchase-pilot',
    name: 'PurchasePilot',
    role: 'Autonomous purchasing agent',
    description: 'Researches products, compares vendors and proposes orders on behalf of a user.',
    permissions: ['search_products', 'compare_prices', 'place_order'],
    model_label: 'Rule-based demo planner',
  },
  {
    id: 'support-sentinel',
    name: 'SupportSentinel',
    role: 'Customer support agent',
    description: 'Handles post-purchase support requests and proposes refunds for review.',
    permissions: ['search_products', 'issue_refund'],
    model_label: 'Profile only — no planner in demo',
  },
  {
    id: 'ledger-ops',
    name: 'LedgerOps',
    role: 'Back-office operations agent',
    description: 'Reconciles orders and maintains account records. Never authorised to change payment data.',
    permissions: ['search_products', 'delete_order_history'],
    model_label: 'Profile only — no planner in demo',
  },
];

export const DEFAULT_AGENT_ID = 'purchase-pilot';

export function getAgent(id: string): AgentProfile | undefined {
  return AGENTS.find((a) => a.id === id);
}

export function agentName(id: string): string {
  return getAgent(id)?.name ?? id;
}

/** Every tool action the demo knows about, with human labels. */
export const ACTION_TYPES: Array<{ id: string; label: string; protected: boolean; description: string }> = [
  { id: 'search_products', label: 'Search products', protected: false, description: 'Read-only catalog search.' },
  { id: 'compare_prices', label: 'Compare prices', protected: false, description: 'Read-only price comparison.' },
  { id: 'place_order', label: 'Place order', protected: true, description: 'Spends money through the checkout tool.' },
  { id: 'issue_refund', label: 'Issue refund', protected: true, description: 'Moves money back to a customer.' },
  { id: 'update_payment_method', label: 'Update payment method', protected: true, description: 'Changes stored payment credentials.' },
  { id: 'change_shipping_address', label: 'Change shipping address', protected: true, description: 'Redirects where goods are delivered.' },
  { id: 'delete_order_history', label: 'Delete order history', protected: true, description: 'Destroys records needed for audit.' },
];

export function actionLabel(type: string): string {
  return ACTION_TYPES.find((a) => a.id === type)?.label ?? type;
}
