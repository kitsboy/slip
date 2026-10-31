import { webcrypto } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CALENDARS,
  dayDigest,
  describeAnchor,
  submitAnchor,
  verifyLocally,
  type Anchor,
  type AnchorInvoice,
  type FetchLike,
} from '../src/core/anchor';

/**
 * jsdom does not implement SubtleCrypto, so the hash would be missing under the
 * test environment even though every real browser has it. Node 22 ships the same
 * WebCrypto API; install it only when the environment lacks it, so these tests
 * exercise the module's real code path rather than a stub.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const DAY = '2026-10-14';

/** SHA-256 of the empty string: the digest of a day with no sales. */
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function invoice(overrides: Partial<AnchorInvoice> = {}): AnchorInvoice {
  return {
    id: 'inv_0001',
    createdAt: `${DAY}T09:15:00.000Z`,
    amountAtoms: 12_500n,
    status: 'complete',
    walletId: 'acct_front',
    ...overrides,
  };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

interface Captured {
  readonly url: string;
  readonly init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array };
}

describe('dayDigest', () => {
  it('is deterministic when the invoice order is shuffled', async () => {
    const a = invoice({ id: 'inv_a', amountAtoms: 1_000n });
    const b = invoice({ id: 'inv_b', amountAtoms: 2_000n, createdAt: `${DAY}T11:00:00.000Z` });
    const c = invoice({ id: 'inv_c', amountAtoms: 3_000n, walletId: 'acct_truck' });

    const first = await dayDigest([a, b, c], DAY);
    const shuffled = await dayDigest([c, a, b], DAY);
    const reversed = await dayDigest([c, b, a], DAY);

    expect(shuffled.digestHex).toBe(first.digestHex);
    expect(reversed.digestHex).toBe(first.digestHex);
    expect(first.digestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.count).toBe(3);
    expect(first.totalAtoms).toBe(6_000n);
  });

  it('does not mutate the caller’s array', async () => {
    const list = [invoice({ id: 'inv_z' }), invoice({ id: 'inv_a' })];
    await dayDigest(list, DAY);
    expect(list.map((i) => i.id)).toEqual(['inv_z', 'inv_a']);
  });

  it('gives a different digest when an amount changes', async () => {
    const before = await dayDigest([invoice({ amountAtoms: 12_500n })], DAY);
    const after = await dayDigest([invoice({ amountAtoms: 12_501n })], DAY);

    expect(after.digestHex).not.toBe(before.digestHex);
    expect(after.totalAtoms).toBe(12_501n);
  });

  it('gives a different digest when a wallet changes', async () => {
    const before = await dayDigest([invoice({ walletId: 'acct_front' })], DAY);
    const after = await dayDigest([invoice({ walletId: 'acct_truck' })], DAY);
    expect(after.digestHex).not.toBe(before.digestHex);
  });

  it('hashes the empty string on a day with no sales', async () => {
    const book = await dayDigest([], DAY);
    expect(book).toEqual({ date: DAY, count: 0, totalAtoms: 0n, digestHex: EMPTY_SHA256 });
  });

  it('includes completed invoices only', async () => {
    const complete = invoice({ id: 'inv_ok', amountAtoms: 5_000n });
    const awaiting = invoice({ id: 'inv_wait', amountAtoms: 90_000n, status: 'awaiting' });

    const withBoth = await dayDigest([complete, awaiting], DAY);
    const withComplete = await dayDigest([complete], DAY);

    expect(withBoth.count).toBe(1);
    expect(withBoth.totalAtoms).toBe(5_000n);
    expect(withBoth.digestHex).toBe(withComplete.digestHex);
  });

  it('excludes invoices from other days', async () => {
    const yesterday = invoice({ id: 'inv_y', createdAt: '2026-10-13T23:59:59.000Z' });
    const book = await dayDigest([yesterday, invoice()], DAY);
    expect(book.count).toBe(1);
  });

  it('throws a clear error when WebCrypto is missing', async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      await expect(dayDigest([invoice()], DAY)).rejects.toThrow(/WebCrypto/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('submitAnchor', () => {
  it('posts the raw digest and stores the returned timestamp as base64', async () => {
    const book = await dayDigest([invoice()], DAY);
    const proof = new Uint8Array([0x00, 0x4f, 0x54, 0x53, 0xff, 0x10]);
    const calls: Captured[] = [];

    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array(proof).buffer as ArrayBuffer,
      };
    };

    const anchor = await submitAnchor(book, {
      calendar: CALENDARS[0],
      fetchImpl,
      now: new Date('2026-10-14T22:05:00.000Z'),
    });

    expect(anchor.status).toBe('submitted');
    expect(anchor.error).toBeNull();
    expect(anchor.proofBase64).toBe(base64(proof));
    expect(anchor.submittedAt).toBe('2026-10-14T22:05:00.000Z');
    expect(anchor.calendar).toBe(CALENDARS[0]);
    expect(anchor.digestHex).toBe(book.digestHex);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(`${CALENDARS[0]}/digest`);
    expect(call.init?.method).toBe('POST');
    expect(call.init?.headers?.['Content-Type']).toBe('application/octet-stream');

    const sent = call.init?.body;
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(sent!.length).toBe(32);
    // The bytes on the wire are exactly the digest, not its hex text.
    expect(Array.from(sent!)).toEqual(
      Array.from({ length: 32 }, (_, i) =>
        Number.parseInt(book.digestHex.slice(i * 2, i * 2 + 2), 16),
      ),
    );
  });

  it('returns a failed anchor on a refused request instead of throwing', async () => {
    const book = await dayDigest([invoice()], DAY);
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 503,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const anchor = await submitAnchor(book, { fetchImpl });

    expect(anchor.status).toBe('failed');
    expect(anchor.proofBase64).toBeNull();
    expect(anchor.submittedAt).toBeNull();
    expect(anchor.error).toContain('503');
  });

  it('returns a failed anchor when the network throws', async () => {
    const book = await dayDigest([invoice()], DAY);
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };

    const anchor = await submitAnchor(book, { fetchImpl });

    expect(anchor.status).toBe('failed');
    expect(anchor.error).toMatch(/connection/i);
  });

  it('returns a failed anchor on an empty response body', async () => {
    const book = await dayDigest([invoice()], DAY);
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const anchor = await submitAnchor(book, { fetchImpl });
    expect(anchor.status).toBe('failed');
    expect(anchor.proofBase64).toBeNull();
  });

  it('gives up after the timeout without throwing', async () => {
    const book = await dayDigest([invoice()], DAY);

    // A calendar that accepts the request and never answers. The module must give
    // up on its own deadline rather than wait for a socket to time out.
    const fetchImpl: FetchLike = () => new Promise<never>(() => undefined);

    const anchor = await submitAnchor(book, { fetchImpl, timeoutMs: 20 });
    expect(anchor.status).toBe('failed');
    expect(anchor.error).toMatch(/did not answer/i);
  });

  it('refuses an anchor whose digest is not 32 bytes', async () => {
    const broken = { date: DAY, count: 1, totalAtoms: 1n, digestHex: 'aabb' };
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) };
    };

    const anchor = await submitAnchor(broken, { fetchImpl });
    expect(anchor.status).toBe('failed');
    expect(called).toBe(false);
  });
});

