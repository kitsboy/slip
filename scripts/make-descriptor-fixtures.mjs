#!/usr/bin/env node
/**
 * Generates tests/vectors/descriptors.json using **Bitcoin Core itself** as the
 * reference oracle (`getdescriptorinfo` for the checksum, `deriveaddresses` for
 * the addresses).
 *
 * Why: a BIP-380 checksum implementation that only agrees with itself is not
 * verified. Core computes the checksum and the addresses for the exact same
 * descriptor text, so a match proves the parser, the checksum and the per-index
 * derivation are interoperable rather than merely self-consistent.
 *
 * Test keys come from the public BIP-39 test mnemonic ("abandon … about"). This
 * is a FIXTURE GENERATOR, not app code — the app itself never sees a seed.
 *
 * Usage: node scripts/make-descriptor-fixtures.mjs
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const seed = mnemonicToSeedSync(MNEMONIC, '');
const root = HDKey.fromMasterSeed(seed);
const fingerprint = root.fingerprint.toString(16).padStart(8, '0');

function accountNode(path) {
  const node = root.derive(path);
  if (!node.publicExtendedKey) throw new Error(`no xpub at ${path}`);
  return node;
}

function account(path) {
  return accountNode(path).publicExtendedKey;
}

function pubkey(path) {
  const pub = accountNode(path).publicKey;
  if (!pub) throw new Error(`no public key at ${path}`);
  return Buffer.from(pub).toString('hex');
}

function core(...args) {
  return JSON.parse(execFileSync('bitcoin-cli', args, { encoding: 'utf8' }));
}

const accts = {
  bip84: { path: "m/84'/0'/0'", xpub: account("m/84'/0'/0'") },
  bip86: { path: "m/86'/0'/0'", xpub: account("m/86'/0'/0'") },
  bip44: { path: "m/44'/0'/0'", xpub: account("m/44'/0'/0'") },
  bip49: { path: "m/49'/0'/0'", xpub: account("m/49'/0'/0'") },
  multiA: { path: "m/48'/0'/0'/2'", xpub: account("m/48'/0'/0'/2'") },
  multiB: { path: "m/48'/0'/1'/2'", xpub: account("m/48'/0'/1'/2'") },
  multiC: { path: "m/48'/0'/2'/2'", xpub: account("m/48'/0'/2'/2'") },
};

const fixedKeys = [
  pubkey("m/44'/0'/0'"),
  pubkey("m/49'/0'/0'"),
  pubkey("m/84'/0'/0'"),
];

const CASES = [
  {
    id: 'wpkh',
    scriptType: 'p2wpkh',
    descriptor: `wpkh(${accts.bip84.xpub}/0/*)`,
    range: '[0,4]',
  },
  {
    id: 'wpkh-origin',
    scriptType: 'p2wpkh',
    descriptor: `wpkh([${fingerprint}/84'/0'/0']${accts.bip84.xpub}/0/*)`,
    range: '[0,4]',
  },
  {
    id: 'pkh',
    scriptType: 'p2pkh',
    descriptor: `pkh(${accts.bip44.xpub}/0/*)`,
    range: '[0,4]',
  },
  {
    id: 'sh-wpkh',
    scriptType: 'p2sh-p2wpkh',
    descriptor: `sh(wpkh(${accts.bip49.xpub}/0/*))`,
    range: '[0,4]',
  },
  {
    id: 'tr',
    scriptType: 'p2tr',
    descriptor: `tr(${accts.bip86.xpub}/0/*)`,
    range: '[0,4]',
  },
  {
    id: 'sortedmulti-2of3',
    scriptType: 'wsh-sortedmulti',
    descriptor: `wsh(sortedmulti(2,${accts.multiA.xpub}/0/*,${accts.multiB.xpub}/0/*,${accts.multiC.xpub}/0/*))`,
    range: '[0,4]',
  },
  {
    // Non-range descriptor: fixed compressed pubkeys, so every index must yield
    // the same address. Core returns exactly one address for it.
    id: 'sortedmulti-fixed',
    scriptType: 'wsh-sortedmulti',
    descriptor: `wsh(sortedmulti(2,${fixedKeys.join(',')}))`,
    range: null,
  },
];

const fixtures = {
  generatedBy: 'bitcoin-cli getdescriptorinfo + deriveaddresses (Bitcoin Core v28)',
  fingerprint,
  cases: [],
};

for (const c of CASES) {
  try {
    const info = core('getdescriptorinfo', c.descriptor);
    const withChecksum = info.descriptor;
    const body = withChecksum.slice(0, withChecksum.lastIndexOf('#'));
    // Core refuses bare descriptors for tr()/wsh(); always pass the checksummed form.
    const addresses = c.range
      ? core('deriveaddresses', withChecksum, c.range)
      : core('deriveaddresses', withChecksum);
    fixtures.cases.push({
      id: c.id,
      scriptType: c.scriptType,
      body,
      checksum: info.checksum,
      descriptor: withChecksum,
      addresses,
    });
    console.log(`${c.id}: ${info.checksum}, ${addresses.length} address(es)`);
  } catch (e) {
    console.error(`FAILED ${c.id}: ${e.message}`);
    process.exitCode = 1;
  }
}

fixtures.accounts = Object.fromEntries(
  Object.entries(accts).map(([k, v]) => [k, { path: v.path, xpub: v.xpub }]),
);
fixtures.fixedPubkeys = fixedKeys;

mkdirSync('tests/vectors', { recursive: true });
writeFileSync('tests/vectors/descriptors.json', JSON.stringify(fixtures, null, 2) + '\n');
console.log('wrote tests/vectors/descriptors.json');
