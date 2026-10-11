/** Build-time configuration. Runtime overrides live in app settings (see AppStore). */
const rawBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const ENV_CONFIG = {
  apiBaseUrl: rawBase.replace(/\/+$/, ''),
  useMocks: (import.meta.env.VITE_USE_MOCKS ?? 'true').toString().toLowerCase() !== 'false',
} as const;

export const STORAGE_KEYS = {
  state: 'trustlayer.demo.state.v1',
  theme: 'trustlayer.theme',
} as const;
