/** Every backend path lives here. Components never build URLs themselves. */
export const API_PREFIX = '/api/v1';

export const ENDPOINTS = {
  health: '/health',
  openapi: '/openapi.json',
  catalog: `${API_PREFIX}/catalog`,
  agentPropose: `${API_PREFIX}/agent/propose`,
  agentRun: `${API_PREFIX}/agent/run`,
  productSearch: `${API_PREFIX}/products/search`,
  evaluations: `${API_PREFIX}/evaluations`,
  evaluation: (id: string) => `${API_PREFIX}/evaluations/${encodeURIComponent(id)}`,
  reviewDecision: (id: string) => `${API_PREFIX}/reviews/${encodeURIComponent(id)}/decision`,
  executeAction: `${API_PREFIX}/actions/execute`,
  policies: `${API_PREFIX}/policies`,
  policy: (id: string) => `${API_PREFIX}/policies/${encodeURIComponent(id)}`,
  auditEvents: `${API_PREFIX}/audit-events`,
  aiStatus: `${API_PREFIX}/ai/status`,
  research: `${API_PREFIX}/research`,
  trustScenarios: `${API_PREFIX}/trust/scenarios`,
  trustEvaluate: `${API_PREFIX}/trust/evaluate`,
} as const;

/** Endpoints the frontend uses in Live Backend Mode, for the OpenAPI contract check. */
export const EXPECTED_OPERATIONS: Array<{ method: 'get' | 'post' | 'patch'; path: string; required: boolean }> = [
  { method: 'get', path: '/health', required: false },
  { method: 'get', path: `${API_PREFIX}/catalog`, required: false },
  { method: 'post', path: `${API_PREFIX}/agent/propose`, required: false },
  { method: 'post', path: `${API_PREFIX}/agent/run`, required: false },
  { method: 'get', path: `${API_PREFIX}/policies`, required: false },
  { method: 'patch', path: `${API_PREFIX}/policies/{policy_id}`, required: false },
  { method: 'post', path: `${API_PREFIX}/evaluations`, required: true },
  { method: 'get', path: `${API_PREFIX}/evaluations`, required: false },
  { method: 'get', path: `${API_PREFIX}/evaluations/{evaluation_id}`, required: false },
  { method: 'post', path: `${API_PREFIX}/reviews/{evaluation_id}/decision`, required: false },
  { method: 'post', path: `${API_PREFIX}/actions/execute`, required: true },
  { method: 'get', path: `${API_PREFIX}/audit-events`, required: false },
  { method: 'get', path: `${API_PREFIX}/ai/status`, required: false },
];
