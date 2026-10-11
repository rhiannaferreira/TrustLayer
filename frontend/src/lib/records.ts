import { agentName } from '@/data/agents';
import { actionLabel } from '@/data/agents';
import { DECISION_LABEL, formatCurrency } from '@/lib/format';
import type {
  AuditEvent,
  DataSource,
  EvaluationRecord,
  EvaluationRequest,
  EvaluationResponse,
  ExecutionResult,
  ExecutionStatus,
  RecordOrigin,
  ReviewStatus,
  TimelineEvent,
} from '@/types';

export function describeAction(request: EvaluationRequest): string {
  const p = request.action.parameters;
  if (request.action.type === 'place_order') {
    return `Buy ${p.product_name ?? p.product_id ?? 'item'} · ${formatCurrency(p.price)}`;
  }
  return actionLabel(request.action.type);
}

export function actionTarget(request: EvaluationRequest): string {
  const p = request.action.parameters;
  return (p.vendor as string | undefined) || (p.product_name as string | undefined) || '—';
}

interface BuildRecordInput {
  request: EvaluationRequest;
  response: EvaluationResponse;
  source: DataSource;
  origin: RecordOrigin;
  policyVersion: number;
  scenario?: string;
  retryOf?: string;
  seeded?: boolean;
  submittedAt: string;
}

export function buildRecord(input: BuildRecordInput): EvaluationRecord {
  const { request, response } = input;
  const timeline: TimelineEvent[] = [
    {
      at: input.submittedAt,
      kind: 'PROPOSED',
      label: 'Agent proposed action',
      detail: describeAction(request),
    },
    {
      at: input.submittedAt,
      kind: 'SUBMITTED',
      label: input.source === 'api' ? 'Submitted to TrustLayer API' : 'Submitted to local mock evaluator',
    },
    {
      at: response.created_at,
      kind: 'EVALUATED',
      label: `Evaluated: ${DECISION_LABEL[response.decision]}`,
      detail: response.reason,
    },
    {
      at: response.created_at,
      kind: 'AUTHORIZATION',
      label: response.execution_allowed ? 'Execution authorized' : 'Execution not authorized',
      detail: `${response.checks.length} checks · risk ${response.risk_level}`,
    },
  ];
  if (input.retryOf) {
    timeline.unshift({ at: input.submittedAt, kind: 'RETRY_CREATED', label: 'Retry with alternative', detail: `Derived from ${input.retryOf}` });
  }
  return {
    id: response.evaluation_id,
    request,
    response,
    source: input.source,
    origin: input.origin,
    agent_name: agentName(request.agent_id),
    scenario: input.scenario,
    policy_version: response.policy_version ?? input.policyVersion,
    review: { status: 'NONE' },
    execution: null,
    timeline,
    retry_of: input.retryOf,
    seeded: input.seeded,
  };
}

export function withExecution(record: EvaluationRecord, result: ExecutionResult): EvaluationRecord {
  const kind = result.status === 'EXECUTED' ? 'EXECUTED' : result.status === 'REFUSED' ? 'EXECUTION_REFUSED' : 'EXECUTION_ERROR';
  const label =
    result.status === 'EXECUTED' ? 'Simulated tool executed' : result.status === 'REFUSED' ? 'Gateway refused execution' : 'Execution error';
  return {
    ...record,
    execution: result,
    timeline: [...record.timeline, { at: result.at, kind, label, detail: result.message }],
  };
}

export function executionStatus(record: EvaluationRecord): ExecutionStatus {
  return record.execution?.status ?? 'NOT_ATTEMPTED';
}

export function effectiveReviewStatus(record: EvaluationRecord): ReviewStatus {
  if (record.review.status !== 'NONE') return record.review.status;
  return record.response.decision === 'REVIEW_REQUIRED' ? 'PENDING' : 'NONE';
}

export function needsReview(record: EvaluationRecord): boolean {
  return effectiveReviewStatus(record) === 'PENDING';
}

export function toAuditEvent(record: EvaluationRecord): AuditEvent {
  return {
    event_id: `audit-${record.id}`,
    evaluation_id: record.id,
    timestamp: record.response.created_at,
    agent_id: record.request.agent_id,
    action: record.request.action,
    checks: record.response.checks,
    policy_version: record.policy_version ?? null,
    decision: record.response.decision,
    risk_level: record.response.risk_level,
    execution_status: executionStatus(record),
    explanation: record.response.reason,
    review_state: effectiveReviewStatus(record),
    source: record.source,
  };
}
