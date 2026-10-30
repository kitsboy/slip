import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { descriptorChecksum, parseDescriptor } from '../src/core/descriptors';
import type { ParsedDescriptor } from '../src/core/descriptors';
import { SecretRefused } from '../src/core/keys';

interface FixtureCase {
  id: string;
  scriptType: string;
  body: string;
  checksum: string;
  descriptor: string;
  addresses: string[];
}

interface Fixture {
  fingerprint: string;
  cases: FixtureCase[];
  accounts: Record<string, { path: string; xpub: string }>;
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'vectors/descriptors.json'), 'utf8'),
) as Fixture;

const caseById = (id: string): FixtureCase => {
  const c = fixture.cases.find((x) => x.id === id);
  if (!c) throw new Error(`missing descriptor fixture ${id}`);
  return c;
};

function parsed(raw: string, networkId: 'btc-mainnet' = 'btc-mainnet'): ParsedDescriptor {
  const result = parseDescriptor(raw, networkId);
  if (!result.ok) throw new Error(`expected a descriptor, got refusal: ${result.error}`);
  return result.descriptor;
}

function errorOf(raw: string, networkId: 'btc-mainnet' | 'btc-signet' = 'btc-mainnet'): string {
  const result = parseDescriptor(raw, networkId);
  if (result.ok) throw new Error('expected refusal, got a parsed descriptor');
  return result.error;
}

// ---------------------------------------------------------------------------
// BIP-380 checksum: our implementation vs. Bitcoin Core's getdescriptorinfo
// ---------------------------------------------------------------------------

describe('BIP-380 checksum agrees with Bitcoin Core', () => {
  for (const c of fixture.cases) {
    it(`computes Core's checksum for ${c.id}`, () => {
      // Core returns this checksum in `getdescriptorinfo`; matching it means the
      // polymod, the base-9 group expansion and the 40-bit register all agree
      // with the implementation every wallet interoperates with.
      expect(descriptorChecksum(c.body)).toBe(c.checksum);
    });

    it(`rejects a tampered checksum on ${c.id}`, () => {
      const last = c.checksum.slice(-1);
      // Pick a different character from the checksum alphabet, deterministically.
      const replacement = last === 'q' ? 'p' : 'q';
      const tampered = `${c.body}#${c.checksum.slice(0, -1)}${replacement}`;
      expect(errorOf(tampered)).toBe('descriptor checksum does not match');
    });
  }

  it('checksums the body and the body-plus-checksum the same way', () => {
    // A descriptor with a valid suffix must checksum to exactly that suffix,
    // i.e. our parser is not silently checksumming the `#…` part too.
    const c = caseById('tr');
    expect(descriptorChecksum(c.descriptor)).not.toBe(c.checksum);
    expect(descriptorChecksum(c.body)).toBe(c.checksum);
  });

  it('refuses a body with a character outside the input charset', () => {
    expect(() => descriptorChecksum('wpkh(xpub€)')).toThrow(/outside the BIP-380 input charset/);
  });
});

// ---------------------------------------------------------------------------
// Per-index derivation vs. bitcoin-cli deriveaddresses
// ---------------------------------------------------------------------------

