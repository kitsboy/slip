/**
 * Bitcoin output descriptors: parse, validate (BIP-380), and derive addresses.
 *
 * Why this file exists: slip's merchant pastes what their wallet exports. For
 * single-sig that is often a bare xpub, but multisig and taproot wallets export
 * a descriptor, and a descriptor carries two things a bare key cannot: the exact
 * derivation path (including hardened account steps that only exist as an
 * *origin*), and the script shape. Guessing either one changes the address.
 *
 * What this parser deliberately does NOT accept:
 *  - Any private material. `assertNotSecret` runs on the whole input and on each
 *    key, and refusals name the *kind* only — a refusal that echoed an xprv would
 *    have written the xprv into a log.
 *  - Hardened steps in the derivable path. A public key cannot derive through
 *    them, and silently dropping such a step would produce a valid-looking
 *    address for a key nobody controls.
 *  - A checksum that does not match. A wrong checksum means the text was edited
 *    (or truncated) after the wallet generated it; deriving anyway can send a
 *    sale to an address the wallet never watches.
 *
 * BIP-380 checksum is implemented from the spec's reference pseudocode and
 * cross-checked against `bitcoin-cli getdescriptorinfo` in tests, never trusted
 * because it agrees with itself.
 */

import { assertNotSecret, parseExtendedKey, SecretRefused } from './keys';
import type { ParsedExtendedKey, PrefixEntry, ScriptType } from './keys';
import { encodeAddress, slipNetwork, sortedMultiWsh } from './derive';
import type { NetworkId } from './network';

// ---------------------------------------------------------------------------
// BIP-380 checksum
// ---------------------------------------------------------------------------

/**
 * The 95-character descriptor alphabet from BIP-380. Note it contains `"`, `\`
 * and a trailing space, so it is written with escapes rather than pasted.
 */
const INPUT_CHARSET =
  '0123456789()[],\'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#"\\ ';

/** Bech32 alphabet — the checksum is rendered as eight characters of it. */
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * BIP-380 generator constants. Kept as BigInt because the chk register is 40
 * bits wide: JS bitwise operators truncate to 32 and would silently corrupt the
 * checksum (which is exactly the sort of "agrees with itself" bug that only
 * shows up when a real wallet rejects the descriptor).
 */
const GENERATOR = [
  0xf5dee51989n,
  0xa9fdca3312n,
  0x1bab10e32dn,
  0x3706b1677an,
  0x644d626ffdn,
] as const;

function polymod(symbols: readonly number[]): bigint {
  let chk = 1n;
  for (const value of symbols) {
    const top = chk >> 35n;
    chk = ((chk & 0x7ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) {
      // Only the five bits shifted out of the register feed the generator.
      if (((top >> BigInt(i)) & 1n) === 1n) chk ^= GENERATOR[i]!;
    }
  }
  return chk;
}

/**
 * Expands a descriptor body into 5-bit symbols. Each input character contributes
 * six bits: five directly, and one high bit buffered into a 3-digit base-9 group,
 * which is what gives BIP-380 its slightly better error detection than bech32's
 * plain 5-bit stream.
 */
function expand(body: string): number[] {
  const symbols: number[] = [];
  let groups: number[] = [];
  let position = 0;
  // Iterating code points rather than UTF-16 units means a non-ASCII character
  // is rejected as one bad character instead of two surrogate halves.
  for (const ch of body) {
    const v = INPUT_CHARSET.indexOf(ch);
    if (v < 0) {
      throw new Error(
        `descriptor contains a character outside the BIP-380 input charset at position ${position}`,
      );
    }
    symbols.push(v & 31);
    groups.push(v >> 5);
    if (groups.length === 3) {
      symbols.push(groups[0]! * 9 + groups[1]! * 3 + groups[2]!);
      groups = [];
    }
    position += 1;
  }
  if (groups.length === 1) symbols.push(groups[0]!);
  if (groups.length === 2) symbols.push(groups[0]! * 3 + groups[1]!);
  return symbols;
}

/**
 * The eight-character checksum for a descriptor body (the text *without* a
 * trailing `#…`). Throws if the body contains a character outside the BIP-380
 * input charset, since such a body could never have come from a wallet.
 */
export function descriptorChecksum(body: string): string {
  const symbols = [...expand(body), 0, 0, 0, 0, 0, 0, 0, 0];
  const mod = polymod(symbols) ^ 1n;
  let out = '';
  for (let i = 0; i < 8; i++) {
    const index = Number((mod >> BigInt(5 * (7 - i))) & 31n);
    out += CHECKSUM_CHARSET[index]!;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type DescriptorScriptType = ScriptType | 'wsh-sortedmulti';

export interface DescriptorKey {
  /** Bare extended public key text, or 66 hex characters for a fixed pubkey. */
  readonly xpub: string;
  /**
   * BIP-380 key origin without its brackets, e.g. `73c5da0a/84'/0'/0'`.
   * `null` when the wallet exported no origin.
   */
  readonly origin: string | null;
  /**
   * Origin fingerprint when one was given, otherwise the parent fingerprint
   * carried by the extended key itself. Never guessed from the key's depth.
   */
  readonly fingerprintHex: string;
}

export interface ParsedDescriptor {
  readonly scriptType: DescriptorScriptType;
  readonly networkId: NetworkId;
  /** `null` when the input had no `#…` suffix. */
  readonly checksum: string | null;
  readonly keys: readonly DescriptorKey[];
  /** Present only for `wsh(sortedmulti(m,…))`. */
  readonly threshold?: number;
  /** Address for one receive index. Fixed descriptors ignore the index. */
  readonly receive: (index: number) => string;
}

export type DescriptorResult =
  | { readonly ok: true; readonly descriptor: ParsedDescriptor }
  | { readonly ok: false; readonly error: string };

// ---------------------------------------------------------------------------
// Structural parsing helpers
// ---------------------------------------------------------------------------

/**
 * Returns the argument text if `body` is exactly one call to `fn`, else null.
 * The depth walk is what stops `sh(wpkh(a),wpkh(b))` from being read as a single
 * nested call: a WSH/SH wrapper must hold one expression, and a loose regex would
 * happily capture `a),wpkh(b`.
 */
function callArgs(body: string, fn: string): string | null {
  const head = `${fn}(`;
  if (!body.startsWith(head) || !body.endsWith(')')) return null;
  const inner = body.slice(head.length, -1);
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) return null;
    }
  }
  return depth === 0 ? inner : null;
}

