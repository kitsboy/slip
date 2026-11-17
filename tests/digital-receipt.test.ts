import { expect, it } from 'vitest';
import { receiptLink, readReceipt } from '../src/core/digital-receipt';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import DigitalReceipt from '../src/ui/DigitalReceipt';
import type { Invoice } from '../src/core/orders';
it('carries only customer fields in the fragment and validates them', () => {
  const invoice = {
    id: 'sale',
    receiptNumber: '2026-11-17-001',
    createdAt: '2026-11-17T00:00:00Z',
    amountAtoms: 123n,
    amountMinor: 10n,
    currency: 'USD',
    status: 'complete',
    manual: true,
    address: 'bc1public',
    walletLabel: 'PRIVATE SHOP LABEL',
  } as unknown as Invoice;
  const link = receiptLink(invoice, 'Shop', 'btc', 'https://example.com/?demo=1#till', false);
  expect(new URL(link).search).toBe('?receipt=1');
  expect(decodeURIComponent(new URL(link).hash)).not.toContain('PRIVATE SHOP LABEL');
  expect(readReceipt(new URL(link).hash)?.status).toBe(
    'Marked paid by merchant — not observed by slip',
  );
  expect(readReceipt('#receipt=%7B%7D')).toBeNull();
  for (const [network,coin] of [['btc-signet','btc'],['btc-testnet4','btc'],['ltc-testnet','ltc']] as const) {
    const url=receiptLink(invoice,'Shop',coin,'https://example.com/',false,network);
    history.replaceState(null,'/',new URL(url).hash);
    const html=renderToStaticMarkup(createElement(DigitalReceipt));
    expect(html).toContain(network);expect(html).toContain('Test coins have no monetary value');expect(html).toContain('FULL LINK');
  }
  const demo=receiptLink(invoice,'Shop','btc','https://example.com/',true,'btc-signet');
  expect(readReceipt(new URL(demo).hash)?.status).toContain('Simulated');
  history.replaceState(null,'/','/');
});
