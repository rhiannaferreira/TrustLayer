/**
 * Normalizers for the live FastAPI backend.
 *
 * The backend contract was described to the frontend team in prose (field names, status codes),
 * but its exact JSON schemas were not available when this was written. Every function here is
 * therefore tolerant: it maps the documented fields, keeps the raw JSON for inspection, and
 * records a "contract note" for anything that does not match expectations instead of guessing.
 * Nothing here invents values — a missing field stays missing and is shown as such.
 */
import type {
  AgentAction,
  AgentRunSummary,
  DiscoveredProduct,
  DiscoverySummary,
  RankedProduct,
  AiOutcome,
  Alternative,
  CheckStatus,
  Decision,
  EvaluationCheck,
  EvaluationRequest,
  EvaluationResponse,
  EvidenceFlag,
  EvidenceItem,
  FlagOrigin,
  FlagSeverity,
  Product,
  ReviewStatus,
  RiskLevel,
} from '@/types';

type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

export function unwrapList(body: unknown, keys = ['items', 'results', 'data']): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (isObj(body)) {
    for (const k of keys) if (Array.isArray(body[k])) return body[k] as unknown[];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

const DECISIONS: Decision[] = ['ALLOW', 'BLOCK', 'REVIEW_REQUIRED'];
const RISKS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function normalizeDecision(v: unknown): Decision | undefined {
  const s = str(v)?.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return DECISIONS.find((d) => d === s);
}

export function normalizeRisk(v: unknown): RiskLevel | undefined {
  const s = str(v)?.trim().toUpperCase();
  return RISKS.find((r) => r === s);
}

export function normalizeCheckStatus(v: unknown, passed?: unknown): CheckStatus | undefined {
  const s = str(v)?.trim().toUpperCase();
  if (s === 'PASS' || s === 'PASSED' || s === 'OK' || s === 'SUCCESS') return 'PASS';
  if (s === 'FAIL' || s === 'FAILED' || s === 'BLOCK' || s === 'BLOCKED' || s === 'VIOLATION') return 'FAIL';
  if (s === 'WARN' || s === 'WARNING' || s === 'REVIEW' || s === 'REVIEW_REQUIRED') return 'WARN';
  if (typeof passed === 'boolean') return passed ? 'PASS' : 'FAIL';
  return undefined;
}

function normalizeSeverity(v: unknown): FlagSeverity {
  const s = str(v)?.trim().toUpperCase();
  if (s === 'HIGH' || s === 'CRITICAL') return 'HIGH';
  if (s === 'LOW' || s === 'INFO') return 'LOW';
  return 'MEDIUM';
}

/** Map a raw ai_status string to a display category. The raw string is always kept too. */
export function classifyAiStatus(status: unknown, analysis?: unknown, error?: unknown): AiOutcome {
  const s = str(status)?.trim().toLowerCase();
  if (!s) {
    if (str(error)) return 'failed';
    return analysis !== undefined && analysis !== null ? 'unknown' : 'none';
  }
  if (/^(completed?|success(ful)?|succeeded|ok|done|analy[sz]ed)$/.test(s)) return 'completed';
  if (/(fail|error|timeout|timed_out|exception)/.test(s)) return 'failed';
  if (/(unavailable|not_configured|unconfigured|missing|no_credentials|offline)/.test(s)) return 'unavailable';
  if (/(not_requested|disabled|skipped|off|none|not_used|declined)/.test(s)) return 'not_requested';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function normalizeAction(v: unknown): AgentAction | undefined {
  if (!isObj(v)) return undefined;
  const type = str(pick(v, ['type', 'tool', 'name', 'action_type']));
  if (!type) return undefined;
  const params = pick(v, ['parameters', 'params', 'arguments', 'args']);
  return { type, parameters: isObj(params) ? (params as AgentAction['parameters']) : {} };
}

export function normalizeChecks(v: unknown, notes: string[]): EvaluationCheck[] {
  if (v === undefined || v === null) {
    notes.push('`checks` missing — treated as empty.');
    return [];
  }
  // Accept { check_name: {...} } maps as well as arrays.
  const list = Array.isArray(v) ? v : isObj(v) ? Object.entries(v).map(([k, val]) => (isObj(val) ? { name: k, ...val } : { name: k, status: val })) : null;
  if (!list) {
    notes.push('`checks` is not an array — ignored.');
    return [];
  }
  const out: EvaluationCheck[] = [];
  list.forEach((c, i) => {
    if (!isObj(c)) {
      notes.push(`checks[${i}] is not an object — ignored.`);
      return;
    }
    const status = normalizeCheckStatus(pick(c, ['status', 'result', 'outcome']), c.passed);
    const name = str(pick(c, ['name', 'check', 'check_name', 'title', 'id', 'rule'])) ?? `Check ${i + 1}`;
    if (!status) notes.push(`checks[${i}] (“${name}”) has an unrecognised status ${JSON.stringify(c.status)} — shown as WARN.`);
    const check: EvaluationCheck & Record<string, unknown> = {
      ...c,
      name,
      status: status ?? 'WARN',
      reason: str(pick(c, ['reason', 'message', 'detail', 'details', 'explanation', 'description'])) ?? '',
    };
    const policy = str(pick(c, ['policy_id', 'policy']));
    if (policy) check.policy_id = policy;
    out.push(check);
  });
  return out;
}

export function normalizeFlags(v: unknown, notes: string[], defaultOrigin: FlagOrigin = 'deterministic'): EvidenceFlag[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    notes.push('`evidence_flags` is not an array — ignored.');
    return [];
  }
  return v.map((f, i): EvidenceFlag => {
    if (typeof f === 'string') return { evidence_id: '', type: 'flag', severity: 'MEDIUM', description: f, origin: defaultOrigin };
    if (!isObj(f)) {
      notes.push(`evidence_flags[${i}] is not an object.`);
      return { evidence_id: '', type: 'flag', severity: 'MEDIUM', description: JSON.stringify(f), origin: defaultOrigin };
    }
    const originRaw = str(pick(f, ['origin', 'source_type', 'detector', 'detected_by', 'method']))?.toLowerCase() ?? '';
    const origin: FlagOrigin = /ai|llm|model|luminal/.test(originRaw) ? 'ai' : originRaw ? (/(rule|pattern|regex|determin|heuristic)/.test(originRaw) ? 'deterministic' : 'unknown') : defaultOrigin;
    const matched = str(pick(f, ['matched_text', 'match', 'text', 'snippet', 'excerpt', 'pattern_match']));
    return {
      evidence_id: str(pick(f, ['evidence_id', 'evidence', 'id', 'source_id'])) ?? '',
      type: str(pick(f, ['type', 'rule', 'flag', 'category', 'pattern', 'kind'])) ?? 'flag',
      severity: normalizeSeverity(pick(f, ['severity', 'level', 'risk'])),
      description: str(pick(f, ['description', 'reason', 'message', 'detail', 'label'])) ?? str(f.type) ?? 'Flagged evidence',
      matched_text: matched,
      start: num(f.start),
      end: num(f.end),
      origin,
    };
  });
}

export function normalizeAlternatives(v: unknown, notes: string[]): Alternative[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    notes.push('`alternatives` is not an array — ignored.');
    return [];
  }
  return v.flatMap((a, i): Alternative[] => {
    if (typeof a === 'string') return [{ product_id: a, name: a, price: NaN, vendor: '' }];
    if (!isObj(a)) {
      notes.push(`alternatives[${i}] is not an object — ignored.`);
      return [];
    }
    const inner = isObj(a.product) ? { ...a.product, ...a } : a;
    return [
      {
        product_id: str(pick(inner, ['product_id', 'id', 'sku'])) ?? '',
        name: str(pick(inner, ['name', 'product_name', 'title'])) ?? str(pick(inner, ['product_id', 'id'])) ?? 'Alternative',
        price: num(pick(inner, ['price', 'amount', 'cost'])) ?? NaN,
        vendor: str(pick(inner, ['vendor', 'merchant', 'seller'])) ?? '',
        reason: str(pick(inner, ['reason', 'why', 'description'])),
      },
    ];
  });
}

