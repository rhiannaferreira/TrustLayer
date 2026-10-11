/**
 * Decision investigation model: maps a recorded evaluation onto the eight-node TrustLayer
 * pipeline. Everything here is derived from the stored request/response — no timing,
 * no AI output and no check results are invented. A node with no recorded check says so.
 */
import { classifyAiStatus } from '@/services/liveContract';
import { worstStatus } from './pipeline';
import { authorizeExecution } from '@/services/toolGateway';
import { formatCurrency } from './format';
import type { AiOutcome, AnyPolicy, CheckStatus, EvaluationCheck, EvaluationRecord, EvidenceFlag } from '@/types';

export type NodeId = 'proposal' | 'tool' | 'product' | 'spending' | 'vendor' | 'evidence' | 'decision' | 'gateway';

export type NodeStatus = 'pass' | 'warn' | 'fail' | 'info' | 'not_evaluated' | 'pending';

export interface NodeDefinition {
  id: NodeId;
  title: string;
  subtitle: string;
}

export const INVESTIGATION_NODES: NodeDefinition[] = [
  { id: 'proposal', title: 'Agent Proposal', subtitle: 'Tool call proposed by the agent' },
  { id: 'tool', title: 'Tool Authorization', subtitle: 'Is the agent allowed this tool?' },
  { id: 'product', title: 'Product Verification', subtitle: 'Is the target real and sensible?' },
  { id: 'spending', title: 'Spending Policy', subtitle: 'Within the configured limit?' },
  { id: 'vendor', title: 'Vendor Authorization', subtitle: 'Approved vendor?' },
  { id: 'evidence', title: 'Evidence Analysis', subtitle: 'Untrusted content inspection' },
  { id: 'decision', title: 'Final Decision', subtitle: 'ALLOW · BLOCK · REVIEW' },
  { id: 'gateway', title: 'Execution Gateway', subtitle: 'Server-side enforcement' },
];

const OLD_STAGE: Record<string, NodeId> = {
  receive: 'proposal',
  permissions: 'tool',
  evidence: 'evidence',
  quality: 'product',
  risk: 'spending',
  decision: 'decision',
};

/** Ordered keyword rules: the first match wins. */
const KEYWORDS: Array<[NodeId, RegExp]> = [
  ['decision', /\b(final|overall)\b|^decision/i],
  ['vendor', /vendor|merchant|seller|allowlist|allow-list/i],
  ['spending', /spend|budget|limit|price|amount|cost|max(imum)? purchase/i],
  ['evidence', /evidence|inject|untrusted|suspicious|review content|manipulat|\bai\b|llm|luminal/i],
  ['product', /product|catalog|verif|value|quality|alignment|depth|stock|sku/i],
  ['proposal', /schema|intent captured|user intent|receiv|parse|format|proposal/i],
  ['tool', /permission|tool|restricted|action|scope|access|authori[sz]/i],
];

export function nodeForCheck(check: EvaluationCheck): { node: NodeId; classified: boolean } {
  const explicit = (check as { node?: unknown }).node;
  if (typeof explicit === 'string' && INVESTIGATION_NODES.some((n) => n.id === explicit)) return { node: explicit as NodeId, classified: true };
  const text = `${check.name} ${check.policy_id ?? ''}`;
  for (const [node, re] of KEYWORDS) if (re.test(text)) return { node, classified: true };
  if (check.stage && OLD_STAGE[check.stage]) return { node: OLD_STAGE[check.stage], classified: true };
  return { node: 'decision', classified: false };
}

export interface NodeView {
  id: NodeId;
  title: string;
  subtitle: string;
  status: NodeStatus;
  /** One-line summary of what was recorded at this node. */
  headline: string;
  inputs: Array<{ label: string; value: string }>;
  checks: EvaluationCheck[];
  unclassified: EvaluationCheck[];
  conditions: Array<{ label: string; value: string }>;
  flags: EvidenceFlag[];
  ai?: { outcome: AiOutcome; status: string | null; error: string | null };
  notes: string[];
}

function statusFromChecks(checks: EvaluationCheck[]): NodeStatus {
  const worst = worstStatus(checks.map((c) => c.status));
  if (worst === 'FAIL') return 'fail';
  if (worst === 'WARN') return 'warn';
  if (worst === 'PASS') return 'pass';
  return 'not_evaluated';
}

