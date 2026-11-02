import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeExplorer, registerDemoSale } from '../src/demo/fakeExplorer';

/**
 * The demo's own internet.
 *
 * These assertions exist because the demo once lied politely: it invented 100,000 sats for any
 * address it had never been asked about, so checking a stranger in the watchlist showed money that
 * never arrived. A pretend shop may be pretend, but it may not be dishonest.
 */

let restore: (() => void) | null = null;

function install(): void {
  restore = installFakeExplorer();
}

afterEach(() => {
  restore?.();
  restore = null;
  vi.useRealTimers();
});

const address = async (addr: string): Promise<number> => {
  const res = await fetch(`https://mempool.space/api/address/${addr}`);
  const body = (await res.json()) as { chain_stats: { funded_txo_sum: number } };
  return body.chain_stats.funded_txo_sum;
};

describe('the demo internet', () => {
  it('does not fund an address the shop never asked for', async () => {
    install();
    expect(await address('bc1qsomeoneelsesaddress')).toBe(0);
  });

  it('funds a sale after the promised few seconds, at the amount asked', async () => {
    install();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    registerDemoSale('bc1qsaleone', 2_500n);

    expect(await address('bc1qsaleone')).toBe(0);

    vi.setSystemTime(new Date('2026-11-02T10:00:05Z'));
    expect(await address('bc1qsaleone')).toBe(2_500);
  });

  it('answers a lightning address with a payRequest, then an invoice, then settlement', async () => {
    install();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));

    const params = (await (
      await fetch('https://till.example/.well-known/lnurlp/shop')
    ).json()) as { tag: string; callback: string };
    expect(params.tag).toBe('payRequest');

    const invoice = (await (
      await fetch(`${params.callback}?amount=250000`)
    ).json()) as { pr: string; verify: string };
    expect(invoice.pr.startsWith('lnbc')).toBe(true);

    const first = (await (await fetch(invoice.verify)).json()) as { settled: boolean };
    expect(first.settled).toBe(false);

    vi.setSystemTime(new Date('2026-11-02T10:00:05Z'));
    const later = (await (await fetch(invoice.verify)).json()) as { settled: boolean };
    expect(later.settled).toBe(true);
  });

  it('quotes a price locally instead of reaching the network', async () => {
    install();
    const res = await fetch('https://mempool.space/api/v1/prices');
    const body = (await res.json()) as { USD: number };
    expect(body.USD).toBeGreaterThan(1_000);
  });

  it('refuses an endpoint it does not simulate rather than letting it out', async () => {
    install();
    const res = await fetch('https://example.com/something');
    expect(res.status).toBe(404);
  });
});
