import { describe, expect, it } from 'vitest';

import { recallDisplay, rememberDisplay, type DisplayMessage } from '../src/ui/CustomerDisplay';

const pay: DisplayMessage = {
  kind: 'pay',
  uri: 'bitcoin:bc1qexample?amount=0.0001',
  sats: '10000',
  status: 'awaiting',
  shop: 'Harbour Coffee',
  at: '2026-11-09T20:00:00.000Z',
};

describe('customer screen remembers the code', () => {
  it('a reload of this screen still has the code that was showing', () => {
    rememberDisplay(pay);
    expect(recallDisplay()?.uri).toBe(pay.uri);
  });

  it('a cleared screen does not keep a stale code', () => {
    rememberDisplay(pay);
    rememberDisplay({ kind: 'clear', at: pay.at });
    expect(recallDisplay()).toBeNull();
  });
});
