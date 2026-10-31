import { describe, expect, it, vi } from 'vitest';
import {
  LnurlError,
  fetchPayParams,
  lightningUri,
  parseLightningAddress,
  requestInvoice,
  verifyPayment,
  type FetchLike,
} from '../src/core/providers/lnurl';

const PR = 'lnbc2500n1pn9xyzabc';

const PAY_PARAMS = {
  tag: 'payRequest',
  callback: 'https://ln.example.test/lnurlp/alice/callback',
  minSendable: 1_000,
  maxSendable: 100_000_000,
  metadata: '[["text/plain","Coffee"]]',
  commentAllowed: 40,
};

function fakeFetch(body: unknown, status = 200): FetchLike {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function hangUp(): FetchLike {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
}

describe('parseLightningAddress', () => {
  it('accepts user@domain and lowercases only the domain', () => {
    expect(parseLightningAddress('Alice@LN.Example.TEST')).toEqual({
      user: 'Alice',
      domain: 'ln.example.test',
    });
    expect(parseLightningAddress('bob+tag@tip.example')?.user).toBe('bob+tag');
  });

  it('rejects scheme, path, whitespace, and extra @ instead of repairing them', () => {
    expect(parseLightningAddress('https://alice@ln.example.test')).toBeNull();
    expect(parseLightningAddress('alice@ln.example.test/pay')).toBeNull();
    expect(parseLightningAddress('alice @ln.example.test')).toBeNull();
    expect(parseLightningAddress('alice@bob@ln.example.test')).toBeNull();
    expect(parseLightningAddress('alice@')).toBeNull();
    expect(parseLightningAddress('@ln.example.test')).toBeNull();
    expect(parseLightningAddress('alice')).toBeNull();
    expect(parseLightningAddress('')).toBeNull();
  });
});

describe('fetchPayParams', () => {
  it('asks the well-known endpoint and converts msat as bigints', async () => {
    const spy = vi.fn(fakeFetch(PAY_PARAMS));
    const params = await fetchPayParams('alice@ln.example.test', {
      fetchImpl: spy as unknown as FetchLike,
    });
    expect(spy.mock.calls[0]?.[0]).toBe('https://ln.example.test/.well-known/lnurlp/alice');
    expect(params.minSendableMsat).toBe(1_000n);
    expect(params.maxSendableMsat).toBe(100_000_000n);
    expect(params.tag).toBe('payRequest');
    expect(params.commentAllowed).toBe(40);
  });

  it('refuses a withdrawRequest served in place of a payRequest', async () => {
    await expect(
      fetchPayParams('alice@ln.example.test', {
        fetchImpl: fakeFetch({ ...PAY_PARAMS, tag: 'withdrawRequest' }),
      }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('refuses a callback that is not https', async () => {
    await expect(
      fetchPayParams('alice@ln.example.test', {
        fetchImpl: fakeFetch({ ...PAY_PARAMS, callback: 'http://ln.example.test/cb' }),
      }),
    ).rejects.toThrow(/not https/);
  });

  it('refuses a fractional minSendable rather than truncating it', async () => {
    await expect(
      fetchPayParams('alice@ln.example.test', {
        fetchImpl: fakeFetch({ ...PAY_PARAMS, minSendable: 1.5 }),
      }),
    ).rejects.toBeInstanceOf(LnurlError);
    await expect(
      fetchPayParams('alice@ln.example.test', {
        fetchImpl: fakeFetch({ ...PAY_PARAMS, maxSendable: 'lots' }),
      }),
    ).rejects.toThrow(/whole number/);
  });

  it('rejects a bad address before any request is made', async () => {
    const spy = vi.fn(fakeFetch(PAY_PARAMS));
    await expect(
      fetchPayParams('not an address', { fetchImpl: spy as unknown as FetchLike }),
    ).rejects.toThrow(/lightning address/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('requestInvoice', () => {
  const params = {
    callback: PAY_PARAMS.callback,
    minSendableMsat: 1_000n,
    maxSendableMsat: 100_000_000n,
    metadataHashes: PAY_PARAMS.metadata,
    tag: 'payRequest',
    commentAllowed: 40,
  };

  it('names the accepted range when the amount falls outside it', async () => {
    await expect(requestInvoice(params, 0n)).rejects.toMatchObject({ kind: 'invalid' });
    const outOfRange = requestInvoice(params, 250_000n);
    await expect(outOfRange).rejects.toMatchObject({ kind: 'out-of-range' });
    await expect(requestInvoice(params, 250_000n)).rejects.toThrow(/1–100000 sats/);
    await expect(requestInvoice(params, 250_000n)).rejects.toThrow(/range/);
  });

  it('sends the amount in millisatoshis and returns pr without a verify link', async () => {
    const spy = vi.fn(fakeFetch({ pr: PR }));
    const invoice = await requestInvoice(params, 25n, {
      fetchImpl: spy as unknown as FetchLike,
    });
    expect(spy.mock.calls[0]?.[0]).toBe(`${PAY_PARAMS.callback}?amount=25000`);
    expect(invoice.pr).toBe(PR);
    expect(invoice.verifyUrl).toBeNull();
    expect(invoice.successAction).toBeNull();
  });

  it('keeps an https verify link and appends a comment when allowed', async () => {
    const spy = vi.fn(fakeFetch({ pr: PR, verify: 'https://ln.example.test/verify/1' }));
    const invoice = await requestInvoice(params, 25n, {
      fetchImpl: spy as unknown as FetchLike,
      comment: 'flat white',
    });
    expect(invoice.verifyUrl).toBe('https://ln.example.test/verify/1');
    expect(spy.mock.calls[0]?.[0]).toContain('&comment=flat%20white');
  });

  it('refuses a verify link that is not https', async () => {
    await expect(
      requestInvoice(params, 25n, {
        fetchImpl: fakeFetch({ pr: PR, verify: 'http://ln.example.test/verify/1' }),
      }),
    ).rejects.toThrow(/verify link that is not https/);
  });

  it('surfaces the service reason instead of a blank invoice', async () => {
    await expect(
      requestInvoice(params, 25n, {
        fetchImpl: fakeFetch({ status: 'ERROR', reason: 'no liquidity' }),
      }),
    ).rejects.toThrow(/no liquidity/);
  });
});

describe('verifyPayment', () => {
  it('reports settled only on an explicit OK + settled:true', async () => {
    const res = await verifyPayment('https://ln.example.test/verify/1', {
      fetchImpl: fakeFetch({ status: 'OK', settled: true, preimage: 'aa11' }),
    });
    expect(res.settled).toBe(true);
    expect(res.preimage).toBe('aa11');
  });

  it('treats an error body and a pending body as not settled, without throwing', async () => {
    const failed = await verifyPayment('https://ln.example.test/verify/1', {
      fetchImpl: fakeFetch({ status: 'ERROR', reason: 'unknown invoice' }),
    });
    expect(failed.settled).toBe(false);
    expect(failed.preimage).toBeNull();

    const pending = await verifyPayment('https://ln.example.test/verify/1', {
      fetchImpl: fakeFetch({ status: 'OK', settled: false }),
    });
    expect(pending.settled).toBe(false);
  });

  it('does not claim settlement when the body is not JSON', async () => {
    const broken: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    const res = await verifyPayment('https://ln.example.test/verify/1', { fetchImpl: broken });
    expect(res.settled).toBe(false);
  });
});

describe('timeouts', () => {
  it('gives up with a network error when the service hangs', async () => {
    await expect(
      fetchPayParams('alice@ln.example.test', { fetchImpl: hangUp(), timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'network' });
    await expect(
      verifyPayment('https://ln.example.test/verify/1', { fetchImpl: hangUp(), timeoutMs: 20 }),
    ).rejects.toThrow(/did not answer in time/);
  });

  it('times out even when the fetch ignores the abort signal', async () => {
    const deaf: FetchLike = () => new Promise(() => undefined);
    await expect(
      fetchPayParams('alice@ln.example.test', { fetchImpl: deaf, timeoutMs: 20 }),
    ).rejects.toThrow(/did not answer in time/);
  });
});

describe('lightningUri', () => {
  it('upper-cases the invoice for QR alphanumeric mode', () => {
    expect(lightningUri(PR)).toBe(`lightning:${PR.toUpperCase()}`);
    expect(lightningUri('LNURL1DP68GURN8GHJ7')).toBe('lightning:LNURL1DP68GURN8GHJ7');
  });

  it('rejects anything that is not a bolt11 invoice or lnurl', () => {
    expect(() => lightningUri('bitcoin:bc1qxyz')).toThrow(/not a lightning invoice/);
    expect(() => lightningUri('')).toThrow(LnurlError);
  });
});
