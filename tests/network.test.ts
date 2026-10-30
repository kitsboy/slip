import { describe, expect, it } from 'vitest';
import {
  ALL_NETWORK_IDS,
  DUST_ATOMS,
  NETWORKS,
  dustFor,
  networkById,
  networksForCoin,
} from '../src/core/network';

describe('network parameters', () => {
  it('has a unique, self-consistent record for every network id', () => {
    expect(new Set(ALL_NETWORK_IDS).size).toBe(ALL_NETWORK_IDS.length);
    for (const id of ALL_NETWORK_IDS) {
      const n = NETWORKS[id];
      expect(n.id).toBe(id);
      expect(n.label.length).toBeGreaterThan(0);
      expect(n.bech32Hrp).toBe(n.bech32Hrp.toLowerCase());
    }
  });

  it('uses the correct Bitcoin mainnet parameters', () => {
    const n = networkById('btc-mainnet');
    expect(n.p2pkhVersion).toBe(0x00); // '1…'
    expect(n.p2shVersion).toBe(0x05); // '3…'
    expect(n.bech32Hrp).toBe('bc');
    expect(n.wifVersion).toBe(0x80);
    expect(n.isTest).toBe(false);
  });

  it('uses the correct Litecoin mainnet parameters', () => {
    const n = networkById('ltc-mainnet');
    expect(n.p2pkhVersion).toBe(0x30); // 'L…'
    expect(n.p2shVersion).toBe(0x32); // 'M…'
    expect(n.bech32Hrp).toBe('ltc');
    expect(n.isTest).toBe(false);
  });

  it('treats every test network as worthless and flags it', () => {
    for (const id of ALL_NETWORK_IDS) {
      const n = NETWORKS[id];
      if (n.id.includes('test') || n.id.includes('signet')) {
        expect(n.isTest).toBe(true);
      } else {
        expect(n.isTest).toBe(false);
      }
    }
  });

  it('knows that signet, testnet3 and testnet4 are encoding-identical', () => {
    // This is the trap the file documents: a `tb1…` address cannot tell you
    // which test network it belongs to, so the merchant must pick explicitly.
    const a = networkById('btc-signet');
    const b = networkById('btc-testnet3');
    const c = networkById('btc-testnet4');
    expect(a.bech32Hrp).toBe(b.bech32Hrp);
    expect(b.bech32Hrp).toBe(c.bech32Hrp);
    expect(a.p2pkhVersion).toBe(c.p2pkhVersion);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('never lets a test network share a bech32 prefix with mainnet', () => {
    const mainnet = networksForCoin('btc').filter((n) => !n.isTest);
    const test = networksForCoin('btc').filter((n) => n.isTest);
    for (const m of mainnet) {
      for (const t of test) expect(t.bech32Hrp).not.toBe(m.bech32Hrp);
    }
  });

  it('groups Litecoin networks separately from Bitcoin', () => {
    expect(networksForCoin('ltc').map((n) => n.id).sort()).toEqual([
      'ltc-mainnet',
      'ltc-testnet',
    ]);
    expect(networksForCoin('btc').every((n) => n.coin === 'btc')).toBe(true);
  });

  it('exposes dust thresholds that match consensus guidance', () => {
    expect(dustFor('p2pkh')).toBe(546);
    expect(dustFor('p2wpkh')).toBe(294);
    expect(dustFor('p2tr')).toBe(330);
    for (const v of Object.values(DUST_ATOMS)) expect(v).toBeGreaterThan(0);
  });
});
