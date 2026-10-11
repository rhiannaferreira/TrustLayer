/** Build-time configuration. Runtime overrides live in app settings (see AppStore). */

/**
 * Empty string = same origin. In `npm run dev` / `npm run preview`, Vite proxies `/health`,
 * `/openapi.json` and `/api/*` to VITE_BACKEND_PROXY_TARGET (default http://127.0.0.1:8000),
 * so the backend does not need CORS. Set VITE_API_BASE_URL to call the backend directly.
 */
const rawBase = import.meta.env.VITE_API_BASE_URL ?? '';

export const ENV_CONFIG = {
  apiBaseUrl: rawBase.replace(/\/+$/, ''),
  useMocks: (import.meta.env.VITE_USE_MOCKS ?? 'true').toString().toLowerCase() !== 'false',
  proxyTarget: (import.meta.env.VITE_BACKEND_PROXY_TARGET ?? 'http://127.0.0.1:8000').replace(/\/+$/, ''),
} as const;

/** Human description of where live requests go. */
export function describeBaseUrl(base: string): string {
  return base ? base : `same origin → dev proxy → ${ENV_CONFIG.proxyTarget}`;
}

export const STORAGE_KEYS = {
  state: 'trustlayer.demo.state.v1',
  theme: 'trustlayer.theme',
} as const;
