// Tiny TrustLayer client for Node 18+ and browsers' server-side code (never ship the key to a browser).
//   import { TrustLayer } from './trustlayer.mjs';
//   const tl = new TrustLayer({ baseUrl: 'https://trust-layer-gz8n.vercel.app', apiKey: 'tl_...' });
//   const v = await tl.check('db.run_query', { sql: 'DROP TABLE users', environment: 'production' });
//   if (v.allowed) { /* do the real action */ }
export class TrustLayer {
  constructor({ baseUrl, apiKey }) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.key = apiKey;
  }
  async #call(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`TrustLayer ${res.status}: ${await res.text()}`);
    return res.json();
  }
  check(action, parameters = {}, { goal = '', reasoning = '', evidence = [] } = {}) {
    return this.#call('POST', '/api/v1/gate/check', { action, parameters, goal, reasoning, evidence });
  }
  async waitForReview(decisionId, { pollMs = 3000, timeoutMs = 600000 } = {}) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const s = await this.#call('GET', `/api/v1/gate/decisions/${decisionId}`);
      if (s.review_status === 'APPROVED' || s.review_status === 'REJECTED' || s.decision !== 'REVIEW') return s;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error('No human review within the timeout');
  }
}
