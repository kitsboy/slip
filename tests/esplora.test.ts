import { describe, expect, it, vi } from 'vitest';
import {
  ExplorerError,
  PUBLIC_ESPLORA,
  defaultTarget,
  fetchAddressActivity,
  formatAtoms,
  targetFor,
  type FetchLike,
} from '../src/core/providers/esplora';

const target = { baseUrl: 'https://example.test/api', kind: 'public' as const };
const ADDR = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

function fakeFetch(body: unknown, status = 200): FetchLike {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe('target selection', () => {
  it('defaults to a public explorer where one is known', () => {
    expect(defaultTarget('btc-mainnet')?.baseUrl).toContain('mempool.space');
    expect(defaultTarget('btc-signet')?.kind).toBe('public');
  });

  it('has a public provider for Litecoin testnet (verified testnet4)', () => {
    // The endpoint's genesis hash is Litecoin testnet4's, and testnet4 is the only live LTC testnet.
    expect(PUBLIC_ESPLORA['ltc-testnet']).toBe('https://litecoinspace.org/testnet/api');
    expect(defaultTarget('ltc-testnet')?.kind).toBe('public');
  });

  it('prefers an explicit endpoint and strips trailing slashes', () => {
    const t = targetFor('btc-mainnet', 'https://node.local/esplora///');
    expect(t).toEqual({ baseUrl: 'https://node.local/esplora', kind: 'custom' });
  });

  it('falls back to the public default when no endpoint is configured', () => {
    expect(targetFor('btc-mainnet')?.kind).toBe('public');
  });
});

describe('fetchAddressActivity', () => {
  it('adds chain and mempool totals and reports usage', async () => {
    const res = await fetchAddressActivity(target, ADDR, {
      fetchImpl: fakeFetch({
        chain_stats: { funded_txo_sum: 150_000, spent_txo_sum: 50_000, tx_count: 2 },
        mempool_stats: { funded_txo_sum: 25_000, spent_txo_sum: 0, tx_count: 1 },
      }),
      now: () => new Date('2026-10-31T00:00:00Z'),
    });
    expect(res.receivedAtoms).toBe(175_000n);
    expect(res.spentAtoms).toBe(50_000n);
    expect(res.txCount).toBe(3);
    expect(res.used).toBe(true);
    expect(res.confirmedBalanceAtoms).toBe(100_000n);
    expect(res.fetchedAt).toBe('2026-10-31T00:00:00.000Z');
    expect(res.source.baseUrl).toBe(target.baseUrl);
  });

  it('treats a never-used address as unused rather than an error', async () => {
    const res = await fetchAddressActivity(target, ADDR, {
      fetchImpl: fakeFetch({ chain_stats: {}, mempool_stats: {} }),
    });
    expect(res.used).toBe(false);
    expect(res.receivedAtoms).toBe(0n);
    expect(res.confirmedBalanceAtoms).toBe(0n);
  });

  it('never reports a negative confirmed balance', async () => {
    const res = await fetchAddressActivity(target, ADDR, {
      fetchImpl: fakeFetch({ chain_stats: { funded_txo_sum: 10, spent_txo_sum: 99 } }),
    });
    expect(res.confirmedBalanceAtoms).toBe(0n);
  });

  it('turns an HTTP failure into a sentence, with the status kept', async () => {
    await expect(
      fetchAddressActivity(target, ADDR, { fetchImpl: fakeFetch({}, 429) }),
    ).rejects.toBeInstanceOf(ExplorerError);
    await expect(
      fetchAddressActivity(target, ADDR, { fetchImpl: fakeFetch({}, 429) }),
    ).rejects.toThrow(/429/);
  });

  it('refuses a non-JSON reply instead of pretending it is an explorer', async () => {
    const bad: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(fetchAddressActivity(target, ADDR, { fetchImpl: bad })).rejects.toThrow(/not JSON/);
  });

  it('times out with a readable message when the provider hangs', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    await expect(
      fetchAddressActivity(target, ADDR, { fetchImpl: hang, timeoutMs: 20 }),
    ).rejects.toThrow(/within 1s|did not answer/);
  });

  it('asks the address endpoint and URL-encodes the address', async () => {
    const spy = vi.fn(fakeFetch({ chain_stats: {} }));
    await fetchAddressActivity(target, ADDR, { fetchImpl: spy as unknown as FetchLike });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toBe(`${target.baseUrl}/address/${ADDR}`);
  });
});

describe('formatAtoms', () => {
  it('renders whole and fractional amounts without floats', () => {
    expect(formatAtoms(100_000_000n)).toBe('1 BTC');
    expect(formatAtoms(150_000_000n)).toBe('1.5 BTC');
    expect(formatAtoms(1n)).toBe('0.00000001 BTC');
    expect(formatAtoms(0n)).toBe('0 BTC');
    expect(formatAtoms(250_000_000n, 'ltc')).toBe('2.5 LTC');
  });
});
