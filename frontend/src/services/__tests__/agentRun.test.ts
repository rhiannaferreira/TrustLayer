import { createHttpClient, ApiError } from '../api';
import { normalizeAgentRun, ContractError } from '../liveContract';
import { DemoNoMatchError, planFromGoal } from '../agentPlanner';
import { SHOES_UNDER_50, LAPTOPS_UNDER_50_NO_MATCH } from '@/test/agentRunFixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/v1/agent/run contract', () => {
  it('calls the live agent endpoint, not the seeded proposal endpoint', async () => {
    const calls = mockFetch(200, SHOES_UNDER_50);
    const run = await createHttpClient('http://backend.test').agentRun({ agent_id: 'purchase-pilot', intent: 'Find shoes under $50', policy_id: 'shopping-default', use_ai: false });
    expect(calls[0].url).toBe('http://backend.test/api/v1/agent/run');
    expect(calls[0].body).toEqual({ agent_id: 'purchase-pilot', intent: 'Find shoes under $50', use_ai: false, rank_with_ai: true });
    expect(run.summary.status).toBe('EVALUATED_NOT_EXECUTED');
    expect(run.summary.recommendation?.product.category).toBe('shoes');
    expect(run.summary.discovery.results.every((p) => p.category === 'shoes' && p.price <= 50)).toBe(true);
    expect(run.summary.alternatives.every((a) => a.product.category === 'shoes')).toBe(true);
    expect(run.proposal?.request.action.parameters.product_id).toBe(run.summary.recommendation?.product.product_id);
    expect(run.evaluation?.response.decision).toBe('ALLOW');
    expect(run.summary.discovery.catalog_mode).toBe('demo');
    expect(run.summary.recommendation?.product.provenance).toBe('fictional_demo_catalog');
  });

  it('treats NO_MATCH as a result with no proposal or evaluation', () => {
    const run = normalizeAgentRun(clone(LAPTOPS_UNDER_50_NO_MATCH), 'Find laptops under $50', 'purchase-pilot', 'shopping-default');
    expect(run.summary.status).toBe('NO_MATCH');
    expect(run.summary.message).toMatch(/No laptops/);
    expect(run.proposal).toBeNull();
    expect(run.evaluation).toBeNull();
  });

  it('rejects an evaluated run without an evaluation instead of guessing', () => {
    const broken = clone(SHOES_UNDER_50) as Record<string, unknown>;
    delete broken.evaluation;
    expect(() => normalizeAgentRun(broken, 'x', 'a', 'p')).toThrow(ContractError);
  });

  it('drops product URLs that are not https', () => {
    const run = clone(SHOES_UNDER_50) as { recommendation: { product: Record<string, unknown> } };
    run.recommendation.product.product_url = 'javascript:alert(1)';
    expect(normalizeAgentRun(run, 'x', 'a', 'p').summary.recommendation?.product.product_url).toBeNull();
  });

  it('surfaces an unavailable product provider as an error', async () => {
    mockFetch(503, { detail: { code: 'PRODUCT_SEARCH_UNAVAILABLE', message: 'eBay search failed (HTTP 500)', provider: 'ebay' } });
    const err = await createHttpClient('').agentRun({ agent_id: 'a', intent: 'Find shoes under $50', policy_id: 'p', use_ai: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/eBay search failed/);
  });
});

describe('demo planner (no backend)', () => {
  it('never substitutes headphones for another category', () => {
    expect(() => planFromGoal('Find shoes under $50')).toThrow(DemoNoMatchError);
    expect(() => planFromGoal('I need a laptop backpack')).toThrow(DemoNoMatchError);
  });

  it('still plans headphone goals', () => {
    expect(planFromGoal('Find the best wireless headphones for under $80.').request.action.type).toBe('place_order');
  });
});
