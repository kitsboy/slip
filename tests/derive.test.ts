import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Address } from '@scure/btc-signer';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';

import { deriveAddress, previewAddresses, slipNetwork, sortedMultiWsh } from '../src/core/derive';
import { parseExtendedKey } from '../src/core/keys';

const b58c = base58check(sha256);

interface CoreFixture {
  accounts: Record<string, { path: string; xpub: string }>;
  cases: Array<{
    id: string;
    scriptType: string;
    descriptor: string;
    addresses: string[];
  }>;
}

const core = JSON.parse(
  readFileSync(resolve(__dirname, 'vectors/core-derived.json'), 'utf8'),
) as CoreFixture;

const fixtureCase = (id: string) => {
  const c = core.cases.find((x) => x.id === id);
  if (!c) throw new Error(`missing fixture ${id}`);
  return c;
};

// ---------------------------------------------------------------------------
// Official vectors — BIP-84 (segwit), BIP-86 (taproot), SLIP-132 (BIP-44/49)
// Values fetched from the BIP/SLIP texts, never transcribed from memory.
// ---------------------------------------------------------------------------

describe('official BIP-84 / BIP-86 / SLIP-132 vectors', () => {
  it('derives the BIP-84 first receive address from its zpub', () => {
    const key = parseExtendedKey(
      'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
    );
    expect(key.entry?.prefix).toBe('zpub');
    const got = deriveAddress(key, {
      networkId: 'btc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
    });
    expect(got.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(got.path).toBe('0/0');
  });

  it('derives BIP-84 addresses 0/1 and change 1/0', () => {
    const key = parseExtendedKey(
      'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
    );
    const one = deriveAddress(key, { networkId: 'btc-mainnet', scriptType: 'p2wpkh', index: 1 });
    const change = deriveAddress(key, {
      networkId: 'btc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
      change: 1,
    });
    expect(one.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(change.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });

  it('derives the BIP-86 taproot vector (BIP-341 tweak included)', () => {
    const key = parseExtendedKey(
      'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ',
    );
    const opts = { networkId: 'btc-mainnet' as const, scriptType: 'p2tr' as const };
    expect(deriveAddress(key, { ...opts, index: 0 }).address).toBe(
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    );
    expect(deriveAddress(key, { ...opts, index: 1 }).address).toBe(
      'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh',
    );
    expect(deriveAddress(key, { ...opts, index: 0, change: 1 }).address).toBe(
      'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7',
    );
  });

  it('derives the SLIP-132 BIP-44 legacy vector (xpub → 1…)', () => {
    const key = parseExtendedKey(
      'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj',
    );
    expect(
      deriveAddress(key, { networkId: 'btc-mainnet', scriptType: 'p2pkh', index: 0 }).address,
    ).toBe('1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA');
  });

  it('derives the SLIP-132 BIP-49 nested-segwit vector (ypub → 3…)', () => {
    const key = parseExtendedKey(
      'ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP',
    );
    expect(
      deriveAddress(key, { networkId: 'btc-mainnet', scriptType: 'p2sh-p2wpkh', index: 0 }).address,
    ).toBe('37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf');
  });
});

// ---------------------------------------------------------------------------
// Cross-check against Bitcoin Core's own deriveaddresses output.
// ---------------------------------------------------------------------------

describe('agrees with Bitcoin Core deriveaddresses', () => {
  const cases: Array<[string, 'p2pkh' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2tr', string]> = [
    ['pkh', 'p2pkh', 'bip44'],
    ['wpkh', 'p2wpkh', 'bip84'],
    ['sh-wpkh', 'p2sh-p2wpkh', 'bip49'],
    ['tr', 'p2tr', 'bip86'],
  ];

  for (const [id, scriptType, account] of cases) {
    it(`matches Core for ${id} (first 5 addresses)`, () => {
      const expected = fixtureCase(id).addresses;
      const key = parseExtendedKey(core.accounts[account]!.xpub);
      const got = previewAddresses(key, {
        networkId: 'btc-mainnet',
        scriptType,
        index: 0,
      });
      expect(got.map((a) => a.address)).toEqual(expected);
    });
  }

  it('matches Core for a 2-of-3 wsh(sortedmulti) descriptor', () => {
    const expected = fixtureCase('sortedmulti-2of3').addresses;
    const net = slipNetwork('btc-mainnet');
    const keys = ['multiA', 'multiB', 'multiC'].map((a) =>
      parseExtendedKey(core.accounts[a]!.xpub),
    );
    const got = expected.map((_, index) => {
      const pubkeys = keys.map((k) => {
        const child = k.node.deriveChild(0).deriveChild(index);
        if (!child.publicKey) throw new Error('no public key');
        return child.publicKey;
      });
      return sortedMultiWsh(pubkeys, 2, net);
    });
    expect(got).toEqual(expected);
  });

  it('matches Core on the change chain too (wpkh /1/*)', () => {
    const key = parseExtendedKey(core.accounts.bip84!.xpub);
    const got = deriveAddress(key, {
      networkId: 'btc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
      change: 1,
    });
    // Core vector BIP-84 change address 1/0.
    expect(got.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });
});

// ---------------------------------------------------------------------------
// Litecoin: same key, different parameters. The coin cannot be inferred, so the
// check is that our version byte / HRP wiring is right for the chosen coin.
// ---------------------------------------------------------------------------

describe('Litecoin parameters', () => {
  const bip44 = () => parseExtendedKey(core.accounts.bip44!.xpub);
  const bip84 = () => parseExtendedKey(core.accounts.bip84!.xpub);

  it('encodes the same hash160 with Litecoin P2PKH version bytes', () => {
    const btcAddr = deriveAddress(bip44(), {
      networkId: 'btc-mainnet',
      scriptType: 'p2pkh',
      index: 0,
    }).address;
    const ltcAddr = deriveAddress(bip44(), {
      networkId: 'ltc-mainnet',
      scriptType: 'p2pkh',
      index: 0,
    }).address;

    expect(ltcAddr.startsWith('L')).toBe(true);
    const btc = b58c.decode(btcAddr);
    const ltc = b58c.decode(ltcAddr);
    expect(btc[0]).toBe(0x00);
    expect(ltc[0]).toBe(0x30);
    // Same 20-byte hash160, only the version byte differs.
    expect(Buffer.from(ltc.slice(1)).equals(Buffer.from(btc.slice(1)))).toBe(true);
  });

  it('encodes native segwit under the ltc1 HRP, never bc1', () => {
    const btcAddr = deriveAddress(bip84(), {
      networkId: 'btc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
    }).address;
    const ltcAddr = deriveAddress(bip84(), {
      networkId: 'ltc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
    }).address;

    expect(btcAddr.startsWith('bc1q')).toBe(true);
    expect(ltcAddr.startsWith('ltc1q')).toBe(true);

    const btcDecoded = Address().decode(btcAddr) as { type: string; hash?: Uint8Array };
    const ltcDecoded = Address(slipNetwork('ltc-mainnet')).decode(ltcAddr) as {
      type: string;
      hash?: Uint8Array;
    };
    expect(ltcDecoded.type).toBe('wpkh');
    expect(Buffer.from(ltcDecoded.hash!).equals(Buffer.from(btcDecoded.hash!))).toBe(true);
  });

  it('uses tltc1 on Litecoin testnet and tb1 on Bitcoin testnets', () => {
    const key = bip84();
    expect(
      deriveAddress(key, { networkId: 'ltc-testnet', scriptType: 'p2wpkh', index: 0 }).address,
    ).toMatch(/^tltc1q/);
    expect(
      deriveAddress(key, { networkId: 'btc-signet', scriptType: 'p2wpkh', index: 0 }).address,
    ).toMatch(/^tb1q/);
    expect(
      deriveAddress(key, { networkId: 'btc-testnet4', scriptType: 'p2wpkh', index: 0 }).address,
    ).toMatch(/^tb1q/);
  });

  it('gives a different address per coin for the same ambiguous zpub', () => {
    const a = previewAddresses(bip84(), {
      networkId: 'btc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
    });
    const b = previewAddresses(bip84(), {
      networkId: 'ltc-mainnet',
      scriptType: 'p2wpkh',
      index: 0,
    });
    expect(a.map((x) => x.address)).not.toEqual(b.map((x) => x.address));
  });
});

describe('derivation guards', () => {
  it('refuses an index at or beyond the hardened boundary', () => {
    const key = parseExtendedKey(core.accounts.bip84!.xpub);
    expect(() =>
      deriveAddress(key, { networkId: 'btc-mainnet', scriptType: 'p2wpkh', index: 0x80000000 }),
    ).toThrow(/invalid derivation index/);
  });

  it('refuses a negative or fractional index', () => {
    const key = parseExtendedKey(core.accounts.bip84!.xpub);
    for (const bad of [-1, 1.5]) {
      expect(() =>
        deriveAddress(key, { networkId: 'btc-mainnet', scriptType: 'p2wpkh', index: bad }),
      ).toThrow();
    }
  });

  it('produces deterministic, distinct addresses for the first five indices', () => {
    const key = parseExtendedKey(core.accounts.bip84!.xpub);
    const a = previewAddresses(key, { networkId: 'btc-mainnet', scriptType: 'p2wpkh', index: 0 });
    const b = previewAddresses(key, { networkId: 'btc-mainnet', scriptType: 'p2wpkh', index: 0 });
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.address)).size).toBe(5);
  });
});
