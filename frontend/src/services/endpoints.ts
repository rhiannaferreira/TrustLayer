/** Every backend path lives here. Components never build URLs themselves. */
export const API_PREFIX = '/api/v1';

export const ENDPOINTS = {
  health: '/health',
  evaluations: `${API_PREFIX}/evaluations`,
  evaluation: (id: string) => `${API_PREFIX}/evaluations/${encodeURIComponent(id)}`,
  evaluationReview: (id: string) => `${API_PREFIX}/evaluations/${encodeURIComponent(id)}/review`,
  executions: `${API_PREFIX}/executions`,
  policies: `${API_PREFIX}/policies`,
  policy: (id: string) => `${API_PREFIX}/policies/${encodeURIComponent(id)}`,
  auditEvents: `${API_PREFIX}/audit-events`,
} as const;
