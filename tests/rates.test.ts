import { describe, expect, it } from 'vitest';
import { CURRENCIES } from '../src/core/currencies';
import {
  DEFAULT_RATE_ENDPOINTS,
  MAX_AGE_SECONDS,
  RateError,
  ageQuote,
  fetchRate,
  medianRate,
  parsePriceResponse,
  requireFresh,
  type FetchLike,
  type RateQuote,
} from '../src/core/providers/rates';

const NOW = new Date('2026-10-31T12:00:00.000Z');

/** A mempool.space-shaped body: unix time plus one key per quote currency. */
const PRICES = {
  time: 1_790_000_000,
  USD: 26_500.5,
  CAD: 36_000.1,
  EUR: 24_000.25,
  JPY: 4_000_000,
};

function fakeFetch(body: unknown, status = 200): FetchLike {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function at(secondsAgo: number): string {
  return new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
}

function quote(over: Partial<RateQuote> = {}): RateQuote {
  return {
    minorPerCoin: 2_650_050n,
    currency: 'USD',
    source: 'mempool.space',
    fetchedAt: at(0),
    ageSeconds: 0,
    stale: false,
    ...over,
  };
}

/** Captures the thrown RateError so the `kind` can be asserted, not just the message. */
function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof RateError) return error.kind;
    throw error;
  }
  return undefined;
}