describe('receive(index) agrees with bitcoin-cli deriveaddresses', () => {
  for (const c of fixture.cases) {
    it(`derives ${c.addresses.length} address(es) for ${c.id}`, () => {
      const d = parsed(c.descriptor);
      expect(d.scriptType).toBe(c.scriptType);
      expect(d.checksum).toBe(c.checksum);
      c.addresses.forEach((expected, i) => {
        expect(d.receive(i)).toBe(expected);
      });
    });
  }

  it('parses the same descriptor without a checksum (checksum is optional)', () => {
    for (const c of fixture.cases) {
      const d = parsed(c.body);
      expect(d.checksum).toBeNull();
      c.addresses.forEach((expected, i) => {
        expect(d.receive(i)).toBe(expected);
      });
    }
  });

  it('keeps every key from a 2-of-3 sortedmulti, in source order', () => {
    const c = caseById('sortedmulti-2of3');
    const d = parsed(c.descriptor);
    expect(d.threshold).toBe(2);
    expect(d.keys.map((k) => k.xpub)).toEqual([
      fixture.accounts.multiA!.xpub,
      fixture.accounts.multiB!.xpub,
      fixture.accounts.multiC!.xpub,
    ]);
  });

  it('returns one constant address for a fixed-pubkey descriptor', () => {
    const c = caseById('sortedmulti-fixed');
    const d = parsed(c.descriptor);
    // A non-range descriptor has no wildcard, so the index must not change it —
    // silently deriving from a fixed key would invent an address.
    expect(d.receive(0)).toBe(c.addresses[0]);
    expect(d.receive(7)).toBe(c.addresses[0]);
    expect(d.keys).toHaveLength(3);
  });

  it('reads the key origin and keeps the master fingerprint', () => {
    const c = caseById('wpkh-origin');
    const d = parsed(c.descriptor);
    const key = d.keys[0];
    if (!key) throw new Error('expected one key');
    expect(key.origin).toBe(`${fixture.fingerprint}/84'/0'/0'`);
    expect(key.fingerprintHex).toBe(fixture.fingerprint);
    // The origin is metadata: it must not change which key is derived from.
    expect(d.receive(0)).toBe(caseById('wpkh').addresses[0]);
  });

  it('falls back to the extended key parent fingerprint when there is no origin', () => {
    const key = parsed(caseById('wpkh').descriptor).keys[0];
    if (!key) throw new Error('expected one key');
    expect(key.origin).toBeNull();
    expect(key.fingerprintHex).toMatch(/^[0-9a-f]{8}$/);
  });

  it('derives the change chain and deeper fixed paths', () => {
    const xpub = fixture.accounts.bip84!.xpub;
    // 1/* is Core's change chain for the same account.
    const change = parsed(`wpkh(${xpub}/1/*)`);
    expect(change.receive(0)).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
    // A numeric final step is a fixed descriptor: same address at any index.
    const fixed = parsed(`wpkh(${xpub}/0/1)`);
    expect(fixed.receive(0)).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(fixed.receive(9)).toBe(fixed.receive(0));
  });
});

// ---------------------------------------------------------------------------
// Official BIP-86 vector
// ---------------------------------------------------------------------------

describe('BIP-86 official taproot vector', () => {
  const BIP86_XPUB =
    'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ';

  it('produces the published first receive address from tr(xpub/0/*)', () => {
    const d = parsed(`tr(${BIP86_XPUB}/0/*)`);
    expect(d.scriptType).toBe('p2tr');
    expect(d.receive(0)).toBe(
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    );
  });

  it('matches the same address with the Core-provided checksum attached', () => {
    const c = caseById('tr');
    expect(parsed(c.descriptor).receive(0)).toBe(
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    );
  });
});

// ---------------------------------------------------------------------------
// Secret refusal — kind-only messages, never the material
// ---------------------------------------------------------------------------

describe('secrets are refused without being echoed', () => {
  const MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const XPRV =
    'xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu';

  it('refuses a seed phrase wrapped in wpkh()', () => {
    const error = errorOf(`wpkh(${MNEMONIC})`);
    expect(error).toBe(new SecretRefused('seed phrase').message);
    expect(error).not.toContain('abandon');
  });

  it('refuses a bare seed phrase before grammar parsing', () => {
    const error = errorOf(MNEMONIC);
    expect(error).toBe(new SecretRefused('seed phrase').message);
    expect(error).not.toContain('abandon');
  });

  it('refuses an xprv inside a descriptor', () => {
    const error = errorOf(`wpkh(${XPRV}/0/*)`);
    expect(error).toBe(new SecretRefused('extended private key').message);
    // A refusal that repeated the key would have written it into the log.
    expect(error).not.toContain('xprv9');
    expect(error).not.toContain(XPRV);
  });

  it('refuses an xprv inside a multisig descriptor', () => {
    const xpub = fixture.accounts.multiA!.xpub;
    const error = errorOf(`wsh(sortedmulti(1,${xpub}/0/*,${XPRV}/0/*))`);
    expect(error).toBe(new SecretRefused('extended private key').message);
    expect(error).not.toContain(XPRV);
  });
});

