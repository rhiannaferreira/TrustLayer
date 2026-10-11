/**
 * Shared application state. Every page reads evaluations and policies from here, so an
 * evaluation run in Attack Lab shows up immediately on the Overview, Live Decisions and
 * Audit Trail, and a policy edit affects the very next evaluation.
 *
 * Two operating modes, never mixed:
 * - Demo Mode ('mock'): the deterministic in-browser engine. Clearly labelled as simulated.
 * - Live Backend Mode ('api'): the FastAPI backend. Errors are surfaced; nothing is ever
 *   replaced with a mock result.
 *
 * Demo state is persisted to localStorage. It is NOT an immutable audit log.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { ENV_CONFIG, STORAGE_KEYS } from '@/lib/config';
import { defaultPolicySet, POLICY_SET_ID } from '@/data/policies';
import { createSeedRecords } from '@/lib/seed';
import { buildRecord, withExecution } from '@/lib/records';
import { createHttpClient, ApiError, type ReviewOutcome, type Trace } from '@/services/api';
import { createMockClient } from '@/services/mockApi';
import { submitToGateway } from '@/services/toolGateway';
import { isObj, normalizeEvaluation, normalizeReviewStatus, type LivePolicy, type LiveProposal, type NormalizedEvaluation } from '@/services/liveContract';
import { agentName } from '@/data/agents';
import type {
  AnyPolicy,
  DataSource,
  EvaluationRecord,
  EvaluationRequest,
  ExecutionResult,
  PolicyPatch,
  PolicySet,
  Product,
  RecordOrigin,
  ReviewState,
} from '@/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface Settings {
  dataSource: DataSource;
  apiBaseUrl: string;
  /** Request optional AI (Luminal) analysis on live evaluations. */
  useAi: boolean;
  /**
   * Demo workflow option: submit ALLOW decisions to the gateway right after evaluation.
   * Off by default — execution is a separate, explicit user action.
   */
  autoExecute: boolean;
}

export interface LiveState {
  policies: LivePolicy[] | null;
  policiesRaw: unknown;
  policiesLoadedAt: string | null;
  catalog: Product[] | null;
}

export interface AppState {
  records: EvaluationRecord[];
  policySet: PolicySet;
  settings: Settings;
  demoStartedAt: string;
  live: LiveState;
}

type Action =
  | { type: 'ADD_RECORD'; record: EvaluationRecord }
  | { type: 'UPDATE_RECORD'; id: string; update: (r: EvaluationRecord) => EvaluationRecord }
  | { type: 'MERGE_REMOTE'; records: EvaluationRecord[] }
  | { type: 'SET_POLICY'; policy: AnyPolicy; bumpVersion: boolean }
  | { type: 'SET_POLICY_SET'; policySet: PolicySet }
  | { type: 'SET_SETTINGS'; settings: Partial<Settings> }
  | { type: 'SET_LIVE'; live: Partial<LiveState> }
  | { type: 'RESET'; state: AppState };

const EMPTY_LIVE: LiveState = { policies: null, policiesRaw: null, policiesLoadedAt: null, catalog: null };

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
        byId.set(incoming.id, existing ? mergeRemote(existing, incoming) : incoming);
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
    case 'SET_LIVE':
      return { ...state, live: { ...state.live, ...action.live } };
    case 'RESET':
      return action.state;
  }
}

/** Backend history wins for decision data; locally observed request/evidence/exchanges are kept. */
function mergeRemote(existing: EvaluationRecord, incoming: EvaluationRecord): EvaluationRecord {
  const keepLocalRequest = !existing.request_reconstructed;
  return {
    ...existing,
    response: { ...incoming.response, created_at: incoming.response.created_at || existing.response.created_at },
    raw: incoming.raw,
    contract_notes: incoming.contract_notes,
    request: keepLocalRequest ? existing.request : incoming.request,
    request_reconstructed: keepLocalRequest ? existing.request_reconstructed : incoming.request_reconstructed,
    review: incoming.review.status !== 'NONE' ? { ...existing.review, status: incoming.review.status } : existing.review,
    execution: existing.execution ?? incoming.execution,
  };
}

