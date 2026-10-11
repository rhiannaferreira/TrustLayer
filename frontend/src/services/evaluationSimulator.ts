/**
 * Deterministic mock evaluation engine.
 *
 * This is DEMO logic that runs entirely in the browser when VITE_USE_MOCKS=true. It applies
 * simple, explainable rules (spending limit, vendor allowlist, tool permissions, restricted
 * actions, known injection patterns). It is not a security boundary and not an AI model —
 * the real evaluation happens in the backend.
 */
import { CATALOG, getProduct } from '@/data/catalog';
import { getAgent } from '@/data/agents';
import { POLICY_IDS } from '@/data/policies';
import { scanEvidence } from '@/lib/injection';
import { formatCurrency } from '@/lib/format';
import { newId } from '@/lib/ids';
import type {
  Alternative,
  AnyPolicy,
  Decision,
  EvaluationCheck,
  EvaluationRequest,
  EvaluationResponse,
  EvidenceFlag,
  PolicyKind,
  PolicySet,
  RiskLevel,
  Policy,
} from '@/types';

interface SimulatorOptions {
  now?: Date;
  evaluationId?: string;
}

/** Internal check with routing metadata the wire format does not need. */
interface InternalCheck extends EvaluationCheck {
  /** WARNs that should escalate (to review, or block if review is disabled). */
  escalate?: boolean;
  /** FAILs that represent an authorization breach (raises risk to CRITICAL). */
  authorization?: boolean;
}

function findPolicy<K extends PolicyKind>(set: PolicySet, kind: K): Policy<K> | undefined {
  return set.policies.find((p: AnyPolicy) => p.kind === kind) as Policy<K> | undefined;
}

const SPEND_ACTIONS = new Set(['place_order', 'issue_refund']);