describe('describeAnchor', () => {
  const anchor = (status: Anchor['status'], error: string | null = null): Anchor => ({
    date: DAY,
    digestHex: '00',
    status,
    submittedAt: null,
    calendar: null,
    proofBase64: null,
    error,
  });

  it('says local-only plainly', () => {
    expect(describeAnchor(anchor('local-only'))).toBe('Hashed locally. Not yet timestamped.');
  });

  it('never claims a Bitcoin confirmation', () => {
    const texts = [
      describeAnchor(anchor('local-only')),
      describeAnchor(anchor('submitted')),
      describeAnchor(anchor('failed', 'HTTP 503')),
    ];

    for (const text of texts) {
      expect(text.toLowerCase()).not.toContain('confirmed');
      expect(text.toLowerCase()).not.toContain('confirmation');
    }
    expect(texts[1]).toContain('submitted');
    expect(texts[1]).toContain('own time');
    expect(texts[2]).toBe('Not timestamped: HTTP 503');
  });

  it('does not print an empty error', () => {
    expect(describeAnchor(anchor('failed'))).toBe(
      'Not timestamped: the calendar could not be reached.',
    );
  });
});

describe('verifyLocally', () => {
  it('confirms unchanged books', async () => {
    const invoices = [
      invoice({ id: 'inv_a', amountAtoms: 1_000n }),
      invoice({ id: 'inv_b', amountAtoms: 2_000n, createdAt: `${DAY}T12:00:00.000Z` }),
    ];
    const book = await dayDigest(invoices, DAY);

    const result = await verifyLocally(book, invoices);
    expect(result.ok).toBe(true);
  });

  it('reports an edited amount as tampering', async () => {
    const invoices = [invoice({ id: 'inv_a', amountAtoms: 1_000n })];
    const book = await dayDigest(invoices, DAY);

    const edited = [invoice({ id: 'inv_a', amountAtoms: 1_000_001n })];
    const result = await verifyLocally(book, edited);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/edited/i);
  });

  it('reports a removed invoice as tampering', async () => {
    const invoices = [
      invoice({ id: 'inv_a', amountAtoms: 1_000n }),
      invoice({ id: 'inv_b', amountAtoms: 2_000n, createdAt: `${DAY}T12:00:00.000Z` }),
    ];
    const book = await dayDigest(invoices, DAY);

    const result = await verifyLocally(book, [invoices[0]!]);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/count/i);
  });
});
