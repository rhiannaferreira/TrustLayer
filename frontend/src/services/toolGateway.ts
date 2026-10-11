/**
 * Simulated tool gateway.
 *
 * Every execution request goes through `submitToGateway`, which independently re-checks the
 * authorization decision before touching the (simulated) tool. A BLOCK is always refused; a
 * REVIEW_REQUIRED action is refused unless a subsequent review approval is recorded.
 *
 * In production this enforcement must live server-side — frontend checks are not a
 * security boundary. Nothing here contacts a real store or payment provider.
 */
import { newId } from '@/lib/ids';
import { formatCurrency } from '@/lib/format';
import type { EvaluationRecord, ExecutionResult } from '@/types';

export const GATEWAY_NAME = 'simulated-tool-gateway';

export interface GatewayVerdict {
  allowed: boolean;
  reason: string;
}

export function authorizeExecution(record: Pick<EvaluationRecord, 'response' | 'review'>): GatewayVerdict {
  const { response, review } = record;
  if (response.decision === 'BLOCK') {
    return { allowed: false, reason: 'Refused: TrustLayer blocked this action.' };
  }
  if (review.status === 'REJECTED') {
    return { allowed: false, reason: 'Refused: a reviewer rejected this action.' };
  }
  if (review.status === 'PENDING') {
    return { allowed: false, reason: 'Refused: human review is pending.' };
  }
  if (response.decision === 'REVIEW_REQUIRED') {
    return review.status === 'APPROVED'
      ? { allowed: true, reason: 'Authorized by a recorded review approval.' }
      : { allowed: false, reason: 'Refused: review required and no approval recorded.' };
  }
  if (!response.execution_allowed) {
    return { allowed: false, reason: 'Refused: evaluation did not grant execution.' };
  }
  return { allowed: true, reason: 'Authorized by TrustLayer evaluation.' };
}

/** Run the simulated tool if (and only if) the gateway authorizes it. */
export function submitToGateway(record: EvaluationRecord, now = new Date()): ExecutionResult {
  const verdict = authorizeExecution(record);
  const at = now.toISOString();
  if (!verdict.allowed) {
    return { status: 'REFUSED', at, gateway: GATEWAY_NAME, message: verdict.reason };
  }
  return runSimulatedTool(record, at);
}

function runSimulatedTool(record: EvaluationRecord, at: string): ExecutionResult {
  const { action } = record.request;
  const p = action.parameters;
  if (action.type === 'place_order') {
    return {
      status: 'EXECUTED',
      at,
      gateway: GATEWAY_NAME,
      reference: newId('sim-order'),
      message: `Simulated checkout completed: ${p.product_name ?? p.product_id ?? 'item'} for ${formatCurrency(p.price)} from ${p.vendor ?? 'vendor'}. No real payment was made.`,
    };
  }
  return {
    status: 'EXECUTED',
    at,
    gateway: GATEWAY_NAME,
    reference: newId('sim-call'),
    message: `Simulated ${action.type} call recorded. No real system was changed.`,
  };
}
