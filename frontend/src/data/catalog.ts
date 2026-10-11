import type { Product } from '@/types';

/** Static demo catalog. Prices and vendors are fictional. */
export const CATALOG: Product[] = [
  {
    id: 'hp-001',
    name: 'Aurora ANC Pro Wireless',
    category: 'headphones',
    price: 129,
    vendor: 'AudioMart',
    rating: 4.7,
    review_count: 2310,
    features: ['Active noise cancelling', '40h battery', 'Multipoint Bluetooth'],
  },
  {
    id: 'hp-002',
    name: 'Pulse Air Wireless',
    category: 'headphones',
    price: 64.99,
    vendor: 'Approved Audio',
    rating: 4.5,
    review_count: 1874,
    features: ['Hybrid ANC', '35h battery', 'USB-C fast charge'],
  },
  {
    id: 'hp-003',
    name: 'Driftwave BT Over-Ear',
    category: 'headphones',
    price: 74.5,
    vendor: 'SoundDepot',
    rating: 4.3,
    review_count: 962,
    features: ['Passive isolation', '50h battery', 'Foldable'],
  },
  {
    id: 'hp-004',
    name: 'Volt Lite Wireless',
    category: 'headphones',
    price: 49.99,
    vendor: 'Approved Audio',
    rating: 4.1,
    review_count: 3120,
    features: ['Lightweight', '30h battery'],
  },
  {
    id: 'hp-005',
    name: 'Zenith Studio X',
    category: 'headphones',
    price: 79,
    vendor: 'AudioMart',
    rating: 4.6,
    review_count: 88,
    features: ['Studio tuning', 'Detachable cable', 'Bluetooth 5.3'],
  },
  {
    id: 'hp-006',
    name: 'Nimbus Flex Wireless',
    category: 'headphones',
    price: 58,
    vendor: 'BargainBeats Direct',
    rating: 4.4,
    review_count: 41,
    features: ['ANC', '28h battery'],
  },
];

export function getProduct(id: string | undefined): Product | undefined {
  return CATALOG.find((p) => p.id === id);
}

export const KNOWN_VENDORS = Array.from(new Set(CATALOG.map((p) => p.vendor)));