function str(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Policy conditions relevant to a node. In Demo Mode these come from the local policy set;
 * in Live Backend Mode from the backend's GET /policies (raw fields shown verbatim).
 */
export function conditionsFor(node: NodeId, demoPolicies: AnyPolicy[] | null, livePolicyRaw: Record<string, unknown> | null): Array<{ label: string; value: string }> {
  if (demoPolicies) {
    const by = (kind: AnyPolicy['kind']) => demoPolicies.find((p) => p.kind === kind);
    const out: Array<{ label: string; value: string }> = [];
    const add = (p: AnyPolicy | undefined, label: string, value: string) => p && out.push({ label: `${label}${p.enabled ? '' : ' (disabled)'}`, value });
    if (node === 'spending') {
      const p = by('spending_limit');
      if (p?.kind === 'spending_limit') add(p, 'Maximum purchase amount', formatCurrency(p.config.max_amount));
    }
    if (node === 'vendor') {
      const p = by('vendor_allowlist');
      if (p?.kind === 'vendor_allowlist') add(p, 'Allowed vendors', p.config.allowed_vendors.join(', '));
    }
    if (node === 'tool') {
      const p = by('restricted_actions');
      if (p?.kind === 'restricted_actions') add(p, 'Restricted actions', p.config.restricted_actions.join(', '));
    }
    if (node === 'evidence') {
      const p = by('untrusted_evidence');
      if (p?.kind === 'untrusted_evidence') add(p, 'Scanned sources', p.config.scan_sources.join(', '));
      const r = by('human_review');
      if (r) add(r, 'Flagged evidence routes to', r.enabled ? 'human review' : 'block (fail closed)');
    }
    return out;
  }
  if (livePolicyRaw) {
    const re: Record<NodeId, RegExp | null> = {
      spending: /spend|budget|limit|max|price|amount/i,
      vendor: /vendor|merchant|seller/i,
      tool: /action|tool|permission|restricted|allowed_actions/i,
      evidence: /evidence|inject|review|ai|suspicious|pattern/i,
      product: /product|catalog/i,
      proposal: null,
      decision: /review|escalat/i,
      gateway: /execut|gateway/i,
    };
    const pattern = re[node];
    if (!pattern) return [];
    return Object.entries(livePolicyRaw)
      .filter(([k]) => pattern.test(k))
      .map(([k, v]) => ({ label: k, value: Array.isArray(v) ? v.join(', ') : str(v) }));
  }
  return [];
}

export interface InvestigationModel {
  nodes: NodeView[];
  unclassifiedCount: number;
}

export function buildInvestigation(
  record: EvaluationRecord,
  opts: { demoPolicies?: AnyPolicy[] | null; livePolicy?: Record<string, unknown> | null } = {},
): InvestigationModel {
  const { request, response } = record;
  const action = response.action ?? request.action;
  const p = action.parameters ?? {};
  const grouped = new Map<NodeId, EvaluationCheck[]>();
  const unclassified: EvaluationCheck[] = [];
  for (const c of response.checks) {
    const { node, classified } = nodeForCheck(c);
    if (!classified) unclassified.push(c);
    else grouped.set(node, [...(grouped.get(node) ?? []), c]);
  }
  const demo = record.source === 'mock' ? opts.demoPolicies ?? null : null;
  const live = record.source === 'api' ? opts.livePolicy ?? null : null;
  const ai = { outcome: classifyAiStatus(response.ai_status, response.ai_analysis, response.ai_error), status: response.ai_status ?? null, error: response.ai_error ?? null };

  const nodes: NodeView[] = INVESTIGATION_NODES.map((def) => {
    const checks = grouped.get(def.id) ?? [];
    const base: NodeView = {
      ...def,
      status: statusFromChecks(checks),
      headline: '',
      inputs: [],
      checks,
      unclassified: [],
      conditions: conditionsFor(def.id, demo, live),
      flags: [],
      notes: [],
    };
    switch (def.id) {
      case 'proposal':
        base.inputs = [
          { label: 'Agent', value: request.agent_id },
          { label: 'Intent', value: request.intent || '—' },
          { label: 'Tool call', value: action.type },
          ...Object.entries(p).map(([k, v]) => ({ label: k, value: str(v) })),
        ];
        if (!checks.length) {
          base.status = 'info';
          base.headline = `${action.type} proposed`;
          base.notes.push('Input node: shows the proposal exactly as submitted. No validation check was recorded for it.');
        }
        if (record.request_reconstructed) base.notes.push('The backend history item did not include the original request; intent and evidence may be missing.');
        break;
      case 'tool':
        base.inputs = [{ label: 'Tool call', value: action.type }];
        if (request.context?.permissions) base.inputs.push({ label: 'Granted (demo context)', value: request.context.permissions.join(', ') || 'none' });
        break;
      case 'product':
        base.inputs = [
          { label: 'product_id', value: str(p.product_id) },
          { label: 'product_name', value: str(p.product_name) },
        ];
        break;
      case 'spending':
        base.inputs = [{ label: 'price', value: typeof p.price === 'number' ? formatCurrency(p.price) : str(p.price) }];
        break;
      case 'vendor':
        base.inputs = [{ label: 'vendor', value: str(p.vendor) }];
        break;
      case 'evidence': {
        base.flags = response.evidence_flags;
        base.inputs = request.evidence.map((e) => ({ label: `${e.id} · ${e.source}`, value: e.content }));
        base.ai = ai;
        if (!checks.length && base.flags.length) base.status = 'warn';
        if (ai.outcome === 'failed') base.notes.push('AI analysis was requested but the backend reported a failure. Deterministic checks still apply.');
        if (ai.outcome === 'completed') base.notes.push('AI analysis completed on the backend (advisory).');
        if (record.source === 'mock') base.notes.push('Demo Mode: evidence was scanned with deterministic patterns only. No AI model was called.');
        break;
      }
      case 'decision':
        base.unclassified = unclassified;
        base.status = response.decision === 'ALLOW' ? 'pass' : response.decision === 'BLOCK' ? 'fail' : 'warn';
        base.inputs = [
          { label: 'decision', value: response.decision },
          { label: 'risk_level', value: response.risk_level },
          { label: 'execution_allowed', value: String(response.execution_allowed) },
          { label: 'reason', value: response.reason || '—' },
        ];
        if (unclassified.length) base.notes.push(`${unclassified.length} check(s) could not be mapped to a specific stage and are listed here.`);
        break;
      case 'gateway': {
        const attempts = record.execution_attempts ?? (record.execution ? [record.execution] : []);
        base.inputs = [
          { label: 'evaluation_id', value: record.id },
          { label: 'execution_allowed', value: String(response.execution_allowed) },
        ];
        if (!attempts.length) {
          base.status = 'pending';
          base.headline = response.execution_allowed ? 'Authorized · not yet requested' : 'Not authorized · no attempt';
          const local = authorizeExecution(record);
          base.notes.push(record.source === 'api' ? 'No execution has been requested. The backend gateway decides when one is.' : `Simulated gateway would ${local.allowed ? 'accept' : 'refuse'}: ${local.reason}`);
        } else {
          const last = attempts[attempts.length - 1];
          base.status = record.execution?.status === 'EXECUTED' ? (last.duplicate ? 'warn' : 'pass') : last.status === 'ERROR' ? 'warn' : 'fail';
          base.headline = record.execution?.status === 'EXECUTED' ? (last.duplicate ? 'Executed · duplicate refused' : 'Executed (simulated)') : last.duplicate ? 'Duplicate refused' : last.status === 'ERROR' ? 'Gateway error' : 'Refused';
          base.inputs.push(...attempts.map((a, i) => ({ label: `attempt ${i + 1}`, value: `${a.status}${a.http_status ? ` · HTTP ${a.http_status}` : ''}${a.reference ? ` · ${a.reference}` : ''} — ${a.message}` })));
        }
        break;
      }
    }
    if (!base.headline) {
      if (checks.length) {
        const worst = checks.find((c) => c.status === 'FAIL') ?? checks.find((c) => c.status === 'WARN') ?? checks[0];
        base.headline = checks.length === 1 ? worst.reason || worst.name : `${checks.length} checks · ${worst.name}: ${worst.status}`;
      } else if (def.id === 'decision') {
        base.headline = response.reason || response.decision;
      } else if (def.id === 'evidence' && base.flags.length) {
        base.headline = `${base.flags.length} flag(s), no check recorded`;
      } else {
        base.headline = 'No check recorded for this stage';
      }
    }
    return base;
  });

  return { nodes, unclassifiedCount: unclassified.length };
}

export const STATUS_LABEL: Record<NodeStatus, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  info: 'Input',
  not_evaluated: 'Not evaluated',
  pending: 'Awaiting request',
};

export function checkStatusToNode(s: CheckStatus): NodeStatus {
  return s === 'PASS' ? 'pass' : s === 'WARN' ? 'warn' : 'fail';
}
