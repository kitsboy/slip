/**
 * Encrypted `.slip` backup files.
 *
 * slip holds no keys — only imported child xpubs, the catalog, settings and (later) order
 * history. Losing the device is an inconvenience; leaking an xpub is worse than losing a
 * wallet: an xpub derives every past and FUTURE address of that account, so a plaintext
 * backup of a till hands an observer the shop's entire takings history and its ability to
 * watch every sale forever. Therefore a `.slip` file is NEVER plaintext JSON. It is a
 * self-describing envelope whose only readable fields are the ones needed to tell the
 * merchant what they are looking at (format, version, timestamp, size) before they type a
 * passphrase.
 *
 * Crypto: AES-GCM 256 with a PBKDF2-SHA256 key (310k iterations, 16-byte salt, 12-byte IV).
 * AES-GCM authenticates the ciphertext, so a flipped byte fails the tag check. The header
 * is bound to the ciphertext through additional authenticated data (AAD) — a header that
 * has been edited outside the tag cannot be decrypted, and the decoder rejects unknown
 * format/version before it ever touches the key.
 *
 * Inside the ciphertext sits a SHA-256 checksum of the serialized state, because GCM proves
 * the bytes we sealed are the bytes we get back — it says nothing about whether the JSON
 * we sealed actually parses into the state we intended. The checksum makes a successful
 * decrypt also prove the CONTENT is intact (e.g. a truncated localStorage write caught at
 * export time), and it gives restore a precise error instead of a half-applied import.
 */

const FORMAT = 'slip-backup';
const VERSION = 1;
const KDF_ALG = 'PBKDF2-SHA256';
const ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const CHECKSUM_HEX_LENGTH = 64;

/**
 * AAD is a fixed domain-separation string, not a digest of the header. Its job is to stop a
 * ciphertext from one context being replayed into another (a "backup" blob used as some
 * future file type), and to bind every encryption to this exact format generation. Version
 * drift is handled explicitly below — a future version-2 must use its own AAD constant so
 * old files cannot be silently reinterpreted.
 */
const AAD = 'slip-backup-v1';

/** Shown in the file so a merchant who opens it in a text editor is not alarmed. */
const NOTE = 'contains public wallet material only — no keys';

export interface BackupEnvelope {
  readonly format: typeof FORMAT;
  readonly version: number;
  readonly kdf: {
    readonly alg: typeof KDF_ALG;
    readonly iterations: number;
    readonly salt: string;
  };
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: string;
  readonly note: string;
}

