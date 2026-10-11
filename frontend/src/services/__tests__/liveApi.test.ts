import { createHttpClient, toWireRequest, ApiError } from '../api';
import { classifyAiStatus } from '../liveContract';
import { formToRequest } from '@/lib/requestBuilder';
import { getScenario } from '@/data/scenarios';

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown };

function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = handler(url, init);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

const liveEval = {
  evaluation_id: 'ev_123',
  agent_id: 'purchase-pilot',
  action: { type: 'purchase', parameters: { product_id: 'p1', price: 40 } },
  decision: 'ALLOW',
  risk_level: 'LOW',
  checks: [{ name: 'Spending limit', status: 'PASS', detail: 'under cap' }],
  reason: 'All checks passed',
  evidence_flags: [],
  alternatives: [],
  execution_allowed: true,
  policy_versions: { spending: 3 },
  ai_analysis: null,
  ai_status: 'failed',
  ai_error: 'Luminal timeout',
  created_at: '2026-10-11T00:00:00Z',
  review_status: null,
  executed: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('live HTTP client (mocked fetch)', () => {
  const request = formToRequest(getScenario('valid').form);

  it('sends the documented wire request and normalizes the evaluation', async () => {
    const calls = mockFetch(() => ({ status: 200, body: liveEval }));
    const api = createHttpClient('http://backend.test');
    const res = await api.evaluate({ ...request, use_ai: true });
    expect(calls[0].url).toBe('http://backend.test/api/v1/evaluations');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual(toWireRequest({ ...request, use_ai: true }));
    expect((calls[0].body as Record<string, unknown>).context).toBeUndefined();
    expect(res.response.evaluation_id).toBe('ev_123');
    expect(res.response.execution_allowed).toBe(true);
    expect(res.response.ai_error).toBe('Luminal timeout');
    expect(res.raw).toEqual(liveEval);
  });

  it('rejects responses missing authorization-critical fields instead of guessing', async () => {
    mockFetch(() => ({ status: 200, body: { evaluation_id: 'x', decision: 'ALLOW' } }));
    await expect(createHttpClient('').evaluate(request)).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces HTTP errors with the FastAPI detail and never falls back to mock data', async () => {
    mockFetch(() => ({ status: 422, body: { detail: [{ loc: ['body', 'policy_id'], msg: 'field required' }] } }));
    await expect(createHttpClient('').evaluate(request)).rejects.toThrow(/policy_id/);
  });

  it('reports network failure as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(createHttpClient('').health()).rejects.toThrow(/Could not reach the backend/);
  });

  it('execute: 200 executed, 403 refused, 409 duplicate', async () => {
    let status = 200;
    const calls = mockFetch(() => ({ status, body: status === 200 ? { execution_id: 'exe_1', message: 'ok' } : { detail: status === 409 ? 'Evaluation authorization has already been used' : 'not authorized' } }));
    const api = createHttpClient('');
    const ok = await api.execute('ev_123', liveEval.action);
    expect(ok.status).toBe('EXECUTED');
    expect(calls[0].body).toEqual({ evaluation_id: 'ev_123', action: liveEval.action });
    status = 403;
    const forbidden = await api.execute('ev_123', liveEval.action);
    expect(forbidden).toMatchObject({ status: 'REFUSED', http_status: 403 });
    status = 409;
    const dup = await api.execute('ev_123', liveEval.action);
    
    expect(dup).toMatchObject({ status: 'REFUSED', http_status: 409, duplicate: true });
    expect(dup.message).toMatch(/already used/);
  });

  it('PATCHes a policy with only the given fields', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { id: 'spending', max_amount: 50 } }));
    await createHttpClient('').patchPolicy('spending', { max_amount: 50 });
    expect(calls[0]).toMatchObject({ url: '/api/v1/policies/spending', method: 'PATCH', body: { max_amount: 50 } });
  });
});

describe('AI status classification', () => {
  it('only reports completed inference when the backend says so', () => {
    expect(classifyAiStatus('completed')).toBe('completed');
    expect(classifyAiStatus('failed', null, 'timeout')).toBe('failed');
    expect(classifyAiStatus(null, null, 'boom')).toBe('failed');
    expect(classifyAiStatus('not_configured')).toBe('unavailable');
    expect(classifyAiStatus('not_requested')).toBe('not_requested');
    expect(classifyAiStatus(undefined)).toBe('none');
    expect(classifyAiStatus('weird')).toBe('unknown');
  });
});

describe('backend contract details (feature/backend)', () => {
  it('only reports the backend as up when /health returns JSON', async () => {
    // A static host such as Vercel rewrites /health to index.html with a 200.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })));
    await expect(createHttpClient('').health()).rejects.toBeInstanceOf(ApiError);

    mockFetch(() => ({ status: 200, body: { status: 'ok', service: 'trustlayer-backend' } }));
    await expect(createHttpClient('').health()).resolves.toMatchObject({ ok: true });
  });

  it('sends APPROVE/REJECT for review decisions', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { evaluation_id: 'ev_1', review_status: 'APPROVE', execution_allowed: true } }));
    await createHttpClient('').reviewDecision('ev_1', 'APPROVED', undefined);
    expect(calls[0].url).toBe('/api/v1/reviews/ev_1/decision');
    expect((calls[0].body as Record<string, unknown>).decision).toBe('APPROVE');
  });

  it('sends the seeded scenario to /agent/propose', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { agent_id: 'purchase-pilot', intent: 'x', action: { type: 'place_order', parameters: { product_id: 'hp-001', price: 129, vendor: 'AudioMart' } }, evidence: [], policy_id: 'shopping-default', scenario: 'budget' } }));
    const p = await createHttpClient('').propose({ agent_id: 'purchase-pilot', intent: 'x', policy_id: 'shopping-default', scenario: 'budget' });
    expect(calls[0].body).toEqual({ agent_id: 'purchase-pilot', intent: 'x', scenario: 'budget' });
    expect(p.scenario).toBe('budget');
  });

  it('treats a 409 "policies changed" as a conflict, not a duplicate', async () => {
    mockFetch(() => ({ status: 409, body: { detail: 'Policies changed after evaluation; reevaluate before execution' } }));
    const r = await createHttpClient('').execute('ev_1', liveEval.action);
    expect(r).toMatchObject({ status: 'REFUSED', http_status: 409 });
    expect(r.duplicate).toBeUndefined();
  });
});
