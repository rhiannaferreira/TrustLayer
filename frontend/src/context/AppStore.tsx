/**
 * Shared application state. Every page reads evaluations and policies from here, so an
 * evaluation run in Attack Lab shows up immediately on the Overview, Live Decisions and
 * Audit Trail, and a policy edit affects the very next evaluation.
 *
 * Demo state is persisted to localStorage. It is NOT an immutable audit log.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { ENV_CONFIG, STORAGE_KEYS } from '@/lib/config';
import { defaultPolicySet } from '@/data/policies';
import { createSeedRecords } from '@/lib/seed';
import { buildRecord, withExecution } from '@/lib/records';
import { createHttpClient, ApiError, type RemoteEvaluation } from '@/services/api';
import { createMockClient } from '@/services/mockApi';
import { authorizeExecution, submitToGateway } from '@/services/toolGateway';
import { agentName } from '@/data/agents';
import type {
  AnyPolicy,
  DataSource,
  EvaluationRecord,
  EvaluationRequest,
  ExecutionResult,
  PolicyPatch,
  PolicySet,
  RecordOrigin,
  ReviewState,
} from '@/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface Settings {
  dataSource: DataSource;
  apiBaseUrl: string;
}

export interface AppState {
  records: EvaluationRecord[];
  policySet: PolicySet;
  settings: Settings;
  demoStartedAt: string;
}

type Action =
  | { type: 'ADD_RECORD'; record: EvaluationRecord }
  | { type: 'UPDATE_RECORD'; id: string; update: (r: EvaluationRecord) => EvaluationRecord }
  | { type: 'MERGE_REMOTE'; records: EvaluationRecord[] }
  | { type: 'SET_POLICY'; policy: AnyPolicy; bumpVersion: boolean }
  | { type: 'SET_POLICY_SET'; policySet: PolicySet }
  | { type: 'SET_SETTINGS'; settings: Partial<Settings> }
  | { type: 'RESET'; state: AppState };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_RECORD':
      return { ...state, records: [action.record, ...state.records.filter((r) => r.id !== action.record.id)] };
    case 'UPDATE_RECORD':
      return { ...state, records: state.records.map((r) => (r.id === action.id ? action.update(r) : r)) };
    case 'MERGE_REMOTE': {
      const byId = new Map(state.records.map((r) => [r.id, r]));
      for (const incoming of action.records) {
        const existing = byId.get(incoming.id);
        // Keep locally observed timeline/execution when we already know this evaluation.
        byId.set(incoming.id, existing ? { ...existing, response: incoming.response } : incoming);
      }
      const merged = Array.from(byId.values()).sort((a, b) => b.response.created_at.localeCompare(a.response.created_at));
      return { ...state, records: merged };
    }
    case 'SET_POLICY': {
      const policies = state.policySet.policies.map((p) => (p.id === action.policy.id ? action.policy : p));
      return {
        ...state,
        policySet: {
          ...state.policySet,
          policies,
          version: action.bumpVersion ? state.policySet.version + 1 : state.policySet.version,
          updated_at: new Date().toISOString(),
        },
      };
    }
    case 'SET_POLICY_SET':
      return { ...state, policySet: action.policySet };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'RESET':
      return action.state;
  }
}

function freshState(settings?: Settings): AppState {
  const now = new Date();
  const policySet = defaultPolicySet(now.toISOString());
  return {
    records: createSeedRecords(policySet, now),
    policySet,
    settings: settings ?? { dataSource: ENV_CONFIG.useMocks ? 'mock' : 'api', apiBaseUrl: ENV_CONFIG.apiBaseUrl },
    demoStartedAt: now.toISOString(),
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.records) && parsed.policySet?.policies && parsed.settings) return parsed;
    }
  } catch {
    /* corrupted or unavailable storage — start fresh */
  }
  return freshState();
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface RunEvaluationInput {
  request: EvaluationRequest;
  origin: RecordOrigin;
  scenario?: string;
  retryOf?: string;
  /** Submit to the tool gateway right after evaluation (default true). */
  autoExecute?: boolean;
}

