import { describe, expect, it } from 'vitest';
import { pairCode, readPairCode } from '../src/core/pair';

const wallet = {
  label: 'Front counter',
  material:
    'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
  coin: 'btc' as const,
  networkId: 'btc-mainnet' as const,
  source: 'xpub' as const,
  scriptType: 'p2wpkh' as const,
};

describe('wallet pairing codes', () => {
  it('round-trips a public wallet', () => {
    const code = pairCode(wallet);
    const back = readPairCode(code);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.wallet.label).toBe('Front counter');
      expect(back.wallet.material).toBe(wallet.material);
      expect(back.wallet.networkId).toBe('btc-mainnet');
    }
  });

  it('round-trips a single address and a descriptor', () => {
    const addr = readPairCode(
      pairCode({ ...wallet, source: 'address', material: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', label: 'Mum' }),
    );
    expect(addr.ok).toBe(true);
    const desc = readPairCode(
      pairCode({ ...wallet, source: 'descriptor', material: 'wsh(sortedmulti(2,[7ef32bdb/48h/0h]xpub6C, [abc/48h]xpub6D))#checksum' }),
    );
    expect(desc.ok).toBe(true);
  });

  it('refuses a seed phrase outright and never echoes it', () => {
    const seed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const r = readPairCode(`SLIP-WALLET-1|Trap|btc|btc-mainnet|xpub|p2wpkh|${seed}`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/private material/);
      expect(r.error).not.toContain('abandon');
    }
  });

  it('refuses to ENCODE a secret even if a caller asks', () => {
    expect(() => pairCode({ ...wallet, material: 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ' })).toThrow();
  });

  it('refuses a label containing the separator', () => {
    expect(() => pairCode({ ...wallet, label: 'Front|Counter' })).toThrow();
  });

  it('refuses a code from somewhere else', () => {
    const r = readPairCode('hello world');
    expect(r.ok).toBe(false);
  });

  it('refuses a truncated code', () => {
    const r = readPairCode('SLIP-WALLET-1|Front counter|btc|btc-mainnet|xpub');
    expect(r.ok).toBe(false);
  });

  it('refuses an unknown network or script type rather than guessing', () => {
    expect(readPairCode(`SLIP-WALLET-1|Shop|btc|mars-mainnet|xpub|p2wpkh|${wallet.material}`).ok).toBe(false);
    expect(readPairCode(`SLIP-WALLET-1|Shop|btc|btc-mainnet|xpub|p2wshmagic|${wallet.material}`).ok).toBe(false);
  });
});
