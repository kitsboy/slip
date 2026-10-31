/**
 * Catalog — what a shop sells.
 *
 * Prices are integers in minor units (or sats), never floats, and each item can carry its
 * own tax rate so a receipt with 0% food and 13% alcohol is arithmetic rather than a
 * special case. The catalog is local: no sync, no server, no account.
 */

export interface CatalogItem {
  readonly id: string;
  readonly name: string;
  readonly priceMinor: bigint;
  readonly priceCurrency: 'FIAT' | 'SATS';
  /** Tax rate in basis points for THIS item; omitted = use the shop default. */
  readonly taxBps?: number;
  readonly category: string;
  readonly emoji?: string;
  readonly active: boolean;
  readonly sort: number;
}

export type CatalogItemInput = Omit<CatalogItem, 'id' | 'sort' | 'active'> & {
  readonly active?: boolean;
};

export interface CatalogTemplate {
  readonly id: string;
  readonly name: string;
  readonly items: ReadonlyArray<Omit<CatalogItem, 'id' | 'sort' | 'active'>>;
}

const item = (
  name: string,
  price: string,
  category: string,
  emoji: string,
  extra: Partial<Pick<CatalogItem, 'priceCurrency' | 'taxBps'>> = {},
): Omit<CatalogItem, 'id' | 'sort' | 'active'> => ({
  name,
  priceMinor: BigInt(price),
  priceCurrency: extra.priceCurrency ?? 'FIAT',
  category,
  emoji,
  ...(extra.taxBps !== undefined ? { taxBps: extra.taxBps } : {}),
});

/**
 * Starter templates. Prices are deliberately small integers in minor units (cents): a
 * template is a starting point a merchant edits, never a claim about their prices.
 */
export const TEMPLATES: readonly CatalogTemplate[] = [
  {
    id: 'cafe',
    name: 'Café',
    items: [
      item('Espresso', '350', 'Drinks', '☕'),
      item('Flat white', '450', 'Drinks', '☕'),
      item('Filter coffee', '400', 'Drinks', '🫖'),
      item('Tea', '300', 'Drinks', '🍵'),
      item('Croissant', '325', 'Food', '🥐'),
      item('Banana bread', '400', 'Food', '🍌'),
      item('Sandwich', '850', 'Food', '🥪'),
      item('Tip jar', '100', 'Other', '🫙', { priceCurrency: 'SATS' }),
    ],
  },
  {
    id: 'market',
    name: 'Market stall',
    items: [
      item('Single item', '200', 'Produce', '🧺'),
      item('Bag of produce', '1200', 'Produce', '🥕'),
      item('Jar of honey', '900', 'Produce', '🍯'),
      item('Custom amount', '0', 'Other', '✏️'),
    ],
  },
  {
    id: 'services',
    name: 'Services',
    items: [
      item('Hourly rate', '6000', 'Labour', '🛠️'),
      item('Call-out', '4500', 'Labour', '🚗'),
      item('Deposit', '20000', 'Other', '📄'),
      item('Custom amount', '0', 'Other', '✏️'),
    ],
  },
];

export function templateItems(templateId: string): CatalogItem[] {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return [];
  return tpl.items.map((i, index) => ({
    ...i,
    id: `item_${templateId}_${index}`,
    active: true,
    sort: index,
  }));
}

/** Validates an item before it can reach a cart. Names are for humans, prices for maths. */
export function validateItem(input: CatalogItemInput): { ok: true; item: CatalogItem } | { ok: false; error: string } {
  const name = input.name.trim();
  if (name.length < 1) return { ok: false, error: 'an item needs a name' };
  if (name.length > 60) return { ok: false, error: 'item names are limited to 60 characters' };
  if (input.priceMinor < 0n) return { ok: false, error: 'a price cannot be negative' };
  if (input.priceCurrency === 'SATS' && input.priceMinor === 0n) {
    return { ok: false, error: 'a sats price of 0 is not payable — use the custom keypad instead' };
  }
  if (input.taxBps !== undefined && (input.taxBps < 0 || input.taxBps > 10_000)) {
    return { ok: false, error: 'tax must be between 0% and 100%' };
  }
  return {
    ok: true,
    item: {
      id: `item_${Math.random().toString(36).slice(2, 10)}`,
      name,
      priceMinor: input.priceMinor,
      priceCurrency: input.priceCurrency,
      category: input.category.trim() || 'Other',
      ...(input.emoji ? { emoji: input.emoji } : {}),
      ...(input.taxBps !== undefined ? { taxBps: input.taxBps } : {}),
      active: input.active ?? true,
      sort: Number.MAX_SAFE_INTEGER,
    },
  };
}

export function categories(items: readonly CatalogItem[]): string[] {
  return [...new Set(items.map((i) => i.category))].sort();
}

/** Case-insensitive substring search: the only search a 20-item café needs. */
export function searchItems(items: readonly CatalogItem[], query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q),
  );
}
