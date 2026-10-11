/**
 * HTTP client for the TrustLayer FastAPI backend.
 *
 * Contract: see BACKEND_INTEGRATION.md. This client never falls back to mock data —
 * any network, HTTP or shape error is surfaced to the caller as an ApiError.
 */
import { ENDPOINTS } from './endpoints';
import type {
  AnyPolicy,
  AuditEvent,
  EvaluationRequest,
  EvaluationResponse,
  ExecutionResult,
  ExecutionStatus,
  PolicyPatch,
  PolicySet,
  ReviewState,
  ReviewStatus,
} from '@/types';

export class ApiError extends Error {
  readonly status?: number;
  readonly endpoint: string;
  readonly detail?: unknown;

  constructor(message: string, endpoint: string, status?: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.endpoint = endpoint;
    this.status = status;
    this.detail = detail;
  }
}

/** Evaluation as listed by GET /api/v1/evaluations. */
export type RemoteEvaluation = EvaluationResponse & {
  request?: EvaluationRequest;
  agent_id?: string;
  review_state?: ReviewStatus;
  execution_status?: ExecutionStatus;
};

export interface HealthStatus {
  ok: boolean;
  latency_ms: number;
  detail?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function createHttpClient(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${base}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      throw new ApiError(
        aborted ? `Request timed out after ${timeoutMs / 1000}s` : `Could not reach the backend at ${base}. Is it running, and is CORS enabled?`,
        path,
      );
    }
    clearTimeout(timer);

    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const detail = typeof body === 'object' && body && 'detail' in body ? (body as { detail: unknown }).detail : body;
      const msg = typeof detail === 'string' ? detail : `HTTP ${res.status} ${res.statusText}`.trim();
      throw new ApiError(msg, path, res.status, body);
    }
    return body as T;
  }

  return {
    baseUrl: base,

    async health(): Promise<HealthStatus> {
      const started = performance.now();
      await request<unknown>(ENDPOINTS.health, { method: 'GET' }, 4_000);
      return { ok: true, latency_ms: Math.round(performance.now() - started) };
    },

    async evaluate(payload: EvaluationRequest): Promise<EvaluationResponse> {
      const body = await request<unknown>(ENDPOINTS.evaluations, { method: 'POST', body: JSON.stringify(payload) });
      return assertEvaluationResponse(body, ENDPOINTS.evaluations);
    },

    async listEvaluations(): Promise<RemoteEvaluation[]> {
      const body = await request<unknown>(ENDPOINTS.evaluations, { method: 'GET' });
      const items = unwrapList(body);
      return items.map((item) => assertEvaluationResponse(item, ENDPOINTS.evaluations) as RemoteEvaluation);
    },

    async getEvaluation(id: string): Promise<RemoteEvaluation> {
      const body = await request<unknown>(ENDPOINTS.evaluation(id), { method: 'GET' });
      return assertEvaluationResponse(body, ENDPOINTS.evaluation(id)) as RemoteEvaluation;
    },

    async getPolicies(): Promise<PolicySet> {
      return request<PolicySet>(ENDPOINTS.policies, { method: 'GET' });
    },

    async updatePolicy(id: string, patch: PolicyPatch): Promise<AnyPolicy> {
      return request<AnyPolicy>(ENDPOINTS.policy(id), { method: 'PATCH', body: JSON.stringify(patch) });
    },

    async listAuditEvents(): Promise<AuditEvent[]> {
      const body = await request<unknown>(ENDPOINTS.auditEvents, { method: 'GET' });
      return unwrapList(body) as AuditEvent[];
    },

    async requestReview(evaluationId: string, note?: string): Promise<ReviewState> {
      return request<ReviewState>(ENDPOINTS.evaluationReview(evaluationId), { method: 'POST', body: JSON.stringify({ note }) });
    },

    async execute(evaluationId: string): Promise<ExecutionResult> {
      return request<ExecutionResult>(ENDPOINTS.executions, { method: 'POST', body: JSON.stringify({ evaluation_id: evaluationId }) });
    },
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

function unwrapList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) return (body as { items: unknown[] }).items;
  throw new ApiError('Expected a JSON array or { "items": [...] }', 'list');
}

const DECISION_VALUES = ['ALLOW', 'BLOCK', 'REVIEW_REQUIRED'];
const RISK_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Light runtime validation so a contract mismatch produces a readable error, not a blank screen. */
export function assertEvaluationResponse(value: unknown, endpoint: string): EvaluationResponse {
  const problems: string[] = [];
  const v = value as Partial<EvaluationResponse> | null;
  if (!v || typeof v !== 'object') throw new ApiError('Response is not a JSON object', endpoint, undefined, value);
  if (typeof v.evaluation_id !== 'string') problems.push('evaluation_id must be a string');
  if (!DECISION_VALUES.includes(v.decision as string)) problems.push(`decision must be one of ${DECISION_VALUES.join(', ')}`);
  if (!RISK_VALUES.includes(v.risk_level as string)) problems.push(`risk_level must be one of ${RISK_VALUES.join(', ')}`);
  if (!Array.isArray(v.checks)) problems.push('checks must be an array');
  if (typeof v.execution_allowed !== 'boolean') problems.push('execution_allowed must be a boolean');
  if (problems.length) throw new ApiError(`Response does not match the evaluation contract: ${problems.join('; ')}`, endpoint, undefined, value);
  return {
    reason: '',
    evidence_flags: [],
    alternatives: [],
    created_at: new Date().toISOString(),
    ...v,
  } as EvaluationResponse;
}