/** Pull a single integer version out of `policy_versions` when it is unambiguous. */
export function singlePolicyVersion(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (isObj(v)) {
    const nums = Object.values(v).map(num).filter((n): n is number => n !== undefined);
    if (nums.length === 1) return nums[0];
  }
  if (Array.isArray(v) && v.length === 1) {
    const only = v[0];
    if (typeof only === 'number') return only;
    if (isObj(only)) return num(pick(only, ['version', 'policy_version']));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface NormalizedEvaluation {
  response: EvaluationResponse;
  notes: string[];
  /** Fields from the history item that let us rebuild the request (if any). */
  request?: EvaluationRequest;
  requestReconstructed: boolean;
}

export class ContractError extends Error {
  readonly problems: string[];
  readonly raw: unknown;
  constructor(problems: string[], raw: unknown) {
    super(`Response does not match the evaluation contract: ${problems.join('; ')}`);
    this.name = 'ContractError';
    this.problems = problems;
    this.raw = raw;
  }
}

/**
 * Normalize one evaluation from POST/GET /api/v1/evaluations.
 * Throws ContractError when a field the UI cannot safely default is missing (id, decision,
 * execution_allowed) — those decide what the user is told about authorization.
 */
export function normalizeEvaluation(raw: unknown, fallbackRequest?: EvaluationRequest): NormalizedEvaluation {
  if (!isObj(raw)) throw new ContractError(['response is not a JSON object'], raw);
  const v = isObj(raw.evaluation) && !raw.evaluation_id ? { ...raw, ...raw.evaluation } : raw;
  const notes: string[] = [];
  const problems: string[] = [];

  const id = str(pick(v, ['evaluation_id', 'id']));
  if (!id) problems.push('evaluation_id must be a string');
  if (!v.evaluation_id && v.id) notes.push('`evaluation_id` missing; used `id`.');

  const decision = normalizeDecision(v.decision);
  if (!decision) problems.push(`decision must be one of ${DECISIONS.join(', ')} (got ${JSON.stringify(v.decision)})`);

  if (typeof v.execution_allowed !== 'boolean') problems.push('execution_allowed must be a boolean');

  if (problems.length) throw new ContractError(problems, raw);

  let risk = normalizeRisk(v.risk_level);
  if (!risk) {
    notes.push(`risk_level ${JSON.stringify(v.risk_level)} not recognised — shown as MEDIUM.`);
    risk = 'MEDIUM';
  }

  const action = normalizeAction(v.action);
  if (v.action !== undefined && !action) notes.push('`action` present but not in {type, parameters} form.');
  const created = str(v.created_at);
  if (!created) notes.push('`created_at` missing — using the time the response was received.');
  if (v.ai_status === undefined) notes.push('`ai_status` missing.');

  const response: EvaluationResponse = {
    evaluation_id: id!,
    decision: decision!,
    risk_level: risk,
    checks: normalizeChecks(v.checks, notes),
    reason: str(pick(v, ['reason', 'explanation', 'summary'])) ?? '',
    evidence_flags: normalizeFlags(v.evidence_flags, notes),
    alternatives: normalizeAlternatives(v.alternatives, notes),
    execution_allowed: v.execution_allowed as boolean,
    created_at: created ?? new Date().toISOString(),
    policy_version: num(v.policy_version) ?? singlePolicyVersion(v.policy_versions),
    agent_id: str(v.agent_id),
    action,
    policy_versions: v.policy_versions,
    ai_analysis: v.ai_analysis ?? null,
    ai_status: v.ai_status === undefined || v.ai_status === null ? null : str(v.ai_status) ?? JSON.stringify(v.ai_status),
    ai_error: v.ai_error === undefined || v.ai_error === null ? null : str(v.ai_error) ?? JSON.stringify(v.ai_error),
    review_status: str(v.review_status) ?? null,
    executed: typeof v.executed === 'boolean' ? v.executed : undefined,
  };

  // Rebuild the request from a history item when the original is not known locally.
  let request: EvaluationRequest | undefined;
  let reconstructed = false;
  const embedded = isObj(v.request) ? v.request : isObj(v.original_request) ? v.original_request : undefined;
  if (embedded && normalizeAction(embedded.action)) {
    request = {
      agent_id: str(embedded.agent_id) ?? response.agent_id ?? 'unknown-agent',
      intent: str(embedded.intent) ?? '',
      action: normalizeAction(embedded.action)!,
      evidence: normalizeEvidence(embedded.evidence),
      policy_id: str(embedded.policy_id) ?? 'unknown',
      use_ai: typeof embedded.use_ai === 'boolean' ? embedded.use_ai : undefined,
    };
  } else if (fallbackRequest) {
    request = fallbackRequest;
  } else {
    reconstructed = true;
    request = {
      agent_id: response.agent_id ?? 'unknown-agent',
      intent: str(v.intent) ?? '',
      action: action ?? { type: 'unknown', parameters: {} },
      evidence: normalizeEvidence(v.evidence),
      policy_id: str(v.policy_id) ?? 'unknown',
      use_ai: typeof v.use_ai === 'boolean' ? v.use_ai : undefined,
    };
  }

  return { response, notes, request, requestReconstructed: reconstructed };
}

export function normalizeEvidence(v: unknown): EvidenceItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e, i): EvidenceItem[] => {
    if (typeof e === 'string') return [{ id: `evidence-${i + 1}`, source: 'unknown', content: e }];
    if (!isObj(e)) return [];
    return [
      {
        id: str(pick(e, ['id', 'evidence_id'])) ?? `evidence-${i + 1}`,
        source: str(pick(e, ['source', 'type'])) ?? 'unknown',
        content: str(pick(e, ['content', 'text', 'body'])) ?? '',
        url: str(e.url),
      },
    ];
  });
}

