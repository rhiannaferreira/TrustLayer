/**
 * Backend connection status: /health, /api/v1/ai/status and the OpenAPI contract check.
 *
 * "AI configured" (from /ai/status) and "AI inference completed" (from an actual evaluation's
 * ai_status) are tracked separately and never conflated.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createHttpClient } from '@/services/api';
import { classifyAiStatus, type AiServiceStatus } from '@/services/liveContract';
import { checkContract, type ContractReport } from '@/lib/openapiCheck';
import { useAppStore } from './AppStore';
import type { AiOutcome, EvaluationRecord } from '@/types';

export type BackendState = 'checking' | 'connected' | 'disconnected';
export type AiIndicator = 'checking' | 'configured' | 'unavailable' | 'failed' | 'verified' | 'unknown' | 'off';

export interface ConnectionValue {
  backend: BackendState;
  latency: number | null;
  checkedAt: string | null;
  healthBody: unknown;
  ai: AiServiceStatus | null;
  aiError: string | null;
  /** Latest backend evaluation that carried AI information, if any. */
  lastAi: { outcome: AiOutcome; status: string | null; error: string | null; at: string; id: string } | null;
  aiIndicator: AiIndicator;
  contract: ContractReport | null;
  contractError: string | null;
  check: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionValue | null>(null);

export function lastAiOutcome(records: EvaluationRecord[]): ConnectionValue['lastAi'] {
  for (const r of records) {
    if (r.source !== 'api') continue;
    const outcome = classifyAiStatus(r.response.ai_status, r.response.ai_analysis, r.response.ai_error);
    if (outcome === 'none' || outcome === 'not_requested') continue;
    return { outcome, status: r.response.ai_status ?? null, error: r.response.ai_error ?? null, at: r.response.created_at, id: r.id };
  }
  return null;
}

export function aiIndicatorFor(dataSource: string, ai: AiServiceStatus | null, aiError: string | null, lastAi: ConnectionValue['lastAi'], backend: BackendState): AiIndicator {
  if (dataSource !== 'api') return 'off';
  if (lastAi?.outcome === 'failed') return 'failed';
  if (lastAi?.outcome === 'completed') return 'verified';
  if (backend === 'checking' && !ai) return 'checking';
  if (aiError || !ai) return 'unavailable';
  if (ai.configured === true) return 'configured';
  if (ai.configured === false) return 'unavailable';
  return 'unknown';
}

export function ConnectionProvider({ children, intervalMs = 20_000 }: { children: ReactNode; intervalMs?: number }) {
  const { apiBaseUrl, dataSource, records } = useAppStore();
  const client = useMemo(() => createHttpClient(apiBaseUrl), [apiBaseUrl]);
  const [backend, setBackend] = useState<BackendState>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [healthBody, setHealthBody] = useState<unknown>(null);
  const [ai, setAi] = useState<AiServiceStatus | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractReport | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const contractFor = useRef<string | null>(null);

  const check = useCallback(async () => {
    setBackend((s) => (s === 'connected' ? s : 'checking'));
    try {
      const res = await client.health();
      setBackend('connected');
      setLatency(res.latency_ms);
      setHealthBody(res.body);
    } catch {
      setBackend('disconnected');
      setLatency(null);
      setAi(null);
      setCheckedAt(new Date().toISOString());
      return;
    }
    try {
      setAi(await client.aiStatus());
      setAiError(null);
    } catch (err) {
      setAi(null);
      setAiError(err instanceof Error ? err.message : String(err));
    }
    if (contractFor.current !== client.baseUrl) {
      contractFor.current = client.baseUrl;
      try {
        setContract(checkContract(await client.openapi()));
        setContractError(null);
      } catch (err) {
        setContract(null);
        setContractError(err instanceof Error ? err.message : String(err));
      }
    }
    setCheckedAt(new Date().toISOString());
  }, [client]);

  useEffect(() => {
    contractFor.current = null;
    void check();
    const t = setInterval(() => void check(), intervalMs);
    return () => clearInterval(t);
  }, [check, intervalMs]);

  const lastAi = useMemo(() => lastAiOutcome(records), [records]);
  const aiIndicator = aiIndicatorFor(dataSource, ai, aiError, lastAi, backend);

  const value: ConnectionValue = { backend, latency, checkedAt, healthBody, ai, aiError, lastAi, aiIndicator, contract, contractError, check };
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

const OFFLINE: ConnectionValue = {
  backend: 'disconnected',
  latency: null,
  checkedAt: null,
  healthBody: null,
  ai: null,
  aiError: null,
  lastAi: null,
  aiIndicator: 'off',
  contract: null,
  contractError: null,
  check: async () => undefined,
};

/** Safe outside the provider (tests render pages without it). */
export function useConnection(): ConnectionValue {
  return useContext(ConnectionContext) ?? OFFLINE;
}
