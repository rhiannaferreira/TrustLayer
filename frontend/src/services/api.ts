/**
 * HTTP client for the TrustLayer FastAPI backend (Live Backend Mode).
 *
 * Contract: see BACKEND_INTEGRATION.md. This client never falls back to mock data — any
 * network, HTTP or shape error is surfaced to the caller. Every call can be traced into an
 * ApiExchange list so the UI can show the exact request and response JSON.
 */
import { ENDPOINTS } from './endpoints';
import {
  ContractError,
  describeErrorDetail,
  executionMessage,
  executionReference,
  isObj,
  normalizeAiStatus,
  normalizeCatalog,
  normalizeEvaluation,
  normalizePolicies,
  normalizeProposal,
  unwrapList,
  type AiServiceStatus,
  type LivePolicy,
  type LiveProposal,
  type NormalizedEvaluation,
} from './liveContract';
import { newId } from '@/lib/ids';
import type { AgentAction, ApiExchange, EvaluationRequest, ExecutionResult, Product } from '@/types';

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

export interface HealthStatus {
  ok: boolean;
  latency_ms: number;
  body?: unknown;
}

/** Array that HTTP calls append their exchange to. */
export type Trace = ApiExchange[];

export type ReviewOutcome = 'APPROVED' | 'REJECTED';

const DEFAULT_TIMEOUT_MS = 15_000;
/** AI-assisted evaluations can take longer than plain policy checks. */
const EVALUATION_TIMEOUT_MS = 60_000;

interface RawResponse {
  status: number;
  ok: boolean;
  body: unknown;
}

