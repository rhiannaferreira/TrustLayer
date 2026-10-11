import { ExternalLink, PackageSearch, SearchX, ShieldCheck, FlaskConical, TriangleAlert } from 'lucide-react';
import { Badge, DecisionBadge, type Tone } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { AgentRunSummary, DiscoveredProduct, EvaluationRecord, RankedProduct } from '@/types';

/** Intl throws on unknown currency codes; never let a provider value crash the page. */
export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

const EXCLUSION_LABEL: Record<string, string> = {
  wrong_category: 'other category',
  over_budget: 'over budget',
  under_minimum: 'under minimum price',
  currency_mismatch: 'other currency',
  unavailable: 'out of stock',
};

export function catalogModeBadge(summary: AgentRunSummary): { label: string; tone: Tone } {
  const d = summary.discovery;
  if (d.catalog_mode === 'live') return { label: `Live provider · ${d.provider}`, tone: 'accent' };
  if (d.catalog_mode === 'demo_fallback') return { label: 'Demo catalog fallback · provider unavailable', tone: 'warn' };
  return { label: 'Demo catalog · fictional products', tone: 'violet' };
}

function ProvenanceBadge({ product }: { product: DiscoveredProduct }) {
  if (product.provenance === 'provider_api')
    return (
      <Badge tone="accent" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
        Provider data · {product.provider}
      </Badge>
    );
  if (product.provenance === 'fictional_demo_catalog')
    return (
      <Badge tone="violet" icon={<FlaskConical className="h-3 w-3" aria-hidden />}>
        Fictional demo product
      </Badge>
    );
  return <Badge tone="warn">Unverified source</Badge>;
}

function ProductCard({ item, rankingSource, highlight, record }: { item: RankedProduct; rankingSource?: string; highlight?: boolean; record?: EvaluationRecord | null }) {
  const p = item.product;
  const aiWritten = rankingSource === 'luminal';
  return (
    <article className={cn('rounded-lg border p-3', highlight ? 'border-accent/35 bg-accent/[0.04]' : 'border-line bg-raised/50')} aria-label={`${highlight ? 'Recommended' : 'Alternative'}: ${p.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xs text-faint">#{item.rank} {highlight ? '· recommended' : '· alternative'}</p>
          <p className="font-medium text-ink">
            {p.product_url ? (
              <a href={p.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {p.title} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : (
              p.title
            )}
          </p>
        </div>
        <span className="font-mono text-sm text-safe">{formatMoney(p.price, p.currency)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs">
        <ProvenanceBadge product={p} />
        <Badge>{p.category ?? 'category unknown'}</Badge>
        <Badge>seller: {p.seller ?? 'not provided'}</Badge>
        {p.availability && <Badge tone={p.availability === 'in_stock' ? 'safe' : 'neutral'}>{p.availability === 'not_provided' ? 'stock not provided' : p.availability.replace(/_/g, ' ')}</Badge>}
        {p.condition && <Badge>{p.condition}</Badge>}
      </div>
      {highlight && record && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="text-faint">Policy outcome:</span> <DecisionBadge decision={record.response.decision} /> {record.response.reason}
        </p>
      )}
      {(item.reason || item.tradeoffs) && (
        <div className="mt-2 space-y-1 text-xs text-muted">
          {item.reason && <p>{item.reason}</p>}
          {item.tradeoffs && (
            <p>
              <span className="text-faint">Trade-offs: </span>
              {item.tradeoffs}
            </p>
          )}
          <p className="text-2xs text-faint">{aiWritten ? 'Written by the AI model (Luminal). Not verified.' : 'Written by deterministic ranking rules; no AI model was used.'}</p>
        </div>
      )}
      <dl className="mt-2 grid gap-1 text-2xs sm:grid-cols-2">
        <div>
          <dt className="text-faint">Verified from provider</dt>
          <dd className="text-muted">{p.provider_fields.length ? p.provider_fields.join(', ') : 'none (no live provider data)'}</dd>
        </div>
        <div>
          <dt className="text-faint">Not verified</dt>
          <dd className="text-muted">{[...p.unverified_fields, ...p.requirements_unconfirmed.map((r) => `“${r}”`)].join(', ') || '—'}</dd>
        </div>
      </dl>
      {p.notes.length > 0 && <p className="mt-1 text-2xs text-faint">{p.notes.join(' ')}</p>}
      <p className="mt-1 break-all font-mono text-2xs text-faint">
        {p.product_id} · {p.source}
        {p.retrieved_at && p.provenance === 'provider_api' ? ` · retrieved ${p.retrieved_at}` : ''}
      </p>
    </article>
  );
}

export function DiscoveryPanel({ summary, record }: { summary: AgentRunSummary; record?: EvaluationRecord | null }) {
  const d = summary.discovery;
  const mode = catalogModeBadge(summary);
  const q = d.query;
  const excluded = Object.entries(d.excluded_counts).filter(([, n]) => n > 0);
  const noMatch = summary.status === 'NO_MATCH';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-2xs">
        <Badge tone={mode.tone}>{mode.label}</Badge>
        <Badge>category: {q.categories.length ? q.categories.join(' or ') : 'not recognised'}</Badge>
        <Badge>
          budget:{' '}
          {q.max_price !== null ? `≤ ${formatMoney(q.max_price, q.currency)}` : 'none stated'}
          {q.min_price !== null ? ` · ≥ ${formatMoney(q.min_price, q.currency)}` : ''}
        </Badge>
        {q.requirements.length > 0 && <Badge>requirements: {q.requirements.join(', ')}</Badge>}
        <Badge tone={d.matched_count ? 'safe' : 'warn'}>
          {d.matched_count} of {d.returned_count} listings matched
        </Badge>
      </div>
      {excluded.length > 0 && (
        <p className="text-xs text-muted">
          <span className="text-faint">Excluded: </span>
          {excluded.map(([reason, n]) => `${n} ${EXCLUSION_LABEL[reason] ?? reason}`).join(' · ')}
        </p>
      )}
      {d.provider_error && (
        <p className="flex items-start gap-1.5 rounded-md border border-warn/30 bg-warn/[0.06] px-2.5 py-1.5 text-xs text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Live provider unavailable ({d.provider_error}). Showing the fictional demo catalog instead.
        </p>
      )}

      {noMatch ? (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.05] p-3" role="status">
          <SearchX className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">No matching products</p>
            <p className="text-xs text-muted">{summary.message ?? d.no_match?.message}</p>
            <p className="mt-1 text-2xs text-faint">Nothing was proposed or evaluated. Products from other categories are never substituted.</p>
          </div>
        </div>
      ) : (
        <>
          {summary.ranking && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <PackageSearch className="h-3.5 w-3.5 text-accent-soft" aria-hidden />
              Ranked by {summary.ranking.ranking_source === 'luminal' ? 'Luminal (AI)' : 'deterministic rules, no AI'}
              {summary.ranking.summary ? ` · ${summary.ranking.summary}` : ''}
            </p>
          )}
          {summary.recommendation && <ProductCard item={summary.recommendation} rankingSource={summary.ranking?.ranking_source} highlight record={record} />}
          {summary.alternatives.length > 0 && (
            <div className="space-y-2">
              <p className="label">Same-category alternatives</p>
              {summary.alternatives.map((a) => (
                <ProductCard key={a.product.product_id} item={a} rankingSource={summary.ranking?.ranking_source} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