export function normalizeReviewStatus(v: unknown): ReviewStatus | undefined {
  const s = str(v)?.trim().toUpperCase();
  if (!s) return undefined;
  if (s === 'NONE' || s === 'NOT_REQUIRED' || s === 'N/A') return 'NONE';
  if (s.startsWith('PENDING') || s === 'REQUIRED' || s === 'AWAITING' || s === 'OPEN') return 'PENDING';
  if (s.startsWith('APPROV')) return 'APPROVED';
  if (s.startsWith('REJECT') || s.startsWith('DENIED') || s === 'DENY') return 'REJECTED';
  return undefined;
}

// ---------------------------------------------------------------------------
// AI analysis (shape not specified: summarised generically)
// ---------------------------------------------------------------------------

export interface AiAnalysisView {
  summary?: string;
  findings: Array<{ text: string; severity?: string; evidence_id?: string; quote?: string }>;
  recommendation?: string;
  risk?: string;
  provider?: string;
  model?: string;
  /** Remaining fields rendered as JSON. */
  other: Obj;
}

export function summarizeAiAnalysis(v: unknown): AiAnalysisView | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') return { summary: v, findings: [], other: {} };
  if (Array.isArray(v)) return { findings: v.map((x) => findingFrom(x)), other: {} };
  if (!isObj(v)) return { summary: String(v), findings: [], other: {} };
  const used = new Set<string>();
  const take = (keys: string[]) => {
    for (const k of keys) {
      if (v[k] !== undefined && v[k] !== null) {
        used.add(k);
        return v[k];
      }
    }
    return undefined;
  };
  const summary = str(take(['summary', 'analysis', 'explanation', 'assessment', 'reasoning', 'rationale']));
  const findingsRaw = take(['findings', 'concerns', 'issues', 'flags', 'suspicious_content', 'suspicions', 'warnings']);
  const findings = Array.isArray(findingsRaw) ? findingsRaw.map((x) => findingFrom(x)) : findingsRaw !== undefined ? [findingFrom(findingsRaw)] : [];
  const recommendation = str(take(['recommendation', 'recommended_decision', 'verdict', 'suggested_decision']));
  const risk = str(take(['risk', 'risk_level', 'risk_assessment']));
  const provider = str(take(['provider']));
  const model = str(take(['model', 'model_name']));
  const other: Obj = {};
  for (const [k, val] of Object.entries(v)) if (!used.has(k)) other[k] = val;
  return { summary, findings, recommendation, risk, provider, model, other };
}

