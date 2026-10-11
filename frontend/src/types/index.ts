/**
 * TrustLayer shared types.
 *
 * The wire types (EvaluationRequest / EvaluationResponse / Policy / AuditEvent) mirror the
 * backend contract documented in BACKEND_INTEGRATION.md. Everything prefixed with
 * "Local" or living on EvaluationRecord is frontend-only bookkeeping.
 */

// ---------------------------------------------------------------------------
// Enumerations (wire values)
// ---------------------------------------------------------------------------

export type Decision = 'ALLOW' | 'BLOCK' | 'REVIEW_REQUIRED';
export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FlagSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export const DECISIONS: Decision[] = ['ALLOW', 'BLOCK', 'REVIEW_REQUIRED'];
export const RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Tool actions an agent may propose. Backends may send other strings. */
export type ActionType =
  | 'search_products'
  | 'compare_prices'
  | 'place_order'
  | 'update_payment_method'
  | 'change_shipping_address'
  | 'issue_refund'
  | 'delete_order_history'
  | (string & {});

// ---------------------------------------------------------------------------
// Evaluation request
// ---------------------------------------------------------------------------

export interface ActionParameters {
  product_id?: string;
  product_name?: string;
  price?: number;
  currency?: string;
  vendor?: string;
  quantity?: number;
  [key: string]: unknown;
}

export interface AgentAction {
  type: ActionType;
  parameters: ActionParameters;
}

export type EvidenceSource = 'product_review' | 'product_listing' | 'vendor_page' | 'search_result' | 'user_message' | (string & {});

export interface EvidenceItem {
  id: string;
  source: EvidenceSource;
  content: string;
  url?: string;
}

export interface EvaluationContext {
  /** Tool permissions granted to the agent for this run. */
  permissions?: string[];
  /** Free-form agent reasoning, kept for the audit record. */
  agent_reasoning?: string;
}

export interface EvaluationRequest {
  agent_id: string;
  intent: string;
  action: AgentAction;
  evidence: EvidenceItem[];
  policy_id: string;
  context?: EvaluationContext;
}

// ---------------------------------------------------------------------------
// Evaluation response
// ---------------------------------------------------------------------------

export type StageId = 'receive' | 'permissions' | 'evidence' | 'quality' | 'risk' | 'decision';

export interface EvaluationCheck {
  name: string;
  status: CheckStatus;
  reason: string;
  /** Optional: which pipeline stage this check belongs to. */
  stage?: StageId;
  /** Optional: policy that produced this check. */
  policy_id?: string;
}

export interface EvidenceFlag {
  evidence_id: string;
  type: string;
  severity: FlagSeverity;
  description: string;
  /** Exact substring of the evidence content that triggered the flag. */
  matched_text?: string;
  /** Character offsets into the evidence content. */
  start?: number;
  end?: number;
}

export interface Alternative {
  product_id: string;
  name: string;
  price: number;
  vendor: string;
  reason?: string;
}

export interface EvaluationResponse {
  evaluation_id: string;
  decision: Decision;
  risk_level: RiskLevel;
  checks: EvaluationCheck[];
  reason: string;
  evidence_flags: EvidenceFlag[];
  alternatives: Alternative[];
  execution_allowed: boolean;
  created_at: string;
  policy_version?: number;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type PolicyKind = 'spending_limit' | 'vendor_allowlist' | 'restricted_actions' | 'untrusted_evidence' | 'human_review';

export interface SpendingLimitConfig {
  max_amount: number;
  currency: string;
}
export interface VendorAllowlistConfig {
  allowed_vendors: string[];
}
export interface RestrictedActionsConfig {
  restricted_actions: string[];
}
export interface UntrustedEvidenceConfig {
  scan_sources: string[];
}
export interface HumanReviewConfig {
  /** When disabled, flagged actions fail closed (BLOCK) instead of going to review. */
  escalate_on: Array<'evidence_warning'>;
}

export interface PolicyConfigMap {
  spending_limit: SpendingLimitConfig;
  vendor_allowlist: VendorAllowlistConfig;
  restricted_actions: RestrictedActionsConfig;
  untrusted_evidence: UntrustedEvidenceConfig;
  human_review: HumanReviewConfig;
}

export interface Policy<K extends PolicyKind = PolicyKind> {
  id: string;
  kind: K;
  name: string;
  summary: string;
  description: string;
  enabled: boolean;
  severity: RiskLevel;
  config: PolicyConfigMap[K];
  updated_at: string;
}

export type AnyPolicy = { [K in PolicyKind]: Policy<K> }[PolicyKind];

export interface PolicySet {
  id: string;
  name: string;
  version: number;
  updated_at: string;
  policies: AnyPolicy[];
}

export interface PolicyPatch {
  enabled?: boolean;
  config?: Partial<PolicyConfigMap[PolicyKind]>;
}

// ---------------------------------------------------------------------------
// Agents & catalog (demo data)
// ---------------------------------------------------------------------------

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  description: string;
  permissions: string[];
  model_label: string;
}

export interface Product {
  id: string;
  name: string;
  category: 'headphones';
  price: number;
  vendor: string;
  rating: number;
  review_count: number;
  features: string[];
}

// ---------------------------------------------------------------------------
// Frontend records
// ---------------------------------------------------------------------------

export type DataSource = 'mock' | 'api';
export type RecordOrigin = 'playground' | 'attack-lab' | 'seed' | 'remote';

export type ReviewStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ReviewState {
  status: ReviewStatus;
  requested_at?: string;
  resolved_at?: string;
  /** Always "demo-operator" in mock mode — never a real reviewer. */
  resolved_by?: string;
  note?: string;
}

export type ExecutionStatus = 'NOT_ATTEMPTED' | 'EXECUTED' | 'REFUSED' | 'ERROR';

export interface ExecutionResult {
  status: Exclude<ExecutionStatus, 'NOT_ATTEMPTED'>;
  at: string;
  gateway: string;
  message: string;
  /** Simulated order reference when status is EXECUTED. */
  reference?: string;
}

export type TimelineKind =
  | 'PROPOSED'
  | 'SUBMITTED'
  | 'EVALUATED'
  | 'AUTHORIZATION'
  | 'EXECUTION_REFUSED'
  | 'EXECUTED'
  | 'EXECUTION_ERROR'
  | 'REVIEW_REQUESTED'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'RETRY_CREATED';

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  label: string;
  detail?: string;
}

export interface EvaluationRecord {
  id: string;
  request: EvaluationRequest;
  response: EvaluationResponse;
  source: DataSource;
  origin: RecordOrigin;
  agent_name: string;
  scenario?: string;
  policy_version: number;
  review: ReviewState;
  execution: ExecutionResult | null;
  timeline: TimelineEvent[];
  retry_of?: string;
  /** True for the small, labelled seed dataset created by Reset Demo. */
  seeded?: boolean;
}

/** Shape returned by GET /api/v1/audit-events (and derived locally in mock mode). */
export interface AuditEvent {
  event_id: string;
  evaluation_id: string;
  timestamp: string;
  agent_id: string;
  action: AgentAction;
  checks: EvaluationCheck[];
  policy_version: number | null;
  decision: Decision;
  risk_level: RiskLevel;
  execution_status: ExecutionStatus;
  explanation: string;
  review_state: ReviewStatus;
  source: DataSource;
}

export interface ApiErrorInfo {
  message: string;
  status?: number;
  endpoint: string;
  detail?: unknown;
}