export function defaultSettings(): Settings {
  return { dataSource: ENV_CONFIG.useMocks ? 'mock' : 'api', apiBaseUrl: ENV_CONFIG.apiBaseUrl, useAi: true, autoExecute: false };
}

export function freshState(settings?: Settings): AppState {
  const now = new Date();
  const policySet = defaultPolicySet(now.toISOString());
  return {
    records: createSeedRecords(policySet, now),
    policySet,
    settings: settings ?? defaultSettings(),
    demoStartedAt: now.toISOString(),
    live: EMPTY_LIVE,
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.records) && parsed.policySet?.policies && parsed.settings) {
        return { ...parsed, settings: { ...defaultSettings(), ...parsed.settings }, live: { ...EMPTY_LIVE, ...(parsed.live ?? {}) } };
      }
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
  /** Submit to the gateway right after evaluation. Defaults to settings.autoExecute. */
  autoExecute?: boolean;
  /** Override the AI setting for this run (Live Backend Mode only). */
  useAi?: boolean;
  /** Exchanges that happened before the evaluation (e.g. the agent proposal call). */
  priorExchanges?: Trace;
}

export interface AppStoreValue {
  state: AppState;
  /** Records for the active data source only (mock vs. real API are never mixed). */
  records: EvaluationRecord[];
  policySet: PolicySet;
  dataSource: DataSource;
  apiBaseUrl: string;
  settings: Settings;
  live: LiveState;
  getRecord: (id: string) => EvaluationRecord | undefined;
  runEvaluation: (input: RunEvaluationInput) => Promise<EvaluationRecord>;
  /** Submit an evaluated action to the execution gateway. The gateway (server in live mode) decides. */
  executeRecord: (id: string) => Promise<ExecutionResult>;
  requestReview: (id: string, note?: string) => Promise<ReviewState>;
  /** Live: POST /reviews/{id}/decision. Demo: simulated reviewer decision. */
  decideReview: (id: string, outcome: ReviewOutcome, note?: string) => Promise<void>;
  resolveDemoReview: (id: string, outcome: 'APPROVED' | 'REJECTED', note?: string) => void;
  updatePolicy: (id: string, patch: PolicyPatch) => Promise<AnyPolicy>;
  resetPolicies: () => Promise<void>;
  refreshFromBackend: () => Promise<number>;
  refreshRecord: (id: string) => Promise<EvaluationRecord | undefined>;
  loadLivePolicies: () => Promise<LivePolicy[]>;
  patchLivePolicy: (id: string, patch: Record<string, unknown>) => Promise<void>;
  loadCatalog: () => Promise<Product[]>;
  proposeLive: (intent: string, scenario: string, trace: Trace) => Promise<LiveProposal>;
  proposeAiLive: (intent: string, trace: Trace) => Promise<LiveProposal>;
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
        // The backend gateway is the authority: always ask it, with the exact evaluated action.
        const trace: Trace = [];
        result = await http.execute(record.id, record.response.action ?? record.request.action, trace);
        dispatch({ type: 'UPDATE_RECORD', id, update: (r) => ({ ...r, exchanges: [...(r.exchanges ?? []), ...trace] }) });
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
      const trace: Trace = [...(input.priorExchanges ?? [])];
      let record: EvaluationRecord;
      if (source === 'mock') {
        const response = await mock.evaluate(input.request, trace);
        record = buildRecord({
          request: input.request,
          response,
          source,
          origin: input.origin,
          policyVersion: stateRef.current.policySet.version,
          scenario: input.scenario,
          retryOf: input.retryOf,
          submittedAt,
        });
        record.raw = response;
      } else {
        const request: EvaluationRequest = { ...input.request, use_ai: input.useAi ?? stateRef.current.settings.useAi };
        const result = await http.evaluate(request, trace);
        record = buildRecord({
          request,
          response: result.response,
          source,
          origin: input.origin,
          policyVersion: result.response.policy_version ?? 0,
          scenario: input.scenario,
          retryOf: input.retryOf,
          submittedAt,
        });
        record.raw = result.raw;
        record.contract_notes = result.notes;
        record.review = reviewFromResponse(result.response.review_status, result.response.decision);
      }
      record.exchanges = trace;
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
      dispatch({ type: 'ADD_RECORD', record });
      const auto = source === 'mock' && (input.autoExecute ?? stateRef.current.settings.autoExecute);
      if (auto && record.response.decision === 'ALLOW') {
        await executeRecord(record.id);
        return stateRef.current.records.find((r) => r.id === record.id) ?? record;
      }
      return record;
    },
    [mock, http, executeRecord],
  );

  const requestReview = useCallback(async (id: string, note?: string): Promise<ReviewState> => {
    const record = stateRef.current.records.find((r) => r.id === id);
    if (!record) throw new Error(`Unknown evaluation ${id}`);
    if (record.source === 'api') {
      throw new Error('The backend has no endpoint to escalate an evaluation to review. Reviews are created by the backend for REVIEW_REQUIRED decisions.');
    }
    const now = new Date().toISOString();
    const review: ReviewState = { status: 'PENDING', requested_at: now, note };
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
  }, []);

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

  const decideReview = useCallback(
    async (id: string, outcome: ReviewOutcome, note?: string) => {
      const record = stateRef.current.records.find((r) => r.id === id);
      if (!record) throw new Error(`Unknown evaluation ${id}`);
      if (record.source === 'mock') {
        resolveDemoReview(id, outcome, note);
        return;
      }
      const trace: Trace = [];
      try {
        const body = await http.reviewDecision(id, outcome, note, trace);
        const now = new Date().toISOString();
        let updatedResponse: NormalizedEvaluation | null = null;
        if (isObj(body) && (body.evaluation_id || isObj(body.evaluation))) {
          try {
            updatedResponse = normalizeEvaluation(isObj(body.evaluation) ? body.evaluation : body, record.request);
          } catch {
            updatedResponse = null;
          }
        }
        const reported = isObj(body) ? normalizeReviewStatus(body.review_status ?? body.status ?? body.decision) : undefined;
        const status = updatedResponse ? normalizeReviewStatus(updatedResponse.response.review_status) ?? reported ?? outcome : reported ?? outcome;
        dispatch({
          type: 'UPDATE_RECORD',
          id,
          update: (r) => ({
            ...r,
            response: updatedResponse ? updatedResponse.response : r.response,
            raw: updatedResponse ? body : r.raw,
            exchanges: [...(r.exchanges ?? []), ...trace],
            review: { ...r.review, status, resolved_at: now, resolved_by: 'trustlayer-console', note },
            timeline: [
              ...r.timeline,
              {
                at: now,
                kind: status === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
                label: `Reviewer decision recorded by backend: ${status.toLowerCase()}`,
                detail: 'POST /reviews/{id}/decision accepted.',
              },
            ],
          }),
        });
      } catch (err) {
        dispatch({ type: 'UPDATE_RECORD', id, update: (r) => ({ ...r, exchanges: [...(r.exchanges ?? []), ...trace] }) });
        throw err;
      }
    },
    [http, resolveDemoReview],
  );

  const updatePolicy = useCallback(
    async (id: string, patch: PolicyPatch): Promise<AnyPolicy> => {
      if (stateRef.current.settings.dataSource === 'api') {
        throw new Error('Demo policy editor is not used in Live Backend Mode; edit backend policies instead.');
      }
      const updated = await mock.updatePolicy(id, patch);
      dispatch({ type: 'SET_POLICY', policy: updated, bumpVersion: true });
      return updated;
    },
    [mock],
  );

  const resetPolicies = useCallback(async () => {
    const defaults = defaultPolicySet();
    dispatch({ type: 'SET_POLICY_SET', policySet: { ...defaults, version: stateRef.current.policySet.version + 1 } });
  }, []);

  const loadLivePolicies = useCallback(async (): Promise<LivePolicy[]> => {
    const { policies, raw } = await http.getPolicies();
    dispatch({ type: 'SET_LIVE', live: { policies, policiesRaw: raw, policiesLoadedAt: new Date().toISOString() } });
    return policies;
  }, [http]);

  const patchLivePolicy = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      await http.patchPolicy(id, patch);
      // Re-read so the UI shows the backend's confirmed state, not our optimistic guess.
      await loadLivePolicies();
    },
    [http, loadLivePolicies],
  );

  const loadCatalog = useCallback(async (): Promise<Product[]> => {
    const catalog = await http.catalog();
    dispatch({ type: 'SET_LIVE', live: { catalog } });
    return catalog;
  }, [http]);

  const proposeLive = useCallback(
    (intent: string, scenario: string, trace: Trace) => http.propose({ agent_id: 'purchase-pilot', intent, scenario, policy_id: POLICY_SET_ID }, trace),
    [http],
  );

  const proposeAiLive = useCallback(
    (intent: string, trace: Trace) => http.proposeAi({ agent_id: 'purchase-pilot', intent, policy_id: POLICY_SET_ID }, trace),
    [http],
  );

  const refreshFromBackend = useCallback(async (): Promise<number> => {
    if (stateRef.current.settings.dataSource !== 'api') return 0;
    const items = await http.listEvaluations();
    const records = items.map((item) => remoteToRecord(item));
    dispatch({ type: 'MERGE_REMOTE', records });
    try {
      await loadLivePolicies();
    } catch {
      /* policies are optional for history refresh; their own page reports errors */
    }
    return records.length;
  }, [http, loadLivePolicies]);

  const refreshRecord = useCallback(
    async (id: string) => {
      const item = await http.getEvaluation(id);
      dispatch({ type: 'MERGE_REMOTE', records: [remoteToRecord(item)] });
      return stateRef.current.records.find((r) => r.id === id);
    },
    [http],
  );

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
    settings: state.settings,
    live: state.live,
    getRecord,
    runEvaluation,
    executeRecord,
    requestReview,
    decideReview,
    resolveDemoReview,
    updatePolicy,
    resetPolicies,
    refreshFromBackend,
    refreshRecord,
    loadLivePolicies,
    patchLivePolicy,
    loadCatalog,
    proposeLive,
    proposeAiLive,
    setSettings,
    resetDemo,
  };

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