/** Leading function name, for error text. Never includes the argument payload. */
function functionName(body: string): string | null {
  const m = /^([a-z0-9]+)\(/.exec(body);
  return m ? m[1]! : null;
}

interface KeyPlan {
  readonly info: DescriptorKey;
  /** Numeric steps before the wildcard, in path order. */
  readonly steps: readonly number[];
  readonly wildcard: boolean;
  /** Parsed extended key, or null for a fixed 66-hex pubkey. */
  readonly parsed: ParsedExtendedKey | null;
  /** Fixed pubkey bytes, or null when the key is extended. */
  readonly fixedPubkey: Uint8Array | null;
  readonly entry: PrefixEntry | null;
}

const HEX_PUBKEY = /^[0-9a-fA-F]{66}$/;
const ORIGIN_HEAD = /^[0-9a-fA-F]{8}$/;
const STEP_HARDENED = /^(\d+)['hH]$/;
const KNOWN_FUNCTIONS = new Set(['wpkh', 'pkh', 'sh', 'tr', 'wsh', 'sortedmulti']);
const STEP_NUMERIC = /^(\d+)$/;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Parses `[origin]KEY[/step…]` into a plan. Throws on anything ambiguous — the
 * caller turns throws into `{ok:false}` so no partial descriptor escapes.
 */
function planKey(token: string): KeyPlan {
  let rest = token.trim();
  let origin: string | null = null;
  let originFingerprint: string | null = null;

  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0) throw new Error('key origin is missing its closing bracket');
    const inner = rest.slice(1, close);
    const parts = inner.split('/');
    const fp = parts[0] ?? '';
    if (!ORIGIN_HEAD.test(fp)) {
      throw new Error('key origin must start with an 8-hex-digit master fingerprint');
    }
    // Origin steps are informational: they record hardened steps already taken
    // by the wallet. We only sanity-check their shape, never derive through them.
    for (const step of parts.slice(1)) {
      if (!STEP_NUMERIC.test(step) && !STEP_HARDENED.test(step)) {
        throw new Error(`invalid key origin step "${step}"`);
      }
    }
    originFingerprint = fp.toLowerCase();
    origin = `${originFingerprint}${parts.length > 1 ? `/${parts.slice(1).join('/')}` : ''}`;
    rest = rest.slice(close + 1);
  }

  const parts = rest.split('/');
  const keyText = parts[0] ?? '';
  if (!keyText) throw new Error('descriptor key is empty');

  const stepParts = parts.slice(1);
  const steps: number[] = [];
  let wildcard = false;
  for (let i = 0; i < stepParts.length; i++) {
    const step = stepParts[i]!;
    if (step === '*') {
      if (i !== stepParts.length - 1) {
        throw new Error('the wildcard step (*) must be the last step in the path');
      }
      wildcard = true;
      continue;
    }
    if (STEP_HARDENED.test(step)) {
      // A hardened step after the key would need the private key; accepting it
      // would mean deriving a different (wrong) address without saying so.
      throw new Error(
        'hardened derivation step in the descriptor path: only non-hardened steps can be derived from a public key',
      );
    }
    const num = STEP_NUMERIC.exec(step);
    if (!num) throw new Error(`invalid derivation step "${step}"`);
    const value = Number(num[1]!);
    if (!Number.isSafeInteger(value) || value >= 0x80000000) {
      throw new Error(`derivation step ${step} is out of range`);
    }
    steps.push(value);
  }

  if (HEX_PUBKEY.test(keyText)) {
    const bytes = hexToBytes(keyText);
    if (bytes[0] !== 0x02 && bytes[0] !== 0x03) {
      throw new Error('a fixed descriptor pubkey must be a compressed 33-byte point');
    }
    if (steps.length > 0) {
      throw new Error('a fixed pubkey has no depth to derive from; remove the path after it');
    }
    return {
      info: {
        xpub: keyText.toLowerCase(),
        origin,
        fingerprintHex: originFingerprint ?? keyText.slice(0, 8).toLowerCase(),
      },
      steps,
      wildcard: false,
      parsed: null,
      fixedPubkey: bytes,
      entry: null,
    };
  }

  const parsed = parseExtendedKey(keyText);
  return {
    info: {
      xpub: parsed.text,
      origin,
      fingerprintHex: originFingerprint ?? parsed.fingerprintHex,
    },
    steps,
    wildcard,
    parsed,
    fixedPubkey: null,
    entry: parsed.entry,
  };
}