function findingFrom(x: unknown): AiAnalysisView['findings'][number] {
  if (typeof x === 'string') return { text: x };
  if (isObj(x)) {
    return {
      text: str(pick(x, ['description', 'finding', 'message', 'reason', 'text', 'summary'])) ?? JSON.stringify(x),
      severity: str(pick(x, ['severity', 'level', 'risk'])),
      evidence_id: str(pick(x, ['evidence_id', 'evidence'])),
      quote: str(pick(x, ['quote', 'matched_text', 'excerpt', 'snippet'])),
    };
  }
  return { text: JSON.stringify(x) };
}

// ---------------------------------------------------------------------------
// AI status endpoint
// ---------------------------------------------------------------------------

export interface AiServiceStatus {
  configured: boolean | undefined;
  provider?: string;
  model?: string;
  mode?: string;
  /** Whether the backend itself reports a verified inference (only if it says so). */
  inference_verified?: boolean;
  raw: unknown;
}

export function normalizeAiStatus(raw: unknown): AiServiceStatus {
  if (!isObj(raw)) return { configured: undefined, raw };
  const configuredRaw = pick(raw, ['configured', 'credentials_loaded', 'enabled', 'available', 'ready']);
  const statusStr = str(pick(raw, ['status', 'state']))?.toLowerCase();
  let configured: boolean | undefined = typeof configuredRaw === 'boolean' ? configuredRaw : undefined;
  if (configured === undefined && statusStr) {
    if (/(configured|ready|ok|enabled|available)/.test(statusStr) && !/not|un/.test(statusStr)) configured = true;
    else if (/(not|un|disabled|missing|error)/.test(statusStr)) configured = false;
  }
  const verifiedRaw = pick(raw, ['inference_verified', 'last_inference_ok', 'verified']);
  return {
    configured,
    provider: str(pick(raw, ['provider', 'provider_name'])),
    model: str(pick(raw, ['model', 'model_name', 'model_id'])),
    mode: str(pick(raw, ['mode', 'ai_mode'])),
    inference_verified: typeof verifiedRaw === 'boolean' ? verifiedRaw : undefined,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function normalizeCatalog(raw: unknown): Product[] | null {
  const list = unwrapList(raw, ['items', 'products', 'catalog', 'data']);
  if (!list) return null;
  return list.flatMap((p): Product[] => {
    if (!isObj(p)) return [];
    const id = str(pick(p, ['product_id', 'id', 'sku']));
    if (!id) return [];
    return [
      {
        id,
        name: str(pick(p, ['name', 'product_name', 'title'])) ?? id,
        category: str(p.category) ?? 'uncategorized',
        price: num(pick(p, ['price', 'amount'])) ?? NaN,
        vendor: str(pick(p, ['vendor', 'merchant', 'seller'])) ?? '',
        rating: num(p.rating) ?? NaN,
        review_count: num(pick(p, ['review_count', 'reviews_count'])) ?? NaN,
        features: Array.isArray(p.features) ? p.features.map(String) : [],
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Agent proposal
// ---------------------------------------------------------------------------

export interface LiveProposal {
  request: EvaluationRequest;
  reasoning: string;
  scenario?: string;
  seeded: boolean;
  notes: string[];
  raw: unknown;
}

export function normalizeProposal(raw: unknown, intent: string, agentId: string, policyId: string): LiveProposal {
  if (!isObj(raw)) throw new ContractError(['proposal response is not a JSON object'], raw);
  const v = isObj(raw.proposal) ? { ...raw, ...raw.proposal } : raw;
  const notes: string[] = [];
  const action = normalizeAction(pick(v, ['action', 'proposed_action', 'tool_call']));
  if (!action) throw new ContractError(['proposal has no `action` with a `type`'], raw);
  const evidence = normalizeEvidence(v.evidence);
  if (!Array.isArray(v.evidence)) notes.push('Proposal has no `evidence` array; evaluating without evidence.');
  const scenario = str(pick(v, ['scenario', 'scenario_id', 'seed', 'seeded_scenario']));
  const seededFlag = pick(v, ['seeded', 'is_seeded', 'deterministic']);
  return {
    request: {
      agent_id: str(v.agent_id) ?? agentId,
      intent: str(pick(v, ['intent', 'task'])) ?? intent,
      action,
      evidence,
      policy_id: str(v.policy_id) ?? policyId,
    },
    reasoning: str(pick(v, ['reasoning', 'agent_reasoning', 'rationale', 'explanation'])) ?? '',
    scenario,
    // The team confirmed the propose endpoint uses seeded scenarios; respect an explicit false.
    seeded: typeof seededFlag === 'boolean' ? seededFlag : true,
    notes,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Agent run (POST /api/v1/agent/run): discovery → ranking → proposal → evaluation
// ---------------------------------------------------------------------------

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** A product record. Returns null when an authorization-relevant field is missing; nothing is filled in. */
export function normalizeDiscoveredProduct(v: unknown): DiscoveredProduct | null {
  if (!isObj(v)) return null;
  const id = str(v.product_id);
  const title = str(pick(v, ['title', 'name']));
  const price = num(v.price);
  const currency = str(v.currency);
  if (!id || !title || price === undefined || !currency) return null;
  return {
    product_id: id,
    provider: str(v.provider) ?? 'unknown',
    provider_product_id: str(v.provider_product_id),
    title,
    category: str(v.category) ?? null,
    category_source: str(v.category_source),
    provider_category: str(v.provider_category) ?? null,
    price,
    currency,
    seller: str(pick(v, ['seller', 'vendor'])) ?? null,
    product_url: typeof v.product_url === 'string' && /^https:\/\//.test(v.product_url) ? v.product_url : null,
    image_url: str(v.image_url) ?? null,
    availability: str(v.availability),
    condition: str(v.condition) ?? null,
    rating: num(v.rating) ?? null,
    source: str(v.source) ?? 'unknown',
    provenance: str(v.provenance) ?? 'unknown',
    provider_fields: strList(v.provider_fields),
    unverified_fields: strList(v.unverified_fields),
    requirements_matched: strList(v.requirements_matched),
    requirements_unconfirmed: strList(v.requirements_unconfirmed),
    notes: strList(v.notes),
    retrieved_at: str(v.retrieved_at),
  };
}

function normalizeRanked(v: unknown): RankedProduct | null {
  if (!isObj(v)) return null;
  const product = normalizeDiscoveredProduct(v.product);
  if (!product) return null;
  return { product, rank: num(v.rank) ?? 0, reason: str(v.reason) ?? null, tradeoffs: str(v.tradeoffs) ?? null };
}

function normalizeDiscovery(v: unknown, problems: string[]): DiscoverySummary {
  const d = isObj(v) ? v : {};
  if (!isObj(v)) problems.push('`discovery` must be an object');
  const q = isObj(d.query) ? d.query : {};
  const counts: Record<string, number> = {};
  if (isObj(d.excluded_counts)) for (const [k, n] of Object.entries(d.excluded_counts)) if (num(n) !== undefined) counts[k] = num(n)!;
  const noMatch = isObj(d.no_match) ? { code: str(d.no_match.code) ?? 'NO_MATCH', message: str(d.no_match.message) ?? '' } : null;
  return {
    search_id: str(d.search_id) ?? '',
    status: str(d.status) ?? 'UNKNOWN',
    query: {
      categories: strList(q.categories),
      requirements: strList(q.requirements),
      max_price: num(q.max_price) ?? null,
      min_price: num(q.min_price) ?? null,
      currency: str(q.currency) ?? 'USD',
    },
    catalog_mode: str(d.catalog_mode) ?? 'unknown',
    provider: str(d.provider) ?? 'unknown',
    provider_error: str(d.provider_error) ?? null,
    returned_count: num(d.returned_count) ?? 0,
    matched_count: num(d.matched_count) ?? 0,
    excluded_counts: counts,
    excluded: Array.isArray(d.excluded)
      ? d.excluded.flatMap((e) =>
          isObj(e) && str(e.product_id)
            ? [{ product_id: str(e.product_id)!, title: str(e.title) ?? '', category: str(e.category) ?? null, price: num(e.price) ?? NaN, currency: str(e.currency) ?? '', reason: str(e.reason) ?? '' }]
            : [],
        )
      : [],
    results: Array.isArray(d.results) ? d.results.map(normalizeDiscoveredProduct).filter((p): p is DiscoveredProduct => p !== null) : [],
    no_match: noMatch,
  };
}

export interface LiveAgentRun {
  summary: AgentRunSummary;
  /** The proposal as evaluated by the backend; null for NO_MATCH. */
  proposal: { request: EvaluationRequest; reasoning: string; source: string } | null;
  evaluation: NormalizedEvaluation | null;
  raw: unknown;
}

export function normalizeAgentRun(raw: unknown, intent: string, agentId: string, policyId: string): LiveAgentRun {
  if (!isObj(raw)) throw new ContractError(['agent run response is not a JSON object'], raw);
  const problems: string[] = [];
  const status = str(raw.status);
  if (!status) problems.push('`status` must be a string');
  const discovery = normalizeDiscovery(raw.discovery, problems);
  const ranking = isObj(raw.ranking) ? { ranking_source: str(raw.ranking.ranking_source) ?? 'unknown', summary: str(raw.ranking.summary) ?? null } : null;
  const recommendation = raw.recommendation == null ? null : normalizeRanked(raw.recommendation);
  if (raw.recommendation != null && !recommendation) problems.push('`recommendation.product` is missing an id, title, price or currency');
  const alternatives = Array.isArray(raw.alternatives) ? raw.alternatives.map(normalizeRanked).filter((a): a is RankedProduct => a !== null) : [];

  let proposal: LiveAgentRun['proposal'] = null;
  let evaluation: NormalizedEvaluation | null = null;
  if (status !== 'NO_MATCH') {
    const p = isObj(raw.proposal) ? raw.proposal : null;
    const action = p ? normalizeAction(p.action) : undefined;
    if (!p || !action) problems.push('`proposal.action` is required unless status is NO_MATCH');
    if (!isObj(raw.evaluation)) problems.push('`evaluation` is required unless status is NO_MATCH');
    if (!recommendation) problems.push('`recommendation` is required unless status is NO_MATCH');
    if (problems.length) throw new ContractError(problems, raw);
    const request: EvaluationRequest = {
      agent_id: str(p!.agent_id) ?? agentId,
      intent: str(p!.intent) ?? intent,
      action: action!,
      evidence: normalizeEvidence(p!.evidence),
      policy_id: str(p!.policy_id) ?? policyId,
    };
    const reasoning = str(p!.agent_reasoning) ?? '';
    proposal = { request, reasoning, source: str(p!.proposal_source) ?? 'unknown' };
    evaluation = normalizeEvaluation(raw.evaluation, request);
  } else if (problems.length) {
    throw new ContractError(problems, raw);
  }
  return {
    summary: { status: status!, message: str(raw.message) ?? discovery.no_match?.message ?? null, discovery, ranking, recommendation, alternatives },
    proposal,
    evaluation,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Execution gateway
// ---------------------------------------------------------------------------

export function executionReference(body: unknown): string | undefined {
  if (!isObj(body)) return undefined;
  return str(pick(body, ['execution_id', 'order_id', 'reference', 'confirmation_id', 'transaction_id', 'id']));
}

export function executionMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (!isObj(body)) return undefined;
  const d = pick(body, ['message', 'detail', 'result', 'status_message']);
  if (typeof d === 'string') return d;
  if (isObj(d)) return str(pick(d, ['message', 'detail'])) ?? JSON.stringify(d);
  return undefined;
}

/** FastAPI errors: `detail` may be a string, an object, or a list of validation errors. */
export function describeErrorDetail(body: unknown): string | undefined {
  const detail = isObj(body) && 'detail' in body ? body.detail : body;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (!isObj(d)) return String(d);
        const loc = Array.isArray(d.loc) ? d.loc.join('.') : '';
        return `${loc ? `${loc}: ` : ''}${str(d.msg) ?? JSON.stringify(d)}`;
      })
      .join('; ');
  }
  if (isObj(detail)) return str(pick(detail, ['message', 'detail', 'error', 'reason'])) ?? JSON.stringify(detail);
  return undefined;
}

// ---------------------------------------------------------------------------
// Live policies (generic — the backend policy schema was not available)
// ---------------------------------------------------------------------------

export interface LivePolicy {
  id: string;
  name: string;
  version?: number;
  enabled?: boolean;
  raw: Obj;
}

export function normalizePolicies(raw: unknown): LivePolicy[] | null {
  let list = unwrapList(raw, ['items', 'policies', 'data']);
  if (!list && isObj(raw)) {
    // A single policy set object, or a map of id -> policy.
    if (pick(raw, ['policy_id', 'id'])) list = [raw];
    else list = Object.entries(raw).filter(([, v]) => isObj(v)).map(([k, v]) => ({ policy_id: k, ...(v as Obj) }));
  }
  if (!list) return null;
  return list.flatMap((p): LivePolicy[] => {
    if (!isObj(p)) return [];
    const id = str(pick(p, ['policy_id', 'id']));
    if (!id) return [];
    return [
      {
        id,
        name: str(pick(p, ['name', 'title'])) ?? id,
        version: num(pick(p, ['version', 'policy_version'])),
        enabled: typeof p.enabled === 'boolean' ? p.enabled : undefined,
        raw: p,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Audit events (SQLite-backed on the backend; shape normalised generically)
// ---------------------------------------------------------------------------

export function normalizeAuditEvent(raw: unknown, index: number): import('@/types').AuditEvent | null {
  if (!isObj(raw)) return null;
  const evaluationId = str(pick(raw, ['evaluation_id', 'evaluation']));
  const ts = str(pick(raw, ['timestamp', 'created_at', 'at', 'time'])) ?? '';
  const details = isObj(raw.details) ? raw.details : isObj(raw.payload) ? raw.payload : {};
  const merged: Obj = { ...details, ...raw };
  const notes: string[] = [];
  return {
    event_id: str(pick(raw, ['event_id', 'id'])) ?? `backend-event-${index}`,
    evaluation_id: evaluationId ?? '—',
    timestamp: ts,
    agent_id: str(merged.agent_id) ?? '—',
    action: normalizeAction(merged.action) ?? { type: str(pick(merged, ['event_type', 'type', 'event'])) ?? 'event', parameters: {} },
    checks: merged.checks !== undefined ? normalizeChecks(merged.checks, notes) : [],
    policy_version: num(merged.policy_version) ?? singlePolicyVersion(merged.policy_versions) ?? null,
    decision: normalizeDecision(merged.decision) ?? null,
    risk_level: normalizeRisk(merged.risk_level) ?? null,
    event_type: str(pick(raw, ['event_type', 'type', 'event', 'kind'])),
    raw,
    execution_status: merged.executed === true ? 'EXECUTED' : 'NOT_ATTEMPTED',
    explanation: str(pick(merged, ['explanation', 'reason', 'message', 'event_type', 'type'])) ?? '',
    review_state: normalizeReviewStatus(merged.review_status) ?? 'NONE',
    source: 'api',
  };
}