// ---------------------------------------------------------------------------
// Rejections — the ways a descriptor can be wrong
// ---------------------------------------------------------------------------

describe('rejections', () => {
  const xpub = () => fixture.accounts.bip84!.xpub;

  it('rejects a hardened step in the derivable path', () => {
    const error = errorOf(`wpkh(${xpub()}/0'/*)`);
    expect(error).toMatch(/hardened derivation step/);
  });

  it('rejects a hardened step anywhere after the key', () => {
    expect(errorOf(`wpkh(${xpub()}/0'/0/*)`)).toMatch(/hardened derivation step/);
    expect(errorOf(`wpkh(${xpub()}/0/*/1)`)).toMatch(/must be the last step/);
  });

  it('rejects unknown functions', () => {
    const error = errorOf('addr(bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu)');
    expect(error).toMatch(/unsupported descriptor function "addr"/);
    expect(errorOf(`wsh(multi(2,${xpub()}/0/*,${xpub()}/1/*))`)).toMatch(/sortedmulti/);
    expect(errorOf(`sh(multi(1,${xpub()}/0/*))`)).toMatch(/sh\(\) must wrap exactly one wpkh/);
  });

  it('rejects text that is not a function call at all', () => {
    expect(errorOf('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toMatch(/not a descriptor/);
    expect(
      errorOf(
        'wpkh(xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V/0/*',
      ),
    ).toMatch(/is not balanced/);
  });

  it('rejects a checksum of the wrong length', () => {
    expect(errorOf(`wpkh(${xpub()}/0/*)#abc`)).toMatch(/8 characters/);
    expect(errorOf(`wpkh(${xpub()}/0/*)#`)).toMatch(/8 characters/);
  });

  it('rejects a mainnet key on a test network', () => {
    const error = errorOf(`wpkh(${xpub()}/0/*)`, 'btc-signet');
    expect(error).toMatch(/mainnet key \(xpub\)/);
    expect(error).toContain('btc-signet');
  });

  it('rejects a test-network key on mainnet', () => {
    const tpub =
      'tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M';
    const error = errorOf(`wpkh(${tpub}/0/*)`);
    expect(error).toMatch(/test-network key \(tpub\)/);
  });

  it('rejects a threshold larger than the key count', () => {
    const a = fixture.accounts.multiA!.xpub;
    const b = fixture.accounts.multiB!.xpub;
    expect(errorOf(`wsh(sortedmulti(3,${a}/0/*,${b}/0/*))`)).toMatch(/exceeds its 2 keys/);
    expect(errorOf(`wsh(sortedmulti(0,${a}/0/*,${b}/0/*))`)).toMatch(/at least 1/);
  });

  it('rejects a path after a fixed pubkey', () => {
    const hex = fixture.cases.find((c) => c.id === 'sortedmulti-fixed')!.body.split(',')[1]!;
    const key = hex.split(')')[0]!;
    expect(errorOf(`wpkh(${key}/0/*)`)).toMatch(/fixed pubkey has no depth/);
  });

  it('rejects an unparseable key without leaking it verbatim', () => {
    const error = errorOf('wpkh(not-a-key/0/*)');
    expect(error).toMatch(/extended key/i);
  });

  it('rejects out-of-range receive indices', () => {
    const d = parsed(caseById('wpkh').descriptor);
    expect(() => d.receive(-1)).toThrow(/invalid derivation index/);
    expect(() => d.receive(0x80000000)).toThrow(/invalid derivation index/);
    expect(() => d.receive(1.5)).toThrow(/invalid derivation index/);
  });
});