describe('parsePriceResponse', () => {
  it('picks the requested currency and converts to cents exactly', () => {
    const q = parsePriceResponse(PRICES, 'USD', NOW);
    expect(q.minorPerCoin).toBe(2_650_050n);
    expect(q.currency).toBe('USD');
    expect(q.fetchedAt).toBe(NOW.toISOString());
    expect(q.ageSeconds).toBe(0);
    expect(q.stale).toBe(false);
    expect(q.source).toContain('mempool.space');
  });

  it('multiplies by 100 for a 2-decimal currency without float drift', () => {
    // 0.29 * 100 is 28.999999999999996 in binary floating point; rounding must not lose a cent.
    expect(parsePriceResponse({ USD: 0.29 }, 'USD', NOW).minorPerCoin).toBe(29n);
    expect(parsePriceResponse({ USD: 26_500.5 }, 'USD', NOW).minorPerCoin).toBe(2_650_050n);
    expect(parsePriceResponse({ USD: 1.005 }, 'USD', NOW).minorPerCoin).toBe(101n);
  });

  it('refuses a currency the endpoint does not quote', () => {
    expect(kindOf(() => parsePriceResponse(PRICES, 'CHF', NOW))).toBe('currency-not-offered');
  });

  it('does not mistake the `time` field for a price, or a string for a number', () => {
    expect(kindOf(() => parsePriceResponse({ time: 1_790_000_000 }, 'TIME', NOW))).not.toBe(
      undefined,
    );
    expect(kindOf(() => parsePriceResponse({ USD: '26500' }, 'USD', NOW))).toBe('bad-shape');
  });

  it('refuses zero, negative, NaN and Infinity as bad shapes', () => {
    for (const bad of [0, -1, -26_500.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(kindOf(() => parsePriceResponse({ USD: bad }, 'USD', NOW))).toBe('bad-shape');
    }
  });

  it('refuses a body that is not a price table', () => {
    for (const body of [null, undefined, 42, 'USD 26500', [1, 2, 3]]) {
      expect(kindOf(() => parsePriceResponse(body, 'USD', NOW))).toBe('bad-shape');
    }
  });

  it('refuses a rate too large to represent in minor units', () => {
    expect(kindOf(() => parsePriceResponse({ USD: Number.MAX_SAFE_INTEGER }, 'USD', NOW))).toBe(
      'bad-shape',
    );
  });

  it('treats a 0-decimal currency as whole units (JPY has no cents)', () => {
    // 4,000,000 JPY is 4,000,000 yen, not 400,000,000 sen.
    expect(parsePriceResponse(PRICES, 'JPY', NOW).minorPerCoin).toBe(4_000_000n);
    expect(parsePriceResponse({ JPY: 1234.6 }, 'JPY', NOW).minorPerCoin).toBe(1235n);
    expect(parsePriceResponse({ KRW: 1_350_000 }, 'KRW', NOW).minorPerCoin).toBe(1_350_000n);
  });

  it('treats a 3-decimal currency as thousandths (KWD is not cents)', () => {
    expect(parsePriceResponse({ KWD: 8.125 }, 'KWD', NOW).minorPerCoin).toBe(8_125n);
  });

  it('treats a 4-decimal unit as ten-thousandths (CLF)', () => {
    expect(parsePriceResponse({ CLF: 0.5 }, 'CLF', NOW).minorPerCoin).toBe(5_000n);
  });

  it('refuses a rate that rounds down to zero minor units', () => {
    expect(kindOf(() => parsePriceResponse({ USD: 0.0001 }, 'USD', NOW))).toBe('bad-shape');
  });

  it('agrees with the project currency table on every exponent it ships', () => {
    // The provider keeps its own small set on purpose (no coupling), so this is the guard that
    // stops the two from drifting: a 10x pricing error is invisible until the books are counted.
    for (const info of Object.values(CURRENCIES)) {
      const q = parsePriceResponse({ [info.code]: 1 }, info.code, NOW);
      expect(q.minorPerCoin, info.code).toBe(10n ** BigInt(info.minorUnits));
    }
  });
});

describe('ageQuote', () => {
  it('leaves a just-fetched quote alone', () => {
    const q = ageQuote(quote(), NOW);
    expect(q.ageSeconds).toBe(0);
    expect(q.stale).toBe(false);
  });

  it('is still usable at 9 minutes 59 seconds and stale at 10 minutes', () => {
    expect(ageQuote(quote({ fetchedAt: at(MAX_AGE_SECONDS - 1) }), NOW).stale).toBe(false);
    expect(ageQuote(quote({ fetchedAt: at(MAX_AGE_SECONDS + 1) }), NOW).stale).toBe(true);
  });

  it('re-judges a quote cached from yesterday as stale, not fresh', () => {
    const cached = parsePriceResponse(PRICES, 'USD', new Date(NOW.getTime() - 86_400_000));
    expect(cached.stale).toBe(false); // it was fresh when it was fetched...
    const reread = ageQuote(cached, NOW); // ...and that is exactly what must not travel
    expect(reread.ageSeconds).toBe(86_400);
    expect(reread.stale).toBe(true);
  });

  it('marks a negative age stale, because a backwards clock hides the real age', () => {
    const q = ageQuote(quote({ fetchedAt: at(-60) }), NOW);
    expect(q.ageSeconds).toBe(-60);
    expect(q.stale).toBe(true);
  });

  it('treats an unparseable timestamp as stale rather than age zero', () => {
    const q = ageQuote(quote({ fetchedAt: 'not a date' }), NOW);
    expect(q.stale).toBe(true);
    expect(q.ageSeconds).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not mutate the quote it was given', () => {
    const original = quote({ fetchedAt: at(3600) });
    ageQuote(original, NOW);
    expect(original.stale).toBe(false);
    expect(original.ageSeconds).toBe(0);
  });
});

describe('requireFresh', () => {
  it('passes a fresh quote through unchanged', () => {
    const q = quote();
    expect(requireFresh(q)).toBe(q);
  });

  it('throws a stale RateError instead of letting an old rate price a sale', () => {
    const q = ageQuote(quote({ fetchedAt: at(MAX_AGE_SECONDS + 30) }), NOW);
    expect(() => requireFresh(q)).toThrow(RateError);
    expect(kindOf(() => requireFresh(q))).toBe('stale');
    expect(() => requireFresh(q)).toThrow(/refresh/i);
  });

  it('refuses a quote whose age went backwards', () => {
    expect(kindOf(() => requireFresh(ageQuote(quote({ fetchedAt: at(-5) }), NOW)))).toBe('stale');
  });
});

describe('medianRate', () => {
  it('returns the middle quote of an odd count', () => {
    const median = medianRate([
      quote({ minorPerCoin: 100n, source: 'a' }),
      quote({ minorPerCoin: 300n, source: 'b' }),
      quote({ minorPerCoin: 200n, source: 'c' }),
    ]);
    expect(median.minorPerCoin).toBe(200n);
    expect(median.currency).toBe('USD');
  });

  it('takes the lower-middle of an even count, deterministically', () => {
    const median = medianRate([
      quote({ minorPerCoin: 400n }),
      quote({ minorPerCoin: 100n }),
      quote({ minorPerCoin: 300n }),
      quote({ minorPerCoin: 200n }),
    ]);
    expect(median.minorPerCoin).toBe(200n);
  });

  it('joins sources and keeps the newest timestamp', () => {
    const median = medianRate([
      quote({ minorPerCoin: 100n, source: 'a', fetchedAt: at(120) }),
      quote({ minorPerCoin: 200n, source: 'b', fetchedAt: at(5), ageSeconds: 5 }),
      quote({ minorPerCoin: 300n, source: 'c', fetchedAt: at(300) }),
    ]);
    expect(median.source).toBe('a+b+c');
    expect(median.fetchedAt).toBe(at(5));
    expect(median.ageSeconds).toBe(5);
    expect(median.stale).toBe(false);
  });

  it('does not launder a stale input into a fresh median', () => {
    const median = medianRate([
      quote({ minorPerCoin: 100n, stale: true, fetchedAt: at(3600) }),
      quote({ minorPerCoin: 200n, fetchedAt: at(1) }),
    ]);
    expect(median.stale).toBe(true);
    expect(kindOf(() => requireFresh(median))).toBe('stale');
  });

  it('re-judges a median against the clock like any other quote', () => {
    const median = medianRate([
      quote({ minorPerCoin: 100n, fetchedAt: at(MAX_AGE_SECONDS + 1) }),
      quote({ minorPerCoin: 200n, fetchedAt: at(MAX_AGE_SECONDS + 1) }),
    ]);
    expect(ageQuote(median, NOW).stale).toBe(true);
  });

  it('refuses an empty list and mixed currencies', () => {
    expect(kindOf(() => medianRate([]))).toBe('bad-shape');
    expect(
      kindOf(() => medianRate([quote(), quote({ currency: 'EUR', minorPerCoin: 2_400_025n })])),
    ).toBe('bad-shape');
  });

  it('handles a single quote without inventing anything', () => {
    const only = quote({ minorPerCoin: 123n, source: 'solo' });
    const median = medianRate([only]);
    expect(median.minorPerCoin).toBe(123n);
    expect(median.source).toBe('solo');
    expect(median.fetchedAt).toBe(only.fetchedAt);
  });
});

describe('fetchRate', () => {
  it('fetches the default endpoint for the coin and parses the answer', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => PRICES };
    };

    const q = await fetchRate({ coin: 'btc', currency: 'USD', fetchImpl, now: NOW });
    expect(seen).toEqual([DEFAULT_RATE_ENDPOINTS.btc]);
    expect(q.minorPerCoin).toBe(2_650_050n);
    expect(q.fetchedAt).toBe(NOW.toISOString());

    await fetchRate({ coin: 'ltc', currency: 'EUR', fetchImpl, now: NOW });
    expect(seen[1]).toBe(DEFAULT_RATE_ENDPOINTS.ltc);
  });

  it('uses an explicit endpoint when one is configured', async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => PRICES };
    };
    await fetchRate({
      coin: 'btc',
      currency: 'USD',
      endpoint: 'https://prices.example.test/api/v1/prices',
      fetchImpl,
      now: NOW,
    });
    expect(seen).toEqual(['https://prices.example.test/api/v1/prices']);
  });

  it('reports a non-2xx answer as a network failure, keeping the status in the message', async () => {
    const q = () =>
      fetchRate({ coin: 'btc', currency: 'USD', fetchImpl: fakeFetch({}, 503), now: NOW });
    await expect(q()).rejects.toThrow(/503/);
    await expect(q()).rejects.toMatchObject({ kind: 'network' });
  });

  it('turns a thrown fetch error into a network RateError', async () => {
    const broken: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(
      fetchRate({ coin: 'btc', currency: 'USD', fetchImpl: broken, now: NOW }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('turns a non-JSON body into a bad-shape RateError', async () => {
    const html: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    await expect(
      fetchRate({ coin: 'btc', currency: 'USD', fetchImpl: html, now: NOW }),
    ).rejects.toMatchObject({ kind: 'bad-shape' });
  });

  it('times out on a provider that never answers, even if it ignores the abort signal', async () => {
    const hangs: FetchLike = () => new Promise(() => undefined);
    const started = Date.now();
    await expect(
      fetchRate({ coin: 'btc', currency: 'USD', fetchImpl: hangs, timeoutMs: 25, now: NOW }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('treats an AbortError from fetch as a timeout', async () => {
    const aborted: FetchLike = async () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    };
    await expect(
      fetchRate({ coin: 'btc', currency: 'USD', fetchImpl: aborted, timeoutMs: 50, now: NOW }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('refuses plain http to a remote host before making a request', async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => PRICES };
    };

    await expect(
      fetchRate({
        coin: 'btc',
        currency: 'USD',
        endpoint: 'http://prices.example.test/api/v1/prices',
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(RateError);
    expect(called).toBe(false);
  });

  it('refuses a non-http(s) endpoint', async () => {
    await expect(
      fetchRate({
        coin: 'btc',
        currency: 'USD',
        endpoint: 'ftp://example.test/prices',
        fetchImpl: fakeFetch(PRICES),
        now: NOW,
      }),
    ).rejects.toMatchObject({ kind: 'bad-shape' });
  });

  it('allows plain http to localhost, for a self-hosted feed', async () => {
    // A merchant running their own price feed on the till, or over an SSH tunnel, has no cert
    // to present; loopback is not a network a hotspot can rewrite.
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => PRICES };
    };

    for (const host of ['localhost:8080', '127.0.0.1:8080', '[::1]:8080']) {
      const url = `http://${host}/api/v1/prices`;
      const q = await fetchRate({
        coin: 'btc',
        currency: 'USD',
        endpoint: url,
        fetchImpl,
        now: NOW,
      });
      expect(q.minorPerCoin).toBe(2_650_050n);
    }
    expect(seen).toHaveLength(3);
  });

  it('surfaces a missing currency as currency-not-offered from the default endpoint', async () => {
    await expect(
      fetchRate({
        coin: 'btc',
        currency: 'CHF',
        fetchImpl: fakeFetch(PRICES),
        now: NOW,
      }),
    ).rejects.toMatchObject({ kind: 'currency-not-offered' });
  });
});
