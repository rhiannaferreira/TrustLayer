import { useMemo } from 'react';
import { useAppStore } from '@/context/AppStore';
import { createHttpClient } from '@/services/api';

/** HTTP client for the trust gate endpoints; these pages always talk to the real backend. */
export function useGateClient() {
  const { settings } = useAppStore();
  return useMemo(() => createHttpClient(settings.apiBaseUrl), [settings.apiBaseUrl]);
}