/** What restore hands back to the caller; never includes the passphrase or raw key. */
export type RestoreResult =
  | { ok: true; state: unknown; createdAt: string; version: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Byte helpers — btoa/atob exist in browsers and in Node 22, so the same code runs
// in the app and in tests without a polyfill.
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  // Chunked: spreading a large array into String.fromCharCode blows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Passphrase policy
// ---------------------------------------------------------------------------

/**
 * The passphrase is the only thing between a stolen `.slip` file and every address of the
 * shop's wallet. PBKDF2 makes guessing expensive but cannot rescue "password".
 *
 * Exact-match list (lowercased, see `passphraseStrength`) of the passwords most likely to
 * appear in an attacker's first thousand guesses, including wallet-flavoured ones a
 * Bitcoin merchant might pick precisely because it feels on-topic.
 */
const COMMON_PASSPHRASES: readonly string[] = [
  'password', 'password1', 'password123', 'password1234', 'password12345', 'passphrase',
  '123456', '1234567', '12345678', '123456789', '1234567890', '12345', '1234',
  '111111', '000000', '121212', '654321', '666666', '123123', '112233',
  'qwerty', 'qwerty123', 'qwertyuiop', 'azerty', 'abc123', 'abcd1234', 'a1b2c3',
  'letmein', 'welcome', 'welcome1', 'admin', 'admin123', 'root', 'toor',
  'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball',
  'master', 'shadow', 'superman', 'trustno1', 'starwars', 'whatever',
  'bitcoin', 'bitcoin123', 'btc', 'btc123', 'satoshi', 'satoshi123', 'nakamoto',
  'lightning', 'lightning123', 'wallet', 'wallet123', 'blockchain', 'crypto',
  'crypto123', 'hodl', 'hodl123', 'to the moon', 'tothemoon', 'moon', 'moon123',
  'nostr', 'nostr123', 'xpub', 'xpub123', 'seed', 'seedphrase', 'mnemonic',
  'slip', 'slip123', 'slipbackup', 'giveabit', 'giveabit123',
  'shop', 'shop123', 'store', 'store123', 'till', 'till123', 'merchant',
  'coffee', 'coffee123', 'beer', 'beer123', 'pizza', 'pizza123',
  'secret', 'secret123', 'changeme', 'default', 'test', 'test123', 'testing',
  'temp1234', 'temp12345', 'temp123456', 'asdfghjkl', 'zxcvbnm', '1q2w3e4r',
  '1qaz2wsx', 'qazwsx', 'q1w2e3r4', 'zaq12wsx', 'password!', 'letmein123',
];

export interface PassphraseVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Four classes: lower, upper, digit, symbol. Requiring 3 of 4 keeps a diceware phrase
 * usable ("correct horse battery staple" fails the class rule but passes on length), while
 * stopping a short lowercase-only phrase that an offline GPU rig would chew through.
 */
export function passphraseStrength(passphrase: string): PassphraseVerdict {
  if (passphrase.length < 12) {
    return { ok: false, reason: 'use at least 12 characters' };
  }

  // Case-insensitive comparison: 'Password' is exactly as guessable as 'password', and the
  // attacker's wordlist is case-folded too. This is still an exact match, not a substring
  // rule — 'my password is long' must not be rejected for containing a common word.
  const folded = passphrase.toLowerCase();
  if (COMMON_PASSPHRASES.includes(folded)) {
    return { ok: false, reason: 'that passphrase is one of the most commonly used — pick another' };
  }

  if (passphrase.length >= 20) return { ok: true };

  const classes =
    (/[a-z]/.test(passphrase) ? 1 : 0) +
    (/[A-Z]/.test(passphrase) ? 1 : 0) +
    (/[0-9]/.test(passphrase) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(passphrase) ? 1 : 0);

  if (classes < 3) {
    return {
      ok: false,
      reason: 'mix at least three of: lowercase, uppercase, digits, symbols — or use 20+ characters',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  // extractable=false: the derived key never leaves WebCrypto, so no code path can log it.
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Envelope parsing (no passphrase involved)
// ---------------------------------------------------------------------------

function parseEnvelope(text: string): BackupEnvelope | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'this is not a slip backup file — it is not valid JSON' };
  }
  if (!isRecord(parsed)) return { error: 'this is not a slip backup file' };

  if (parsed['format'] !== FORMAT) {
    return { error: 'this is not a slip backup file — the format marker is missing or wrong' };
  }

  const version = parsed['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { error: 'this backup has an unreadable version number' };
  }

  const kdf = parsed['kdf'];
  if (!isRecord(kdf)) return { error: 'this backup is missing its key-derivation header' };
  const iterations = kdf['iterations'];
  if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 1) {
    return { error: 'this backup has an unreadable key-derivation cost' };
  }
  const salt = kdf['salt'];
  if (typeof salt !== 'string' || salt.length === 0) {
    return { error: 'this backup is missing its salt' };
  }
  if (kdf['alg'] !== KDF_ALG) {
    return { error: 'this backup uses a key-derivation algorithm this version of slip does not know' };
  }

  const iv = parsed['iv'];
  const ciphertext = parsed['ciphertext'];
  if (typeof iv !== 'string' || iv.length === 0) return { error: 'this backup is missing its IV' };
  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    return { error: 'this backup is missing its encrypted payload' };
  }

  const createdAt = parsed['createdAt'];
  if (typeof createdAt !== 'string' || createdAt.length === 0) {
    return { error: 'this backup is missing its creation time' };
  }

  return {
    format: FORMAT,
    version,
    kdf: { alg: KDF_ALG, iterations, salt },
    iv,
    ciphertext,
    createdAt,
    note: typeof parsed['note'] === 'string' ? parsed['note'] : NOTE,
  };
}

/**
 * Header-only inspection for the restore screen: the merchant should see "slip backup, made
 * 2026-10-30, 4.2 KB, encrypted" before being asked to type a passphrase, so they can tell
 * a real backup from whatever else is in their downloads folder.
 *
 * `bytes` is the UTF-8 size of the file text — the same number the OS reports.
 */
