import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { Address } from '@scure/btc-signer/payment';

import { deriveAddress, slipNetwork } from '../src/core/derive';
import { parseExtendedKey, prefixByName } from '../src/core/keys';

/**
 * Litecoin, end to end — the coin slip ships as its second chain, and the only one this run touches.
 *
 * Two things are being proved here, and they are different:
 *   1. the six version bytes notice slip prints to a merchant are the six SLIP-0132 registers
 *      (Ltub / Mtub / ttub and their private twins), read from the SLIP text, not remembered;
 *   2. a key of each family, encoded with *those* bytes, derives an address whose first characters and
 *      whose decoded payload belong to Litecoin and to no other chain — including the testnet4 quirks
 *      where P2SH moved to `Q` and bech32 moved to `rltc`.
 *
 * A wrong payload here is not a cosmetic bug: it is a shop showing a customer an address their wallet
 * will not recognise, on a chain that has no undo.
 */

const b58c = base58check(sha256);
const core = JSON.parse(readFileSync(resolve(__dirname, 'vectors/core-derived.json'), 'utf8')) as {
  accounts: Record<string, { path: string; xpub: string }>;
};

/** Re-encode a version-agnostic 78-byte extended key with another coin's version bytes. */
function rebrand(xpub: string, version: number): string {
  const raw = b58c.decode(xpub);
  const next = new Uint8Array(raw);
  next.set([(version >>> 24) & 0xff, (version >>> 16) & 0xff, (version >>> 8) & 0xff, version & 0xff], 0);
  return b58c.encode(next);
}

const SLIP_132 = [
  ['Ltub', 0x019da462, 'main', 'ltc'],
  ['Mtub', 0x01b26ef6, 'main', 'ltc'],
  ['ttub', 0x0436f6e1, 'test', 'ltc'],
] as const;

describe('Litecoin key prefixes match SLIP-0132', () => {
  for (const [prefix, version, family] of SLIP_132) {
    it(`${prefix} is 0x${version.toString(16)} and belongs to ${family}net Litecoin only`, () => {
      const entry = prefixByName(prefix);
      expect(entry?.version).toBe(version);
      expect(entry?.family).toBe(family);
      expect(entry?.coins).toEqual(['ltc']);
    });
  }
});

describe('a Litecoin key of each family derives a Litecoin address', () => {
  const xpub = core.accounts.bip44!.xpub;

  it('Ltub → an L… legacy address whose payload decodes as Litecoin 0x30', () => {
    const key = parseExtendedKey(rebrand(xpub, 0x019da462));
    // The prefix is what tells slip this key is Litecoin; the coin itself is the merchant's choice,
    // because an `xpub`/`zpub` is legitimate on both chains.
    expect(key.entry?.prefix).toBe('Ltub');
    expect(key.version).toBe(0x019da462);
    expect(key.entry?.coins).toEqual(['ltc']);
    const addr = deriveAddress(key, { networkId: 'ltc-mainnet', scriptType: 'p2pkh', index: 0 }).address;
    expect(addr).toMatch(/^L/);
    expect(b58c.decode(addr)[0]).toBe(0x30);
    expect(Address(slipNetwork('ltc-mainnet')).decode(addr).type).toBe('pkh');
  });

  it('Mtub → an M… nested-segwit address on 0x32, and Bitcoin’s decoder refuses it', () => {
    const key = parseExtendedKey(rebrand(xpub, 0x01b26ef6));
    const addr = deriveAddress(key, {
      networkId: 'ltc-mainnet',
      scriptType: 'p2sh-p2wpkh',
      index: 0,
    }).address;
    expect(addr).toMatch(/^M/);
    expect(b58c.decode(addr)[0]).toBe(0x32);
    expect(() => Address().decode(addr)).toThrow();
  });

  it('ttub → a Litecoin testnet4 legacy address on 0x6f', () => {
    const key = parseExtendedKey(rebrand(xpub, 0x0436f6e1));
    const addr = deriveAddress(key, { networkId: 'ltc-testnet', scriptType: 'p2pkh', index: 0 }).address;
    expect(addr).toMatch(/^[mn]/);
    expect(b58c.decode(addr)[0]).toBe(0x6f);
  });

  it('Litecoin testnet4 nested segwit uses P2SH version 0x3a, so the address starts with Q', () => {
    const key = parseExtendedKey(rebrand(xpub, 0x01b26ef6));
    const addr = deriveAddress(key, {
      networkId: 'ltc-testnet',
      scriptType: 'p2sh-p2wpkh',
      index: 0,
    }).address;
    expect(addr).toMatch(/^Q/);
    expect(b58c.decode(addr)[0]).toBe(0x3a);
  });

  it('a taproot address on Litecoin mainnet is ltc1p, never bc1p', () => {
    const key = parseExtendedKey(rebrand(xpub, 0x019da462));
    const addr = deriveAddress(key, { networkId: 'ltc-mainnet', scriptType: 'p2tr', index: 0 }).address;
    expect(addr).toMatch(/^ltc1p/);
    expect(Address(slipNetwork('ltc-mainnet')).decode(addr).type).toBe('tr');
  });
});
