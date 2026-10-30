// @vitest-environment node
/**
 * Node rather than jsdom: these tests need real WebCrypto (`crypto.subtle`), which jsdom
 * does not provide. The module itself only touches `globalThis.crypto`, so the same code
 * runs unchanged in the browser build.
 */
import { describe, expect, it } from 'vitest';

import {
  createBackup,
  describeBackup,
  passphraseStrength,
  restoreBackup,
} from '../src/core/backup';

const PASSPHRASE = 'till-9-open-2026!';

/** A realistic export: two counter accounts with real-looking child xpubs, plus settings. */
const XPUB_FRONT =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const XPUB_TRUCK =
  'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj';

function realisticState(): unknown {
  return {
    version: 1,
    accounts: [
      {
        id: 'acct_front',
        label: 'Front counter',
        xpub: XPUB_FRONT,
        coin: 'btc',
        networkId: 'btc-mainnet',
        scriptType: 'p2wpkh',
        fingerprintHex: 'a1b2c3d4',
        prefix: 'zpub',
        firstAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
        acknowledgedAt: '2026-10-28T09:12:00.000Z',
        createdAt: '2026-10-28T09:10:00.000Z',
        staffName: 'Ana',
        nextIndex: 47,
      },
      {
        id: 'acct_truck',
        label: 'Food truck',
        xpub: XPUB_TRUCK,
        coin: 'btc',
        networkId: 'btc-mainnet',
        scriptType: 'p2sh-p2wpkh',
        fingerprintHex: '9f8e7d6c',
        prefix: 'xpub',
        firstAddress: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        acknowledgedAt: null,
        createdAt: '2026-10-29T16:00:00.000Z',
        staffName: null,
        nextIndex: 0,
      },
    ],
    activeAccountId: 'acct_front',
    currentStaff: 'Ana',
    pinHash: 'pbkdf2$200000$c2FsdA==$aGFzaA==',
    settings: { currency: 'EUR', display: 'sats', tipPresets: [0, 100, 500], vatRate: 2000 },
    orders: [
      { id: 'o-1', totalSats: 125000, createdAt: '2026-10-30T08:01:00.000Z', paid: true },
    ],
  };
}

/** Re-seals an arbitrary payload under an existing envelope's salt. Used to forge a file. */
async function reseal(envelopeText: string, payload: string, passphrase: string): Promise<string> {
  const env = JSON.parse(envelopeText) as {
    kdf: { salt: string; iterations: number };
  } & Record<string, unknown>;

  const salt = Buffer.from(env.kdf.salt, 'base64');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: env.kdf.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('slip-backup-v1') },
    key,
    new TextEncoder().encode(payload),
  );

  return JSON.stringify({
    ...env,
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(new Uint8Array(sealed)).toString('base64'),
  });
}