/**
 * Refuses a key whose network family contradicts the chosen network. This is a
 * hard error, not a warning: a tpub on mainnet derives real-looking mainnet
 * addresses that the merchant's wallet (a testnet wallet) will never watch.
 * The same check cannot be made for the coin, because zpub/vpub are shared
 * between BTC and LTC — that ambiguity belongs to the merchant, not the parser.
 */
function assertKeyNetwork(entry: PrefixEntry | null, networkId: NetworkId): void {
  if (!entry) return;
  const wantsTest = networkId !== 'btc-mainnet' && networkId !== 'ltc-mainnet';
  const isTestKey = entry.family === 'test';
  if (isTestKey === wantsTest) return;
  throw new Error(
    isTestKey
      ? `descriptor key is a test-network key (${entry.prefix}) but the selected network is ${networkId}`
      : `descriptor key is a mainnet key (${entry.prefix}) but the selected network is ${networkId}`,
  );
}

function pubkeyAt(plan: KeyPlan, index: number): Uint8Array {
  if (plan.fixedPubkey) return plan.fixedPubkey;
  if (!plan.parsed) throw new Error('descriptor key has no material to derive from');
  let node = plan.parsed.node;
  for (const step of plan.steps) node = node.deriveChild(step);
  if (plan.wildcard) node = node.deriveChild(index);
  const pub = node.publicKey;
  if (!pub) throw new Error('derivation produced no public key');
  return pub;
}

function requireIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error(`invalid derivation index: ${String(index)}`);
  }
}

/** Splits `sortedmulti(m,key,key,…)` into its threshold and key tokens. */
function parseSortedMulti(args: string): { threshold: number; keys: string[] } {
  const parts = args.split(',');
  if (parts.length < 2) {
    throw new Error('sortedmulti needs a threshold and at least one key');
  }
  const head = parts[0]!.trim();
  if (!/^\d+$/.test(head)) throw new Error('sortedmulti threshold must be a decimal number');
  const threshold = Number(head);
  const keys = parts.slice(1).map((k) => k.trim());
  if (keys.some((k) => k.length === 0)) throw new Error('sortedmulti has an empty key');
  if (threshold < 1) throw new Error('sortedmulti threshold must be at least 1');
  if (threshold > keys.length) {
    throw new Error(`sortedmulti threshold ${threshold} exceeds its ${keys.length} keys`);
  }
  return { threshold, keys };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Parses a descriptor for a specific network and returns a `receive(index)`
 * function. Never throws: every failure becomes `{ok:false, error}` so the UI can
 * show a reason without a try/catch, and so no half-built descriptor can leak.
 */
export function parseDescriptor(raw: string, networkId: NetworkId): DescriptorResult {
  try {
    // Whole-input refusal first: a bare mnemonic is caught here, before any
    // grammar parsing can produce a confusing "unknown function" message.
    assertNotSecret(raw);

    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: 'descriptor is empty' };

    let body = trimmed;
    let checksum: string | null = null;
    const hashAt = trimmed.indexOf('#');
    if (hashAt >= 0) {
      body = trimmed.slice(0, hashAt);
      const supplied = trimmed.slice(hashAt + 1);
      if (supplied.length !== 8 || ![...supplied].every((c) => CHECKSUM_CHARSET.includes(c))) {
        return {
          ok: false,
          error: 'descriptor checksum must be 8 characters from the BIP-380 checksum charset',
        };
      }
      // Throws on a body outside the input charset, which the catch turns into
      // an error — a body we cannot checksum is a body we will not derive from.
      if (descriptorChecksum(body) !== supplied) {
        return { ok: false, error: 'descriptor checksum does not match' };
      }
      checksum = supplied;
    }

    const built = buildDescriptor(body, networkId, checksum);
    return { ok: true, descriptor: built };
  } catch (e) {
    if (e instanceof SecretRefused) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : 'descriptor could not be parsed' };
  }
}

