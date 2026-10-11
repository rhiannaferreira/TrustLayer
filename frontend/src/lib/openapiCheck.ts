/**
 * Compares the backend's live /openapi.json with what the frontend expects.
 * Runs in the browser in Live Backend Mode; nothing here is assumed when the spec is missing.
 */
import { EXPECTED_OPERATIONS } from '@/services/endpoints';

/** Evaluation response fields the frontend reads (from the team's contract description). */
export const EXPECTED_EVALUATION_FIELDS = [
  'evaluation_id',
  'agent_id',
  'action',
  'decision',
  'risk_level',
  'checks',
  'reason',
  'evidence_flags',
  'alternatives',
  'execution_allowed',
  'policy_versions',
  'ai_analysis',
  'ai_status',
  'ai_error',
  'created_at',
  'review_status',
  'executed',
];

export const EXPECTED_REQUEST_FIELDS = ['agent_id', 'intent', 'action', 'evidence', 'policy_id', 'use_ai'];

export interface ContractReport {
  checked_at: string;
  title?: string;
  version?: string;
  operations: Array<{ method: string; path: string; required: boolean; present: boolean }>;
  /** Fields of the POST /evaluations 200 response schema, when resolvable. */
  evaluationFields: { found: string[]; missing: string[]; extra: string[] } | null;
  requestFields: { found: string[]; missing: string[]; extra: string[]; required: string[] } | null;
  /** Request body property names for other POST/PATCH operations, for documentation. */
  requestBodies: Record<string, string[]>;
  problems: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function resolveRef(spec: Obj, schema: unknown, depth = 0): Obj | null {
  if (!isObj(schema) || depth > 8) return null;
  if (typeof schema.$ref === 'string') {
    const parts = schema.$ref.replace(/^#\//, '').split('/');
    let cur: unknown = spec;
    for (const p of parts) cur = isObj(cur) ? cur[p] : undefined;
    return resolveRef(spec, cur, depth + 1);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const list = schema[key];
    if (Array.isArray(list)) {
      const merged: Obj = { properties: {}, required: [] };
      for (const part of list) {
        const r = resolveRef(spec, part, depth + 1);
        if (r && isObj(r.properties)) Object.assign(merged.properties as Obj, r.properties);
        if (r && Array.isArray(r.required)) (merged.required as unknown[]).push(...r.required);
      }
      if (Object.keys(merged.properties as Obj).length) return merged;
    }
  }
  return schema;
}

function props(spec: Obj, schema: unknown): { names: string[]; required: string[] } | null {
  const r = resolveRef(spec, schema);
  if (!r || !isObj(r.properties)) return null;
  return { names: Object.keys(r.properties), required: Array.isArray(r.required) ? (r.required as string[]) : [] };
}

function jsonSchema(content: unknown): unknown {
  if (!isObj(content)) return undefined;
  const json = content['application/json'];
  return isObj(json) ? json.schema : undefined;
}

export function checkContract(spec: unknown, now = new Date()): ContractReport {
  const report: ContractReport = { checked_at: now.toISOString(), operations: [], evaluationFields: null, requestFields: null, requestBodies: {}, problems: [] };
  if (!isObj(spec) || !isObj(spec.paths)) {
    report.problems.push('openapi.json has no `paths` object.');
    return report;
  }
  const info = isObj(spec.info) ? spec.info : {};
  report.title = typeof info.title === 'string' ? info.title : undefined;
  report.version = typeof info.version === 'string' ? info.version : undefined;
  const paths = spec.paths as Obj;
  // Path params may be named differently ({id} vs {evaluation_id}); compare by shape.
  const shape = (p: string) => p.replace(/\{[^}]+\}/g, '{}');
  const byShape = new Map(Object.entries(paths).map(([p, v]) => [shape(p), v]));

  for (const op of EXPECTED_OPERATIONS) {
    const item = byShape.get(shape(op.path));
    const present = isObj(item) && isObj(item[op.method]);
    report.operations.push({ method: op.method.toUpperCase(), path: op.path, required: op.required, present });
    if (!present && op.required) report.problems.push(`Required endpoint missing: ${op.method.toUpperCase()} ${op.path}`);
  }

  for (const [p, item] of Object.entries(paths)) {
    if (!isObj(item)) continue;
    for (const m of ['post', 'patch']) {
      const op = item[m];
      if (!isObj(op) || !isObj(op.requestBody)) continue;
      const pr = props(spec, jsonSchema(op.requestBody.content));
      if (pr) report.requestBodies[`${m.toUpperCase()} ${p}`] = pr.names;
    }
  }

  const evalItem = byShape.get(shape('/api/v1/evaluations'));
  const post = isObj(evalItem) && isObj(evalItem.post) ? evalItem.post : null;
  if (post) {
    const responses = isObj(post.responses) ? post.responses : {};
    const ok = (responses['200'] ?? responses['201']) as unknown;
    const pr = isObj(ok) ? props(spec, jsonSchema(ok.content)) : null;
    if (pr) {
      report.evaluationFields = {
        found: pr.names,
        missing: EXPECTED_EVALUATION_FIELDS.filter((f) => !pr.names.includes(f)),
        extra: pr.names.filter((f) => !EXPECTED_EVALUATION_FIELDS.includes(f)),
      };
    } else {
      report.problems.push('POST /api/v1/evaluations 200 response has no resolvable JSON schema.');
    }
    const req = isObj(post.requestBody) ? props(spec, jsonSchema(post.requestBody.content)) : null;
    if (req) {
      report.requestFields = {
        found: req.names,
        required: req.required,
        missing: EXPECTED_REQUEST_FIELDS.filter((f) => !req.names.includes(f)),
        extra: req.names.filter((f) => !EXPECTED_REQUEST_FIELDS.includes(f)),
      };
      const unsent = req.required.filter((f) => !EXPECTED_REQUEST_FIELDS.includes(f));
      if (unsent.length) report.problems.push(`Evaluation request requires fields the frontend does not send: ${unsent.join(', ')}`);
    }
  }
  return report;
}