interface AppStoreValue {
  state: AppState;
  /** Records for the active data source only (mock vs. real API are never mixed). */
  records: EvaluationRecord[];
  policySet: PolicySet;
  dataSource: DataSource;
  apiBaseUrl: string;
  getRecord: (id: string) => EvaluationRecord | undefined;
  runEvaluation: (input: RunEvaluationInput) => Promise<EvaluationRecord>;
  executeRecord: (id: string) => Promise<ExecutionResult>;
  requestReview: (id: string, note?: string) => Promise<ReviewState>;
  resolveDemoReview: (id: string, outcome: 'APPROVED' | 'REJECTED', note?: string) => void;
  updatePolicy: (id: string, patch: PolicyPatch) => Promise<AnyPolicy>;
  resetPolicies: () => Promise<void>;
  refreshFromBackend: () => Promise<number>;
  setSettings: (settings: Partial<Settings>) => void;
  resetDemo: () => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children, initialState }: { children: ReactNode; initialState?: AppState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState ?? loadState());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
    } catch {
      /* storage full or blocked; the demo keeps working in memory */
    }
  }, [state]);

  const mock = useMemo(() => createMockClient(() => stateRef.current.policySet), []);
  const http = useMemo(() => createHttpClient(state.settings.apiBaseUrl), [state.settings.apiBaseUrl]);
  const dataSource = state.settings.dataSource;

  const getRecord = useCallback((id: string) => stateRef.current.records.find((r) => r.id === id), []);

  const executeRecord = useCallback(
    async (id: string): Promise<ExecutionResult> => {
      const record = stateRef.current.records.find((r) => r.id === id);
      if (!record) throw new Error(`Unknown evaluation ${id}`);
      let result: ExecutionResult;
      if (record.source === 'mock') {
        result = submitToGateway(record);
      } else {
        // Local pre-check first; the backend remains the authority for real execution.
        const verdict = authorizeExecution(record);
        if (!verdict.allowed) {
          result = { status: 'REFUSED', at: new Date().toISOString(), gateway: 'client-precheck', message: verdict.reason };
        } else {
          try {
            result = await http.execute(record.id);
          } catch (err) {
            result = {
              status: 'ERROR',
              at: new Date().toISOString(),
              gateway: 'backend',
              message: err instanceof ApiError ? `Backend execution failed: ${err.message}` : String(err),
            };
          }
        }
      }
      dispatch({ type: 'UPDATE_RECORD', id, update: (r) => withExecution(r, result) });
      return result;
    },
    [http],
  );

  const runEvaluation = useCallback(
    async (input: RunEvaluationInput): Promise<EvaluationRecord> => {
      const submittedAt = new Date().toISOString();
      const source = stateRef.current.settings.dataSource;
      const response = source === 'mock' ? await mock.evaluate(input.request) : await http.evaluate(input.request);
      let record = buildRecord({
        request: input.request,
        response,
        source,
        origin: input.origin,
        policyVersion: stateRef.current.policySet.version,
        scenario: input.scenario,
        retryOf: input.retryOf,
        submittedAt,
      });
      if (input.retryOf) {
        const parentId = input.retryOf;
        dispatch({
          type: 'UPDATE_RECORD',
          id: parentId,
          update: (r) => ({
            ...r,
            timeline: [...r.timeline, { at: submittedAt, kind: 'RETRY_CREATED', label: 'Alternative proposed', detail: `New evaluation ${record.id}` }],
          }),
        });
      }
      if (input.autoExecute !== false && source === 'mock') {
        record = withExecution(record, submitToGateway(record));
      }
      dispatch({ type: 'ADD_RECORD', record });
      if (input.autoExecute !== false && source === 'api') {
        await executeRecord(record.id);
        return stateRef.current.records.find((r) => r.id === record.id) ?? record;
      }
      return record;
    },
    [mock, http, executeRecord],
  );

  const requestReview = useCallback(
    async (id: string, note?: string): Promise<ReviewState> => {
      const record = stateRef.current.records.find((r) => r.id === id);
      if (!record) throw new Error(`Unknown evaluation ${id}`);
      const now = new Date().toISOString();
      let review: ReviewState;
      if (record.source === 'api') {
        review = await http.requestReview(id, note);
      } else {
        review = { status: 'PENDING', requested_at: now, note };
      }
      dispatch({
        type: 'UPDATE_RECORD',
        id,
        update: (r) => ({
          ...r,
          review,
          timeline: [...r.timeline, { at: now, kind: 'REVIEW_REQUESTED', label: 'Human review requested', detail: note }],
        }),
      });
      return review;
    },
    [http],
  );

  const resolveDemoReview = useCallback((id: string, outcome: 'APPROVED' | 'REJECTED', note?: string) => {
    const now = new Date().toISOString();
    dispatch({
      type: 'UPDATE_RECORD',
      id,
      update: (r) => {
        if (r.source !== 'mock') return r;
        return {
          ...r,
          review: { ...r.review, status: outcome, requested_at: r.review.requested_at ?? r.response.created_at, resolved_at: now, resolved_by: 'demo-operator', note },
          timeline: [
            ...r.timeline,
            {
              at: now,
              kind: outcome === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
              label: outcome === 'APPROVED' ? 'Demo review: approved' : 'Demo review: rejected',
              detail: 'Simulated decision recorded by the demo operator — not a real reviewer.',
            },
          ],
        };
      },
    });
  }, []);

  const updatePolicy = useCallback(
    async (id: string, patch: PolicyPatch): Promise<AnyPolicy> => {
      const source = stateRef.current.settings.dataSource;
      // In API mode the change is only applied after the backend confirms it.
      const updated = source === 'mock' ? await mock.updatePolicy(id, patch) : await http.updatePolicy(id, patch);
      dispatch({ type: 'SET_POLICY', policy: updated, bumpVersion: true });
      return updated;
    },
    [mock, http],
  );

  const resetPolicies = useCallback(async () => {
    const source = stateRef.current.settings.dataSource;
    const defaults = defaultPolicySet();
    if (source === 'api') {
      for (const policy of defaults.policies) {
        const confirmed = await http.updatePolicy(policy.id, { enabled: policy.enabled, config: policy.config });
        dispatch({ type: 'SET_POLICY', policy: confirmed, bumpVersion: false });
      }
      dispatch({ type: 'SET_POLICY_SET', policySet: { ...stateRef.current.policySet, version: stateRef.current.policySet.version + 1 } });
      return;
    }
    dispatch({
      type: 'SET_POLICY_SET',
      policySet: { ...defaults, version: stateRef.current.policySet.version + 1 },
    });
  }, [http]);

  const refreshFromBackend = useCallback(async (): Promise<number> => {
    if (stateRef.current.settings.dataSource !== 'api') return 0;
    const [items, policySet] = await Promise.all([http.listEvaluations(), http.getPolicies().catch(() => null)]);
    const records = items.map((item) => remoteToRecord(item));
    dispatch({ type: 'MERGE_REMOTE', records });
    if (policySet && Array.isArray(policySet.policies)) dispatch({ type: 'SET_POLICY_SET', policySet });
    return records.length;
  }, [http]);

  const setSettings = useCallback((settings: Partial<Settings>) => dispatch({ type: 'SET_SETTINGS', settings }), []);

  const resetDemo = useCallback(() => {
    dispatch({ type: 'RESET', state: freshState(stateRef.current.settings) });
  }, []);

  const records = useMemo(() => state.records.filter((r) => r.source === dataSource), [state.records, dataSource]);

  const value: AppStoreValue = {
    state,
    records,
    policySet: state.policySet,
    dataSource,
    apiBaseUrl: state.settings.apiBaseUrl,
    getRecord,
    runEvaluation,
    executeRecord,
    requestReview,
    resolveDemoReview,
    updatePolicy,
    resetPolicies,
    refreshFromBackend,
    setSettings,
    resetDemo,
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

function remoteToRecord(item: RemoteEvaluation): EvaluationRecord {
  const request: EvaluationRequest = item.request ?? {
    agent_id: item.agent_id ?? 'unknown-agent',
    intent: '',
    action: { type: 'unknown', parameters: {} },
    evidence: [],
    policy_id: 'unknown',
  };
  const record = buildRecord({
    request,
    response: item,
    source: 'api',
    origin: 'remote',
    policyVersion: item.policy_version ?? 0,
    submittedAt: item.created_at,
  });
  record.agent_name = agentName(request.agent_id);
  record.timeline = record.timeline.filter((t) => t.kind !== 'PROPOSED' && t.kind !== 'SUBMITTED');
  record.timeline.unshift({ at: item.created_at, kind: 'SUBMITTED', label: 'Loaded from backend history' });
  if (item.review_state && item.review_state !== 'NONE') record.review = { status: item.review_state };
  if (item.execution_status && item.execution_status !== 'NOT_ATTEMPTED') {
    record.execution = { status: item.execution_status, at: item.created_at, gateway: 'backend', message: `Reported by backend: ${item.execution_status}` };
  }
  return record;
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return ctx;
}

export function useRecord(id: string | null | undefined): EvaluationRecord | undefined {
  const { state } = useAppStore();
  return id ? state.records.find((r) => r.id === id) : undefined;
}
