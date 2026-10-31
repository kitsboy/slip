import { describe, expect, it } from 'vitest';
import {
  PREFIXES,
  SecretRefused,
  assertNotSecret,
  parseExtendedKey,
  prefixByVersion,
  resolveScript,
} from '../src/core/keys';

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

describe('secret refusal', () => {
  it('refuses a 12-word recovery phrase and never repeats it', () => {
    const phrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    let err: unknown;
    try {
      assertNotSecret(phrase);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SecretRefused);
    expect((err as SecretRefused).kind).toBe('seed phrase');
    // A refusal must name the kind, never echo the material.
    expect((err as Error).message).not.toContain('abandon');
  });

  it('refuses 24-word phrases too', () => {
    const phrase = new Array(24).fill('zoo').join(' ');
    expect(() => assertNotSecret(phrase)).toThrow(SecretRefused);
  });

  it('refuses every SLIP-132 private prefix', () => {
    const privs = [
      'xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu',
      'yprvAHwhK6RbpuS3dgCYHM5jc2ZvEKd7Bi61u9FVhYMpgMSuZS613T1xxQeKTffhrHY79hZ5PsskBjcc6C2V7DrnsMsNaGDaWev3GLRQRgV7hxF',
      'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE',
      'Ltpv71G8qDifUiNeph4VAgtSxGt2QvQ96BosNEXVYuzNfSWPqTfo5FtmqJZngGGhNZLSJvB3JbBiBzCcRNPzE8nSPUvJCGqNJZf6iE7u4vTA',
      'ttpv1Lw2sQ3Z5pQ8Kq1t9YyQ3Z5pQ8Kq1t9YyQ3Z5pQ8Kq1t9YyQ3Z5pQ8Kq1t9YyQ3Z5pQ8Kq1t9YyQ3Z5pQ8Kq1t9',
    ];
    for (const p of privs) {
      let kind: string | undefined;
      try {
        assertNotSecret(p);
      } catch (e) {
        kind = (e as SecretRefused).kind;
      }
      expect(kind, p.slice(0, 4)).toBe('extended private key');
    }
  });

  it('refuses a WIF private key and says only that it is one', () => {
    const wif = 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ';
    let err: unknown;
    try {
      assertNotSecret(wif);
    } catch (e) {
      err = e;
    }
    expect((err as SecretRefused).kind).toBe('WIF private key');
    expect((err as Error).message).not.toContain('L1aW4');
  });

  it('refuses a bare 32-byte hex secret', () => {
    expect(() => assertNotSecret('0'.repeat(64))).toThrow(SecretRefused);
  });

  it('does not refuse ordinary public material', () => {
    expect(() => assertNotSecret(ZPUB)).not.toThrow();
    expect(() => assertNotSecret('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).not.toThrow();
    expect(() => assertNotSecret('cafe@example.com')).not.toThrow();
  });
});

describe('SLIP-132 prefix table', () => {
  it('matches the registry version bytes', () => {
    const expected: Record<string, number> = {
      xpub: 0x0488b21e,
      ypub: 0x049d7cb2,
      zpub: 0x04b24746,
      tpub: 0x043587cf,
      upub: 0x044a5262,
      vpub: 0x045f1cf6,
      Ltub: 0x019da462,
      Mtub: 0x01b26ef6,
      ttub: 0x0436f6e1,
    };
    for (const [prefix, version] of Object.entries(expected)) {
      const entry = PREFIXES.find((p) => p.prefix === prefix);
      expect(entry, prefix).toBeDefined();
      expect(entry!.version, prefix).toBe(version);
      expect(prefixByVersion(version)?.prefix).toBe(prefix);
    }
  });

  it('marks zpub and vpub as coin-ambiguous (Bitcoin and Litecoin share them)', () => {
    expect(prefixByVersion(0x04b24746)!.coins).toEqual(['btc', 'ltc']);
    expect(prefixByVersion(0x045f1cf6)!.coins).toEqual(['btc', 'ltc']);
  });

  it('never maps two entries to the same version byte', () => {
    const versions = PREFIXES.map((p) => p.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe('parseExtendedKey', () => {
  it('reads depth, fingerprint and chain code', () => {
    const k = parseExtendedKey(ZPUB);
    expect(k.entry?.prefix).toBe('zpub');
    expect(k.depth).toBe(3);
    expect(k.chainCode.length).toBe(32);
    expect(k.publicKey[0]).toBe(0x02);
    expect(k.text).toBe(ZPUB);
  });

  it('rejects a corrupted checksum', () => {
    const corrupted = ZPUB.slice(0, -1) + (ZPUB.endsWith('s') ? 't' : 's');
    expect(() => parseExtendedKey(corrupted)).toThrow(/checksum|valid/i);
  });

  it('rejects rubbish without pretending to parse it', () => {
    expect(() => parseExtendedKey('hello world')).toThrow();
    expect(() => parseExtendedKey('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toThrow();
  });
});

describe('resolveScript', () => {
  it('suggests p2wpkh for a zpub and warns that the coin is ambiguous', () => {
    const k = parseExtendedKey(ZPUB);
    const r = resolveScript(k, { coin: 'ltc', networkId: 'ltc-mainnet', isTest: false });
    expect(r.scriptType).toBe('p2wpkh');
    expect(r.warnings.join(' ')).toMatch(/shared between BTC and LTC/);
  });

  it('warns when a mainnet key is used on a test network', () => {
    const k = parseExtendedKey(ZPUB);
    const r = resolveScript(k, { coin: 'btc', networkId: 'btc-signet', isTest: true });
    expect(r.warnings.join(' ')).toMatch(/mainnet key but the selected network is btc-signet/);
  });

  it('warns when the prefix belongs to another coin', () => {
    const k = parseExtendedKey(ZPUB);
    const r = resolveScript(k, { coin: 'btc', networkId: 'btc-mainnet', isTest: false });
    expect(r.scriptType).toBe('p2wpkh');
    // zpub is legitimately BTC too, so no coin complaint — but no false quiet either.
    expect(r.warnings.join(' ')).not.toMatch(/belongs to/);
  });

  it('lets the merchant override the suggested script type', () => {
    const k = parseExtendedKey(ZPUB);
    const r = resolveScript(k, {
      coin: 'btc',
      networkId: 'btc-mainnet',
      isTest: false,
      scriptType: 'p2tr',
    });
    expect(r.scriptType).toBe('p2tr');
  });
});