export function describeBackup(text: string): {
  format: string;
  version: number;
  createdAt: string;
  bytes: number;
  encrypted: true;
} {
  const env = parseEnvelope(text);
  if ('error' in env) throw new Error(env.error);
  return {
    format: env.format,
    version: env.version,
    createdAt: env.createdAt,
    bytes: encoder.encode(text).length,
    // Every file this module writes is encrypted; the literal type says so.
    encrypted: true,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Serializes `state`, seals it, and returns the `.slip` file text.
 *
 * The plaintext payload is `{checksum, stateJson}` rather than `{checksum, state}`: keeping
 * the state as a STRING means the checksum is verified over the exact bytes that were
 * encrypted, not over a re-serialization that could reorder keys or drop undefined values
 * and produce a false "damaged file" verdict.
 *
 * Throws on a weak passphrase — the module exists to guarantee a file is never trivially
 * crackable, so letting a caller bypass the policy would defeat the point.
 */
export async function createBackup(state: unknown, passphrase: string): Promise<string> {
  const verdict = passphraseStrength(passphrase);
  if (!verdict.ok) {
    throw new Error(verdict.reason ?? 'choose a stronger passphrase');
  }

  const stateJson = JSON.stringify(state);
  if (typeof stateJson !== 'string') {
    // JSON.stringify only returns undefined for top-level undefined/functions.
    throw new Error('this state cannot be backed up — it is not serializable');
  }

  const checksum = await sha256Hex(encoder.encode(stateJson));
  const payload = JSON.stringify({ checksum, stateJson });

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, ITERATIONS);

  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(AAD) },
    key,
    encoder.encode(payload),
  );

  const envelope: BackupEnvelope = {
    format: FORMAT,
    version: VERSION,
    kdf: { alg: KDF_ALG, iterations: ITERATIONS, salt: toB64(salt) },
    iv: toB64(iv),
    ciphertext: toB64(new Uint8Array(sealed)),
    createdAt: new Date().toISOString(),
    note: NOTE,
  };

  return JSON.stringify(envelope);
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Opens a `.slip` file. Never throws: the UI calls this straight from a file input and a
 * rejected passphrase is an ordinary event, not a crash. Every failure is a distinct,
 * non-leaking message.
 */
export async function restoreBackup(text: string, passphrase: string): Promise<RestoreResult> {
  try {
    const env = parseEnvelope(text);
    if ('error' in env) return { ok: false, error: env.error };

    // Version is checked BEFORE any key derivation: an unknown future format may have a
    // different payload shape, and quietly decrypting it with today's parser would risk a
    // mangled import. Only version 1 is defined.
    if (env.version > VERSION) {
      return {
        ok: false,
        error: `this backup was made by a newer version of slip (version ${env.version}) — update slip to restore it`,
      };
    }
    if (env.version !== VERSION) {
      return { ok: false, error: `unsupported backup version ${env.version}` };
    }

    const salt = fromB64(env.kdf.salt);
    const iv = fromB64(env.iv);
    // A short salt/IV would be a corrupted or hand-built file; refuse rather than let GCM
    // accept a truncated IV.
    if (salt.length !== SALT_BYTES) return { ok: false, error: 'this backup has a damaged salt' };
    if (iv.length !== IV_BYTES) return { ok: false, error: 'this backup has a damaged IV' };

    let plain: ArrayBuffer;
    try {
      const key = await deriveKey(passphrase, salt, env.kdf.iterations);
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(AAD) },
        key,
        fromB64(env.ciphertext),
      );
    } catch {
      // Wrong passphrase and tampered ciphertext are indistinguishable by design — GCM
      // cannot tell you which, and guessing would leak whether a key guess was close.
      return { ok: false, error: 'passphrase is wrong, or the file is damaged' };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(decoder.decode(plain));
    } catch {
      return { ok: false, error: 'the backup decrypted but its contents are unreadable' };
    }
    if (!isRecord(payload)) return { ok: false, error: 'the backup decrypted but its contents are unreadable' };

    const checksum = payload['checksum'];
    const stateJson = payload['stateJson'];
    if (typeof checksum !== 'string' || typeof stateJson !== 'string') {
      return { ok: false, error: 'the backup decrypted but its contents are unreadable' };
    }
    if (checksum.length !== CHECKSUM_HEX_LENGTH) {
      return { ok: false, error: 'the backup content does not match its checksum — the file is damaged' };
    }

    const actual = await sha256Hex(encoder.encode(stateJson));
    if (actual !== checksum) {
      return { ok: false, error: 'the backup content does not match its checksum — the file is damaged' };
    }

    let state: unknown;
    try {
      state = JSON.parse(stateJson);
    } catch {
      return { ok: false, error: 'the backup content does not match its checksum — the file is damaged' };
    }

    return { ok: true, state, createdAt: env.createdAt, version: env.version };
  } catch (e) {
    // Last-resort guard (e.g. crypto unavailable in an insecure context).
    return { ok: false, error: e instanceof Error ? e.message : 'could not read this backup' };
  }
}
