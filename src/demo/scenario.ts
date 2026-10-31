/**
 * The pretend shop.
 *
 * One seed, used by the demo route, the screenshot script and (later) the video, so a mock-up can
 * never drift from the app. Everything here is ordinary data of the kind a real shop produces — the
 * demo is not a special mode inside the components, only a different drawer (see core/storage.ts).
 */

import { store } from '../core/storage';

export const DEMO_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const DAY = 86_400_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function demoScenario(now = new Date()): {
  accounts: unknown;
  settings: unknown;
  ledger: unknown;
  tabs: unknown;
} {
  const stamp = iso(now.getTime());
  const wallet = (id: string, label: string, colour: string, note: string) => ({
    id,
    label,
    xpub: DEMO_ZPUB,
    coin: 'btc',
    networkId: 'btc-mainnet',
    scriptType: 'p2wpkh',
    source: 'xpub',
    colour,
    purpose: 'till',
    note,
    fingerprintHex: '7ef32bdb',
    prefix: 'zpub',
    firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    acknowledgedAt: stamp,
    createdAt: stamp,
    staffName: id === 'w1' ? 'Ana' : null,
    nextIndex: 12,
  });

  const items = [
    { id: 'd1', name: 'Espresso', priceMinor: '350', priceCurrency: 'FIAT', category: 'Drinks', emoji: '☕', taxBps: 0, sort: 1, active: true },
    { id: 'd2', name: 'Flat white', priceMinor: '420', priceCurrency: 'FIAT', category: 'Drinks', emoji: '🥛', taxBps: 0, sort: 2, active: true },
    { id: 'd3', name: 'Croissant', priceMinor: '400', priceCurrency: 'FIAT', category: 'Bakery', emoji: '🥐', taxBps: 0, sort: 3, active: true },
    { id: 'd4', name: 'Sourdough', priceMinor: '750', priceCurrency: 'FIAT', category: 'Bakery', emoji: '🍞', taxBps: 0, sort: 4, active: true },
    { id: 'd5', name: 'Orange juice', priceMinor: '500', priceCurrency: 'FIAT', category: 'Cold', emoji: '🍊', taxBps: 0, sort: 5, active: true },
    { id: 'd6', name: 'Beans 250g', priceMinor: '1400', priceCurrency: 'FIAT', category: 'Beans', emoji: '🫘', taxBps: 0, sort: 6, active: true },
  ];

  // Forty sales over a week, deterministic, so the demo looks the same every time it is opened.
  const invoices = Array.from({ length: 40 }, (_, i) => {
    const daysAgo = i % 8;
    const hour = 8 + ((i * 3) % 9);
    const at = now.getTime() - daysAgo * DAY;
    const d = new Date(at);
    d.setUTCHours(hour, (i * 7) % 60, 0, 0);
    const amount = 350 + ((i * 137) % 2100);
    const rail = i % 7 === 0 ? 'ln' : i % 11 === 0 ? 'manual' : 'chain';
    return {
      id: `inv_demo_${String(i).padStart(2, '0')}`,
      walletId: rail === 'manual' ? 'w2' : 'w1',
      walletLabel: rail === 'manual' ? 'Back bar' : 'Front counter',
      address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      index: i,
      amountAtoms: String(amount * 100),
      amountMinor: String(amount),
      currency: 'USD',
      rateMinorPerCoin: '6000000',
      rateAt: iso(d.getTime()),
      lines: [],
      createdAt: iso(d.getTime()),
      expiresAt: iso(d.getTime() + 15 * 60_000),
      status: 'complete',
      seenAt: iso(d.getTime() + 40_000),
      confirmedAt: iso(d.getTime() + 90_000),
      manual: rail === 'manual',
      note: rail === 'ln' ? 'lightning' : rail === 'manual' ? '' : '',
    };
  });

  return {
    accounts: {
      version: 1,
      accounts: [
        wallet('w1', 'Front counter', 'blue', 'the shop till'),
        wallet('w2', 'Back bar', 'teal', 'second till'),
        wallet('w3', "Mum's rent", 'purple', 'standing request'),
      ],
      activeAccountId: 'w1',
      pinHash: null,
      savedAt: stamp,
    },
    settings: {
      businessName: 'Demo Café',
      currency: 'USD',
      taxBps: 0,
      taxInclusive: false,
      tipPresetsBps: [0, 1000, 1500, 2000],
      receiptFooter: 'Thank you — this is a demo',
      explorerUrl: '',
      rateEndpoint: '',
      autoRate: false,
      staff: [{ name: 'Ana', walletId: 'w2' }],
      assist: {
        explainNumbers: true,
        rehearsal: false,
        hints: true,
        freshnessRings: true,
        bookSeal: true,
        handoverNote: true,
        counterCard: true,
      },
      language: 'en',
      onboardedAt: stamp,
    },
    ledger: {
      version: 1,
      items,
      invoices,
      requests: [
        {
          id: 'req_demo_1',
          label: "Mum's rent",
          walletId: 'w3',
          walletLabel: "Mum's rent",
          amountMinor: '90000',
          currency: 'USD',
          cadence: 'monthly',
          nextDue: iso(now.getTime() - 2 * DAY).slice(0, 10),
          createdAt: iso(now.getTime() - 32 * DAY),
          lastPaidAt: iso(now.getTime() - 32 * DAY),
        },
      ],
      books: {},
      watches: [
        {
          id: 'watch_demo',
          label: 'Landlord',
          address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
          networkId: 'btc-mainnet',
          note: '',
          addedAt: stamp,
        },
      ],
      anchors: [],
      refunds: [
        {
          id: 'ref_demo_1',
          invoiceId: 'inv_demo_03',
          atoms: '12000',
          method: 'cash',
          reason: 'wrong order',
          at: iso(now.getTime() - DAY),
          reference: 'Ana',
        },
      ],
    },
    tabs: [
      {
        id: 'tab_demo_1',
        label: 'Table 4',
        lines: [{ itemId: 'd1', name: 'Espresso', quantity: 2, unitMinor: '350', priceCurrency: 'FIAT' }],
        custom: '',
        walletId: 'w1',
        note: '',
        createdAt: stamp,
      },
    ],
  };
}

/** Write the demo shop into the demo drawer. Idempotent; never touches real keys. */
export function seedDemo(now = new Date()): void {
  const s = store();
  if (s.getItem('slip.accounts.v1')) return;
  const scenario = demoScenario(now);
  s.setItem('slip.accounts.v1', JSON.stringify(scenario.accounts));
  s.setItem('slip.settings.v1', JSON.stringify(scenario.settings));
  s.setItem('slip.ledger.v1', JSON.stringify(scenario.ledger));
  s.setItem('slip.tabs.v1', JSON.stringify(scenario.tabs));
  s.setItem('slip.demo.seeded', '1');
}
