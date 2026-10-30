/**
 * Staff PIN hashing and the hand-off rules.
 *
 * A shop till is handed over several times a day: the owner sets it up, a staff member
 * takes the counter, someone else closes. The PIN is not a wallet key and never becomes
 * one — it gates *who the device says is holding it* and which counter account is active.
 *
 * PBKDF2-SHA256, per-PIN random salt, constant-time compare. Stored as
 * `pbkdf2$<iterations>$<saltB64>$<hashB64>` so the cost can be raised later without
 * invalidating existing PINs.
 */

const ITERATIONS = 200_000;
const KEY_BITS = 256;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error('a PIN is 4 to 8 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** Constant-time comparison — a length-dependent early exit leaks the hash prefix. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  const salt = unb64(parts[2] ?? '');
  const expected = unb64(parts[3] ?? '');
  const actual = await derive(pin, salt, iterations);
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Hand-off rules
// ---------------------------------------------------------------------------

export interface HandoffRequest {
  readonly staffName: string;
  readonly accountId: string;
  /** PIN required when the owner is handing over, or when switching accounts. */
  readonly pin?: string;
}

export type HandoffRejection = { ok: false; reason: string };
export type HandoffAcceptance = { ok: true; staffName: string; accountId: string };

/**
 * Pure validation of a hand-off. Rules:
 *  - a till can only be handed to a NAMED person (anonymous counters make the audit
 *    log meaningless);
 *  - the account must exist and be acknowledged (see `core/accounts`);
 *  - switching away from a live hand-off requires the PIN, so a staff member cannot
 *    quietly reassign the takings to another counter.
 */
export function validateHandoff(
  req: HandoffRequest,
  ctx: {
    accountExists: boolean;
    accountAcknowledged: boolean;
    currentStaff?: string | null;
    pinSet: boolean;
  },
): HandoffAcceptance | HandoffRejection {
  const name = req.staffName.trim();
  if (name.length < 2) return { ok: false, reason: 'name the person taking the till (at least 2 characters)' };
  if (!ctx.accountExists) return { ok: false, reason: 'that counter account does not exist' };
  if (!ctx.accountAcknowledged) {
    return {
      ok: false,
      reason: 'this account has not been checked against your wallet yet — confirm address 0/0 first',
    };
  }

  const switching = Boolean(ctx.currentStaff) && ctx.currentStaff !== name;
  if ((switching || ctx.pinSet) && (!req.pin || !isValidPin(req.pin))) {
    return { ok: false, reason: 'enter the till PIN to hand over this device' };
  }

  return { ok: true, staffName: name, accountId: req.accountId };
}