export function parseIntentBudget(intent: string): number | undefined {
  const m = intent.match(/(?:under|below|less than|max(?:imum)?(?: of)?|up to|budget(?: of)?)\s*\$\s?(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : undefined;
}

export function evaluateLocally(request: EvaluationRequest, policySet: PolicySet, options: SimulatorOptions = {}): EvaluationResponse {
  const now = options.now ?? new Date();
  const checks: InternalCheck[] = [];
  const { action } = request;
  const params = action.parameters ?? {};
  const price = typeof params.price === 'number' && Number.isFinite(params.price) ? params.price : undefined;
  const vendor = typeof params.vendor === 'string' ? params.vendor.trim() : '';
  const isSpend = SPEND_ACTIONS.has(action.type);
  const isOrder = action.type === 'place_order';

  const spending = findPolicy(policySet, 'spending_limit');
  const vendors = findPolicy(policySet, 'vendor_allowlist');
  const restricted = findPolicy(policySet, 'restricted_actions');
  const evidencePolicy = findPolicy(policySet, 'untrusted_evidence');
  const review = findPolicy(policySet, 'human_review');

  // ---- Stage 1: receive -------------------------------------------------------------
  const schemaProblems: string[] = [];
  if (!action.type) schemaProblems.push('action type is missing');
  if (isOrder) {
    if (price === undefined) schemaProblems.push('price is missing or not a number');
    else if (price < 0) schemaProblems.push('price is negative');
    if (!vendor) schemaProblems.push('vendor is missing');
    if (!params.product_id && !params.product_name) schemaProblems.push('product is not identified');
  }
  checks.push({
    name: 'Action schema',
    stage: 'receive',
    status: schemaProblems.length ? 'FAIL' : 'PASS',
    reason: schemaProblems.length
      ? `Malformed action: ${schemaProblems.join(', ')}.`
      : `Well-formed ${action.type} action received from ${request.agent_id}.`,
  });
  checks.push({
    name: 'User intent captured',
    stage: 'receive',
    status: request.intent.trim() ? 'PASS' : 'WARN',
    reason: request.intent.trim() ? `Intent: “${truncate(request.intent, 90)}”` : 'No user intent supplied; decision quality cannot be assessed against a goal.',
  });

  // ---- Stage 2: permissions ---------------------------------------------------------
  const agent = getAgent(request.agent_id);
  const granted = request.context?.permissions ?? agent?.permissions ?? [];
  const agentLabel = agent?.name ?? request.agent_id;
  const hasPermission = granted.includes(action.type);
  checks.push({
    name: 'Agent tool permission',
    stage: 'permissions',
    status: hasPermission ? 'PASS' : 'FAIL',
    authorization: !hasPermission,
    reason: hasPermission
      ? `${agentLabel} is granted ${action.type}.`
      : `${agentLabel} is not granted ${action.type}. Granted: ${granted.length ? granted.join(', ') : 'none'}.`,
  });

  if (restricted) {
    const listed = restricted.config.restricted_actions.includes(action.type);
    checks.push({
      name: 'Restricted tool actions',
      stage: 'permissions',
      policy_id: restricted.id,
      status: restricted.enabled && listed ? 'FAIL' : 'PASS',
      authorization: restricted.enabled && listed,
      reason: !restricted.enabled
        ? 'Policy disabled in this workspace — not enforced.'
        : listed
          ? `${action.type} is a restricted action and can never be executed autonomously.`
          : `${action.type} is not on the restricted list.`,
    });
  }

  if (isOrder && vendors) {
    const allowed = vendors.config.allowed_vendors.some((v) => v.toLowerCase() === vendor.toLowerCase());
    checks.push({
      name: 'Vendor authorization',
      stage: 'permissions',
      policy_id: vendors.id,
      status: !vendors.enabled || allowed ? 'PASS' : 'FAIL',
      reason: !vendors.enabled
        ? 'Policy disabled in this workspace — any vendor accepted.'
        : allowed
          ? `${vendor} is an approved vendor.`
          : `${vendor || 'Unknown vendor'} is not on the approved vendor list.`,
    });
  }

  // ---- Stage 3: evidence ------------------------------------------------------------
  let flags: EvidenceFlag[] = [];
  if (request.evidence.length === 0) {
    checks.push({
      name: 'Evidence present',
      stage: 'evidence',
      status: 'WARN',
      reason: 'The agent provided no supporting evidence for this action.',
    });
  } else {
    checks.push({
      name: 'Evidence present',
      stage: 'evidence',
      status: 'PASS',
      reason: `${request.evidence.length} evidence item${request.evidence.length === 1 ? '' : 's'} attached (${request.evidence.map((e) => e.id).join(', ')}).`,
    });
  }

  if (evidencePolicy) {
    if (!evidencePolicy.enabled) {
      checks.push({
        name: 'Untrusted evidence scan',
        stage: 'evidence',
        policy_id: evidencePolicy.id,
        status: 'WARN',
        reason: 'Policy disabled — third-party evidence was not scanned for instruction-like content.',
      });
    } else {
      const scanned = request.evidence.filter((e) => evidencePolicy.config.scan_sources.includes(e.source));
      flags = scanned.flatMap(scanEvidence);
      const flaggedIds = Array.from(new Set(flags.map((f) => f.evidence_id)));
      checks.push({
        name: 'Untrusted evidence scan',
        stage: 'evidence',
        policy_id: evidencePolicy.id,
        status: flags.length ? 'WARN' : 'PASS',
        escalate: flags.length > 0,
        reason: flags.length
          ? `${flags.length} instruction-like passage${flags.length === 1 ? '' : 's'} found in ${flaggedIds.join(', ')}. Content is treated as untrusted data and was not followed.`
          : `${scanned.length} untrusted item${scanned.length === 1 ? '' : 's'} scanned; no instruction-like content matched the demo patterns.`,
      });
    }
  }

  // ---- Stage 4: decision quality ----------------------------------------------------
  const product = getProduct(typeof params.product_id === 'string' ? params.product_id : undefined);
  if (isOrder) {
    const intentBudget = parseIntentBudget(request.intent);
    if (intentBudget !== undefined && price !== undefined) {
      const over = price > intentBudget;
      checks.push({
        name: 'Intent alignment',
        stage: 'quality',
        status: over ? 'WARN' : 'PASS',
        reason: over
          ? `Price ${formatCurrency(price)} exceeds the ${formatCurrency(intentBudget)} budget stated by the user.`
          : `Price ${formatCurrency(price)} fits the ${formatCurrency(intentBudget)} budget stated by the user.`,
      });
    }

    if (!product) {
      checks.push({
        name: 'Value comparison',
        stage: 'quality',
        status: 'WARN',
        reason: 'Product is not in the reference catalog, so price and rating could not be compared.',
      });
    } else {
      const effectivePrice = price ?? product.price;
      const better = CATALOG.filter(
        (p) =>
          p.id !== product.id &&
          p.price < effectivePrice &&
          p.rating >= product.rating &&
          isCompliantCandidate(p.price, p.vendor, spending, vendors),
      );
      checks.push({
        name: 'Value comparison',
        stage: 'quality',
        status: better.length ? 'WARN' : 'PASS',
        reason: better.length
          ? `${better[0].name} is cheaper (${formatCurrency(better[0].price)}) with an equal or higher rating.`
          : `No compliant product offers a higher rating at a lower price than ${product.name}.`,
      });
      if (product.review_count < 100) {
        checks.push({
          name: 'Review depth',
          stage: 'quality',
          status: 'WARN',
          reason: `Only ${product.review_count} reviews — rating ${product.rating.toFixed(1)} is based on limited evidence.`,
        });
      }
    }
  }

  // ---- Stage 5: risk ----------------------------------------------------------------
  if (isSpend && spending) {
    const limit = spending.config.max_amount;
    const over = price !== undefined && price > limit;
    checks.push({
      name: 'Spending limit',
      stage: 'risk',
      policy_id: spending.id,
      status: spending.enabled && over ? 'FAIL' : 'PASS',
      reason: !spending.enabled
        ? 'Policy disabled in this workspace — no spending ceiling enforced.'
        : over
          ? `Price ${formatCurrency(price)} exceeds the allowed ${formatCurrency(limit)} limit.`
          : `Price ${formatCurrency(price ?? 0)} is within the ${formatCurrency(limit)} limit.`,
    });
  }

  // ---- Decision ---------------------------------------------------------------------
  const failures = checks.filter((c) => c.status === 'FAIL');
  const escalations = checks.filter((c) => c.status === 'WARN' && c.escalate);
  const advisories = checks.filter((c) => c.status === 'WARN' && !c.escalate);
  const reviewEnabled = review?.enabled ?? false;

  let decision: Decision;
  let reason: string;
  if (failures.length) {
    decision = 'BLOCK';
    reason = failures.length === 1 ? failures[0].reason : `${failures.length} checks failed: ${failures.map((f) => f.name.toLowerCase()).join(', ')}.`;
  } else if (escalations.length) {
    if (reviewEnabled) {
      decision = 'REVIEW_REQUIRED';
      reason = 'Hard policy checks passed, but the supporting evidence contains instruction-like content. A human must review before execution.';
    } else {
      decision = 'BLOCK';
      reason = 'Evidence was flagged and the human review policy is disabled, so the action fails closed.';
    }
  } else {
    decision = 'ALLOW';
    reason = advisories.length
      ? `All enforced policies passed. ${advisories.length} advisory warning${advisories.length === 1 ? '' : 's'} recorded.`
      : 'All policy, permission and evidence checks passed.';
  }

  const risk = computeRisk(failures, escalations, advisories, flags);

  checks.push({
    name: 'Final authorization',
    stage: 'decision',
    policy_id: review?.id ?? POLICY_IDS.review,
    status: decision === 'ALLOW' ? 'PASS' : decision === 'BLOCK' ? 'FAIL' : 'WARN',
    reason:
      decision === 'ALLOW'
        ? 'Execution permitted through the tool gateway.'
        : decision === 'BLOCK'
          ? 'Execution denied. The tool gateway will refuse this action.'
          : 'Execution held until a human reviewer approves it.',
  });

  const alternatives = decision !== 'ALLOW' && isOrder ? suggestAlternatives(product?.id, spending, vendors) : [];

  return {
    evaluation_id: options.evaluationId ?? newId('eval'),
    decision,
    risk_level: risk,
    checks: checks.map(({ escalate: _e, authorization: _a, ...wire }) => wire),
    reason,
    evidence_flags: flags,
    alternatives,
    execution_allowed: decision === 'ALLOW',
    created_at: now.toISOString(),
    policy_version: policySet.version,
  };
}

function computeRisk(failures: InternalCheck[], escalations: InternalCheck[], advisories: InternalCheck[], flags: EvidenceFlag[]): RiskLevel {
  if (failures.some((f) => f.authorization)) return 'CRITICAL';
  if (failures.length) return 'HIGH';
  if (escalations.length) return flags.some((f) => f.severity === 'HIGH') ? 'HIGH' : 'MEDIUM';
  if (advisories.length) return 'MEDIUM';
  return 'LOW';
}

function isCompliantCandidate(
  price: number,
  vendor: string,
  spending: Policy<'spending_limit'> | undefined,
  vendors: Policy<'vendor_allowlist'> | undefined,
): boolean {
  if (spending?.enabled && price > spending.config.max_amount) return false;
  if (vendors?.enabled && !vendors.config.allowed_vendors.some((v) => v.toLowerCase() === vendor.toLowerCase())) return false;
  return true;
}

export function suggestAlternatives(
  excludeId: string | undefined,
  spending: Policy<'spending_limit'> | undefined,
  vendors: Policy<'vendor_allowlist'> | undefined,
): Alternative[] {
  return CATALOG.filter((p) => p.id !== excludeId && isCompliantCandidate(p.price, p.vendor, spending, vendors))
    .sort((a, b) => confidence(b) - confidence(a) || a.price - b.price)
    .slice(0, 2)
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      price: p.price,
      vendor: p.vendor,
      reason: `Rated ${p.rating.toFixed(1)} from ${p.review_count.toLocaleString()} reviews; complies with current spending and vendor policies.`,
    }));
}

/** Rating discounted for thin review history, so sparsely reviewed products are not over-trusted. */
function confidence(p: { rating: number; review_count: number }): number {
  return p.rating - (p.review_count < 100 ? 0.3 : 0);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