export function createHttpClient(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, '');

  /** Perform a request and return status + parsed body. Throws only on network/timeout. */
  async function raw(path: string, init: { method: string; body?: unknown }, trace?: Trace, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RawResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${base}${path}`;
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const exchange: ApiExchange = { id: newId('xchg'), method: init.method, path, url, started_at: startedAt, ok: false, request_body: init.body };
    trace?.push(exchange);
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError';
      const message = aborted
        ? `Request timed out after ${timeoutMs / 1000}s`
        : `Could not reach the backend at ${base || window.location.origin}. Is it running${base ? ', and is CORS enabled' : ' and is the dev proxy target correct'}?`;
      exchange.error = message;
      exchange.duration_ms = Math.round(performance.now() - started);
      throw new ApiError(message, path);
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
    exchange.status = res.status;
    exchange.ok = res.ok;
    exchange.response_body = body;
    exchange.duration_ms = Math.round(performance.now() - started);
    return { status: res.status, ok: res.ok, body };
  }

  /** Request that must succeed (2xx), otherwise throws ApiError with the backend's detail. */
  async function request(path: string, init: { method: string; body?: unknown }, trace?: Trace, timeoutMs?: number): Promise<unknown> {
    const res = await raw(path, init, trace, timeoutMs);
    if (!res.ok) {
      const msg = describeErrorDetail(res.body) ?? `HTTP ${res.status}`;
      const ex = trace?.[trace.length - 1];
      if (ex) ex.error = msg;
      throw new ApiError(msg, path, res.status, res.body);
    }
    return res.body;
  }

  function wrapContract<T>(fn: () => T, endpoint: string, trace?: Trace): T {
    try {
      return fn();
    } catch (err) {
      if (err instanceof ContractError) {
        const ex = trace?.[trace.length - 1];
        if (ex) ex.error = err.message;
        throw new ApiError(err.message, endpoint, undefined, err.raw);
      }
      throw err;
    }
  }

  return {
    baseUrl: base,

    async health(): Promise<HealthStatus> {
      const started = performance.now();
      const body = await request(ENDPOINTS.health, { method: 'GET' }, undefined, 4_000);
      return { ok: true, latency_ms: Math.round(performance.now() - started), body };
    },

    async openapi(): Promise<unknown> {
      return request(ENDPOINTS.openapi, { method: 'GET' }, undefined, 6_000);
    },

    async aiStatus(trace?: Trace): Promise<AiServiceStatus> {
      return normalizeAiStatus(await request(ENDPOINTS.aiStatus, { method: 'GET' }, trace, 6_000));
    },

    async catalog(trace?: Trace): Promise<Product[]> {
      const body = await request(ENDPOINTS.catalog, { method: 'GET' }, trace);
      const products = normalizeCatalog(body);
      if (!products) throw new ApiError('Catalog response is not a list of products', ENDPOINTS.catalog, undefined, body);
      return products;
    },

    /** Ask the backend agent for a proposal. The current backend answers from seeded scenarios. */
    async propose(input: { agent_id: string; intent: string; policy_id: string; scenario?: string }, trace?: Trace): Promise<LiveProposal> {
      const body = await request(ENDPOINTS.agentPropose, { method: 'POST', body: { agent_id: input.agent_id, intent: input.intent, ...(input.scenario ? { scenario: input.scenario } : {}) } }, trace);
      return wrapContract(() => normalizeProposal(body, input.intent, input.agent_id, input.policy_id), ENDPOINTS.agentPropose, trace);
    },

    async evaluate(payload: EvaluationRequest, trace?: Trace): Promise<NormalizedEvaluation & { raw: unknown }> {
      const body = await request(ENDPOINTS.evaluations, { method: 'POST', body: toWireRequest(payload) }, trace, EVALUATION_TIMEOUT_MS);
      return { ...wrapContract(() => normalizeEvaluation(body, payload), ENDPOINTS.evaluations, trace), raw: body };
    },

    async listEvaluations(trace?: Trace): Promise<Array<NormalizedEvaluation & { raw: unknown }>> {
      const body = await request(ENDPOINTS.evaluations, { method: 'GET' }, trace);
      const items = unwrapList(body, ['items', 'evaluations', 'results', 'data']);
      if (!items) throw new ApiError('Expected a JSON array or { "items": [...] }', ENDPOINTS.evaluations, undefined, body);
      return items.map((item) => ({ ...wrapContract(() => normalizeEvaluation(item), ENDPOINTS.evaluations, trace), raw: item }));
    },

    async getEvaluation(id: string, trace?: Trace): Promise<NormalizedEvaluation & { raw: unknown }> {
      const body = await request(ENDPOINTS.evaluation(id), { method: 'GET' }, trace);
      return { ...wrapContract(() => normalizeEvaluation(body), ENDPOINTS.evaluation(id), trace), raw: body };
    },

    async getPolicies(trace?: Trace): Promise<{ policies: LivePolicy[]; raw: unknown }> {
      const body = await request(ENDPOINTS.policies, { method: 'GET' }, trace);
      const policies = normalizePolicies(body);
      if (!policies) throw new ApiError('Policies response could not be read as a list of policies', ENDPOINTS.policies, undefined, body);
      return { policies, raw: body };
    },

    async patchPolicy(id: string, patch: Record<string, unknown>, trace?: Trace): Promise<unknown> {
      return request(ENDPOINTS.policy(id), { method: 'PATCH', body: patch }, trace);
    },

    async listAuditEvents(trace?: Trace): Promise<unknown[]> {
      const body = await request(ENDPOINTS.auditEvents, { method: 'GET' }, trace);
      const items = unwrapList(body, ['items', 'events', 'audit_events', 'data']);
      if (!items) throw new ApiError('Expected a JSON array or { "items": [...] }', ENDPOINTS.auditEvents, undefined, body);
      return items;
    },

    /** Record a human reviewer's decision for a REVIEW_REQUIRED evaluation. */
    async reviewDecision(evaluationId: string, decision: ReviewOutcome, _note: string | undefined, trace?: Trace): Promise<unknown> {
      return request(ENDPOINTS.reviewDecision(evaluationId), { method: 'POST', body: { decision: decision === 'APPROVED' ? 'APPROVE' : 'REJECT', reviewer: 'trustlayer-console' } }, trace);
    },

    /**
     * Ask the backend execution gateway to run a previously evaluated action.
     * 200 → executed (simulated); 403 → not authorized; 409 → authorization already used.
     * These outcomes are returned, not thrown, because each one is a meaningful result.
     */
    async execute(evaluationId: string, action: AgentAction, trace?: Trace): Promise<ExecutionResult> {
      const at = () => new Date().toISOString();
      let res: RawResponse;
      try {
        res = await raw(ENDPOINTS.executeAction, { method: 'POST', body: { evaluation_id: evaluationId, action } }, trace);
      } catch (err) {
        return { status: 'ERROR', at: at(), gateway: 'backend', message: err instanceof Error ? err.message : String(err) };
      }
      const detail = describeErrorDetail(res.body);
      if (res.status === 409 && !/already been used/i.test(detail ?? '')) {
        // 409 also means "policies changed" or "re-evaluation requires a new authorization".
        return { status: 'REFUSED', http_status: 409, at: at(), gateway: 'backend', message: `Backend conflict (HTTP 409)${detail ? `: ${detail}` : ''}. Re-evaluate the action to get a new authorization.`, raw: res.body };
      }
      if (res.status === 409) {
        return {
          status: 'REFUSED',
          duplicate: true,
          http_status: 409,
          at: at(),
          gateway: 'backend',
          message: `Authorization already used (HTTP 409)${detail ? `: ${detail}` : ''}. The backend refused to execute this action a second time.`,
          raw: res.body,
        };
      }
      if (res.status === 403) {
        return { status: 'REFUSED', http_status: 403, at: at(), gateway: 'backend', message: `Action not authorized (HTTP 403)${detail ? `: ${detail}` : ''}.`, raw: res.body };
      }
      if (res.ok) {
        const explicitFalse = isObj(res.body) && (res.body.executed === false || res.body.success === false);
        if (explicitFalse) {
          return { status: 'REFUSED', http_status: res.status, at: at(), gateway: 'backend', message: executionMessage(res.body) ?? 'Backend reported the action was not executed.', raw: res.body };
        }
        return {
          status: 'EXECUTED',
          http_status: res.status,
          at: at(),
          gateway: 'backend',
          reference: executionReference(res.body),
          message: executionMessage(res.body) ?? 'Simulated execution succeeded (HTTP 200).',
          raw: res.body,
        };
      }
      return { status: 'ERROR', http_status: res.status, at: at(), gateway: 'backend', message: `Backend gateway returned HTTP ${res.status}${detail ? `: ${detail}` : ''}.`, raw: res.body };
    },
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

/**
 * The documented live request: agent_id, intent, action, evidence, policy_id, use_ai.
 * Frontend-only `context` (permissions, reasoning) is deliberately not sent.
 */
export function toWireRequest(r: EvaluationRequest): Record<string, unknown> {
  return {
    agent_id: r.agent_id,
    intent: r.intent,
    action: { type: r.action.type, parameters: r.action.parameters },
    evidence: r.evidence.map((e) => ({ id: e.id, source: e.source, content: e.content })),
    policy_id: r.policy_id,
    use_ai: r.use_ai ?? false,
  };
}
