/**
 * Compares two recorded evaluations (e.g. an Attack Lab original vs. modified run).
 * Pure function over stored data: it reports exactly what differs and nothing else.
 */
import type { CheckStatus, Decision, EvaluationRecord, EvidenceFlag, RiskLevel } from '@/types';

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface CheckChange {
  name: string;
  before?: CheckStatus;
  after?: CheckStatus;
  beforeReason?: string;
  afterReason?: string;
}

export interface Comparison {
  inputChanges: FieldChange[];
  checkChanges: CheckChange[];
  newFlags: EvidenceFlag[];
  resolvedFlags: EvidenceFlag[];
  decision: { before: Decision; after: Decision; changed: boolean };
  risk: { before: RiskLevel; after: RiskLevel; changed: boolean };
  execution: { before: boolean; after: boolean; changed: boolean };
  ai: { before: string | null; after: string | null; changed: boolean };
  /** True when no outcome differs (inputs may still differ). */
  outcomeUnchanged: boolean;
}

function show(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function flagKey(f: EvidenceFlag): string {
  return `${f.type}|${(f.matched_text ?? f.description).trim().toLowerCase()}`;
}

export function compareEvaluations(original: EvaluationRecord, modified: EvaluationRecord): Comparison {
  const a = original.request;
  const b = modified.request;
  const inputChanges: FieldChange[] = [];
  const diff = (field: string, x: unknown, y: unknown) => {
    const sx = show(x);
    const sy = show(y);
    if (sx !== sy) inputChanges.push({ field, before: sx, after: sy });
  };

  diff('action.type', a.action.type, b.action.type);
  const keys = Array.from(new Set([...Object.keys(a.action.parameters ?? {}), ...Object.keys(b.action.parameters ?? {})])).sort();
  for (const k of keys) diff(`action.parameters.${k}`, a.action.parameters?.[k], b.action.parameters?.[k]);
  diff('intent', a.intent, b.intent);
  const evCount = Math.max(a.evidence.length, b.evidence.length);
  for (let i = 0; i < evCount; i++) {
    diff(`evidence[${i}].source`, a.evidence[i]?.source, b.evidence[i]?.source);
    diff(`evidence[${i}].content`, a.evidence[i]?.content, b.evidence[i]?.content);
  }
  diff('use_ai', a.use_ai, b.use_ai);
  diff('context.permissions', a.context?.permissions?.join(', '), b.context?.permissions?.join(', '));
  diff('agent_id', a.agent_id, b.agent_id);

  const checkChanges: CheckChange[] = [];
  const before = new Map(original.response.checks.map((c) => [c.name, c]));
  const after = new Map(modified.response.checks.map((c) => [c.name, c]));
  for (const name of Array.from(new Set([...before.keys(), ...after.keys()]))) {
    const x = before.get(name);
    const y = after.get(name);
    if (x?.status !== y?.status) checkChanges.push({ name, before: x?.status, after: y?.status, beforeReason: x?.reason, afterReason: y?.reason });
  }

  const origFlags = new Set(original.response.evidence_flags.map(flagKey));
  const modFlags = new Set(modified.response.evidence_flags.map(flagKey));
  const newFlags = modified.response.evidence_flags.filter((f) => !origFlags.has(flagKey(f)));
  const resolvedFlags = original.response.evidence_flags.filter((f) => !modFlags.has(flagKey(f)));

  const decision = { before: original.response.decision, after: modified.response.decision, changed: original.response.decision !== modified.response.decision };
  const risk = { before: original.response.risk_level, after: modified.response.risk_level, changed: original.response.risk_level !== modified.response.risk_level };
  const execution = { before: original.response.execution_allowed, after: modified.response.execution_allowed, changed: original.response.execution_allowed !== modified.response.execution_allowed };
  const aiBefore = original.response.ai_status ?? null;
  const aiAfter = modified.response.ai_status ?? null;
  const ai = { before: aiBefore, after: aiAfter, changed: aiBefore !== aiAfter };

  return {
    inputChanges,
    checkChanges,
    newFlags,
    resolvedFlags,
    decision,
    risk,
    execution,
    ai,
    outcomeUnchanged: !decision.changed && !risk.changed && !execution.changed && checkChanges.length === 0 && newFlags.length === 0 && resolvedFlags.length === 0,
  };
}