describe('createBackup / restoreBackup', () => {
  it('round-trips a realistic till state', async () => {
    const state = realisticState();
    const file = await createBackup(state, PASSPHRASE);

    const result = await restoreBackup(file, PASSPHRASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state).toEqual(state);
    expect(result.version).toBe(1);
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
  });

  it('ships the declared envelope: format, version, KDF cost, salt and IV sizes', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);
    const env = JSON.parse(file) as Record<string, unknown> & {
      kdf: { alg: string; iterations: number; salt: string };
      iv: string;
    };

    expect(env['format']).toBe('slip-backup');
    expect(env['version']).toBe(1);
    expect(env.kdf.alg).toBe('PBKDF2-SHA256');
    expect(env.kdf.iterations).toBe(310_000);
    expect(Buffer.from(env.kdf.salt, 'base64').length).toBe(16);
    expect(Buffer.from(env.iv, 'base64').length).toBe(12);
    expect(env['note']).toBe('contains public wallet material only — no keys');
  });

  it('never stores an xpub in the clear', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);

    expect(file).not.toContain(XPUB_FRONT);
    expect(file).not.toContain(XPUB_TRUCK);
    expect(file).not.toContain('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(file).not.toContain('Front counter');
    // Sanity: the plaintext JSON really does contain those strings.
    expect(JSON.stringify(realisticState())).toContain(XPUB_FRONT);
  });

  it('returns ok:false (and does not throw) on a wrong passphrase', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);

    const result = await restoreBackup(file, 'till-9-open-2026?');
    expect(result).toEqual({ ok: false, error: 'passphrase is wrong, or the file is damaged' });
  });

  it('rejects a byte-flipped ciphertext', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);
    const env = JSON.parse(file) as Record<string, unknown> & { ciphertext: string };

    const raw = Buffer.from(env.ciphertext, 'base64');
    const middle = Math.floor(raw.length / 2);
    raw[middle] = (raw[middle] ?? 0) ^ 0x01;

    const damaged = JSON.stringify({ ...env, ciphertext: raw.toString('base64') });
    const result = await restoreBackup(damaged, PASSPHRASE);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('passphrase is wrong, or the file is damaged');
  });

  it('rejects a tampered header version instead of guessing at the format', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);
    const env = JSON.parse(file) as Record<string, unknown>;

    const bumped = await restoreBackup(JSON.stringify({ ...env, version: 2 }), PASSPHRASE);
    expect(bumped.ok).toBe(false);
    if (!bumped.ok) expect(bumped.error).toContain('newer version of slip');

    const zeroed = await restoreBackup(JSON.stringify({ ...env, version: 0 }), PASSPHRASE);
    expect(zeroed).toEqual({ ok: false, error: 'this backup has an unreadable version number' });
  });

  it('rejects a header that is not a slip backup', async () => {
    const result = await restoreBackup(JSON.stringify({ hello: 'world' }), PASSPHRASE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not a slip backup file');

    const garbage = await restoreBackup('not json at all', PASSPHRASE);
    expect(garbage).toEqual({ ok: false, error: 'this is not a slip backup file — it is not valid JSON' });
  });

  it('catches a payload whose plaintext checksum does not match', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);

    // Forge a correctly encrypted payload whose checksum belongs to different content: this
    // is what a truncation/corruption bug at export time would look like.
    const lyingPayload = JSON.stringify({
      checksum: '0'.repeat(64),
      stateJson: JSON.stringify({ accounts: [{ xpub: XPUB_FRONT }] }),
    });
    const forged = await reseal(file, lyingPayload, PASSPHRASE);

    const result = await restoreBackup(forged, PASSPHRASE);
    expect(result).toEqual({
      ok: false,
      error: 'the backup content does not match its checksum — the file is damaged',
    });
  });

  it('accepts a correctly checksummed payload sealed by hand', async () => {
    // Guards against the checksum test passing for the wrong reason (e.g. reseal being broken).
    const file = await createBackup(realisticState(), PASSPHRASE);
    const stateJson = '{"accounts":[],"activeAccountId":null}';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stateJson));
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const forged = await reseal(file, JSON.stringify({ checksum, stateJson }), PASSPHRASE);

    const result = await restoreBackup(forged, PASSPHRASE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual({ accounts: [], activeAccountId: null });
  });

  it('refuses to create a backup with a weak passphrase', async () => {
    await expect(createBackup(realisticState(), 'password1234')).rejects.toThrow(/common/i);
  });
});

describe('describeBackup', () => {
  it('describes the file without the passphrase', async () => {
    const file = await createBackup(realisticState(), PASSPHRASE);
    const info = describeBackup(file);

    expect(info.format).toBe('slip-backup');
    expect(info.version).toBe(1);
    expect(info.encrypted).toBe(true);
    expect(new TextEncoder().encode(file).length).toBe(info.bytes);
    expect(info.bytes).toBeGreaterThan(100);
    expect(Number.isNaN(Date.parse(info.createdAt))).toBe(false);
  });

  it('throws a clear error on a file it cannot describe', () => {
    expect(() => describeBackup('{}')).toThrow(/not a slip backup file/);
  });
});

describe('passphraseStrength', () => {
  it('rejects the most common passwords', () => {
    expect(passphraseStrength('password')).toEqual({
      ok: false,
      reason: 'use at least 12 characters',
    });
    expect(passphraseStrength('password123').ok).toBe(false);
    expect(passphraseStrength('PASSWORD123').ok).toBe(false);
    expect(passphraseStrength('satoshi').ok).toBe(false);
  });

  it('rejects a six-character passphrase', () => {
    const verdict = passphraseStrength('aB3$xY');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('12 characters');
  });

  it('rejects a long but single-class passphrase', () => {
    const verdict = passphraseStrength('lowercaseonly');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('mix at least three');
  });

  it('accepts a 20-character passphrase even without digits or symbols', () => {
    expect(passphraseStrength('correct horse battery').ok).toBe(true);
  });

  it('accepts 12+ characters spanning three classes', () => {
    expect(passphraseStrength('FrontCounter9').ok).toBe(true);
    expect(passphraseStrength('front-counter9').ok).toBe(true);
    expect(passphraseStrength('FRONT-COUNTER9').ok).toBe(true);
  });
});
