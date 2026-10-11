import { useCallback, useEffect, useMemo, useState } from 'react';
import { createHttpClient } from '@/services/api';

export type BackendState = 'checking' | 'online' | 'offline';

/** Pings GET /health on an interval. Purely informational in mock mode. */
export function useBackendHealth(baseUrl: string, intervalMs = 20_000) {
  const client = useMemo(() => createHttpClient(baseUrl), [baseUrl]);
  const [state, setState] = useState<BackendState>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const check = useCallback(async () => {
    setState((s) => (s === 'online' ? s : 'checking'));
    try {
      const res = await client.health();
      setState('online');
      setLatency(res.latency_ms);
    } catch {
      setState('offline');
      setLatency(null);
    } finally {
      setCheckedAt(new Date().toISOString());
    }
  }, [client]);

  useEffect(() => {
    void check();
    const t = setInterval(() => void check(), intervalMs);
    return () => clearInterval(t);
  }, [check, intervalMs]);

  return { state, latency, checkedAt, check };
}
