import { POLICY_SET_ID } from '@/data/policies';
import type { AttackForm } from '@/data/scenarios';
import type { EvaluationRequest, ActionParameters } from '@/types';

/** Build a contract-shaped request from the editable Attack Lab form. */
export function formToRequest(form: AttackForm, evidenceId = 'evidence-001'): EvaluationRequest {
  const parameters: ActionParameters = {};
  if (form.product_id) parameters.product_id = form.product_id;
  if (form.product_name) parameters.product_name = form.product_name;
  if (form.action_type === 'place_order' || form.price > 0) {
    parameters.price = Number.isFinite(form.price) ? Number(form.price) : 0;
    parameters.currency = 'USD';
  }
  if (form.vendor) parameters.vendor = form.vendor;

  return {
    agent_id: form.agent_id,
    intent: form.intent,
    action: { type: form.action_type, parameters },
    evidence: form.evidence_text.trim() ? [{ id: evidenceId, source: form.evidence_source, content: form.evidence_text }] : [],
    policy_id: POLICY_SET_ID,
    context: { permissions: form.permissions, agent_reasoning: form.reasoning },
  };
}