function buildDescriptor(
  body: string,
  networkId: NetworkId,
  checksum: string | null,
): ParsedDescriptor {
  const net = slipNetwork(networkId);

  const single = (args: string, scriptType: ScriptType): ParsedDescriptor => {
    const plan = planKey(args);
    assertKeyNetwork(plan.entry, networkId);
    return {
      scriptType,
      networkId,
      checksum,
      keys: [plan.info],
      receive: (index) => {
        requireIndex(index);
        // derive.ts owns encoding: p2sh(p2wpkh(…)) nesting and the BIP-341
        // taproot tweak are pinned there against official vectors and Core.
        return encodeAddress(pubkeyAt(plan, index), scriptType, net);
      },
    };
  };

  // Misspelt or unsupported functions get one message naming what we do accept,
  // so the merchant is not left guessing which wallet export to use.
  const unsupported = (): never => {
    const fn = functionName(body);
    if (fn && KNOWN_FUNCTIONS.has(fn)) {
      // A recognised name that still failed every shape is either unbalanced or
      // nested in a way we do not accept; say so rather than pretend the name
      // itself is the problem.
      throw new Error(`descriptor is malformed: ${fn}() is not balanced or is nested unsupported`);
    }
    throw new Error(
      fn
        ? `unsupported descriptor function "${fn}" — slip accepts wpkh, pkh, sh(wpkh), tr and wsh(sortedmulti)`
        : 'not a descriptor: expected a function call such as wpkh(...)',
    );
  };

  const wpkhArgs = callArgs(body, 'wpkh');
  if (wpkhArgs !== null) return single(wpkhArgs, 'p2wpkh');

  const pkhArgs = callArgs(body, 'pkh');
  if (pkhArgs !== null) return single(pkhArgs, 'p2pkh');

  const trArgs = callArgs(body, 'tr');
  if (trArgs !== null) {
    // Only the key-path form is accepted: a script tree changes the tweak, and
    // silently ignoring it would derive the wrong output key.
    if (trArgs.includes('{')) {
      throw new Error('tr() script trees are not supported — slip accepts key-path taproot only');
    }
    return single(trArgs, 'p2tr');
  }

  const shArgs = callArgs(body, 'sh');
  if (shArgs !== null) {
    const inner = callArgs(shArgs, 'wpkh');
    if (inner === null) {
      throw new Error('sh() must wrap exactly one wpkh() — sh(wpkh(xpub…/0/*))');
    }
    return single(inner, 'p2sh-p2wpkh');
  }

  const wshArgs = callArgs(body, 'wsh');
  if (wshArgs !== null) {
    const sortedArgs = callArgs(wshArgs, 'sortedmulti');
    if (sortedArgs === null) {
      throw new Error('wsh() must wrap exactly one sortedmulti(m,key,…) in slip');
    }
    const { threshold, keys } = parseSortedMulti(sortedArgs);
    const plans = keys.map(planKey);
    for (const plan of plans) assertKeyNetwork(plan.entry, networkId);
    return {
      scriptType: 'wsh-sortedmulti',
      networkId,
      checksum,
      keys: plans.map((p) => p.info),
      threshold,
      receive: (index) => {
        requireIndex(index);
        // BIP-67 ordering lives in derive.ts; the parser only supplies the keys
        // for this index, so the sort cannot drift from the verified encoder.
        const pubs = plans.map((p) => pubkeyAt(p, index));
        return sortedMultiWsh(pubs, threshold, net);
      },
    };
  }

  return unsupported();
}
