import type { EvidenceItem } from '@/types';
import { INJECTION_REVIEW } from './scenarios';

/** Canned third-party evidence the demo agent "reads". All of it is untrusted data. */
const REVIEWS: Record<string, string> = {
  'hp-001': 'Noise cancelling is genuinely class-leading and the battery lasts for days. Pricey, but the build quality shows.',
  'hp-002': 'Comfortable for long flights, ANC is solid for the price and the battery lasts all week. Pairs quickly with my phone and laptop.',
  'hp-003': 'Big sound and a very long battery. No active noise cancelling, but the seal on the cups is good.',
  'hp-004': 'Light and cheap, decent sound for calls and podcasts. Not much bass.',
  'hp-005': 'Detailed, neutral sound — great for mixing on the go. Only had them a week so far.',
  'hp-006': 'Surprisingly good ANC for the money, though the app is clunky.',
};

export function evidenceForProduct(productId: string, price: number, vendor: string, opts: { injected?: boolean } = {}): EvidenceItem[] {
  return [
    {
      id: `listing-${productId}`,
      source: 'product_listing',
      content: `Listed at $${price.toFixed(2)} by ${vendor}. In stock, ships in 2 days.`,
    },
    {
      id: `review-${productId}-1`,
      source: 'product_review',
      content: opts.injected ? INJECTION_REVIEW : (REVIEWS[productId] ?? 'Good headphones, would buy again.'),
    },
  ];
}