function reviewFromResponse(reviewStatus: string | null | undefined, decision: string): ReviewState {
  const s = normalizeReviewStatus(reviewStatus);
  if (s) return { status: s };
  return { status: decision === 'REVIEW_REQUIRED' ? 'PENDING' : 'NONE' };
}

export function remoteToRecord(item: NormalizedEvaluation & { raw: unknown }): EvaluationRecord {
  const { response } = item;
  const request = item.request!;
  const record = buildRecord({
    request,
    response,
    source: 'api',
    origin: 'remote',
    policyVersion: response.policy_version ?? 0,
    submittedAt: response.created_at,
  });
  record.agent_name = agentName(request.agent_id);
  record.raw = item.raw;
  record.contract_notes = item.notes;
  record.request_reconstructed = item.requestReconstructed;
  record.timeline = record.timeline.filter((t) => t.kind !== 'PROPOSED' && t.kind !== 'SUBMITTED');
  record.timeline.unshift({ at: response.created_at, kind: 'SUBMITTED', label: 'Loaded from backend history' });
  record.review = reviewFromResponse(response.review_status, response.decision);
  if (response.executed === true) {
    record.execution = { status: 'EXECUTED', at: response.created_at, gateway: 'backend', message: 'Backend history reports this action was executed (simulated).' };
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

export { ApiError };
