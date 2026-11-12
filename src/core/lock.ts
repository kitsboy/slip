/**
 * The till lock — a curtain, not a vault.
 *
 * This does not encrypt anything. The books are in this browser's storage, and anyone who can open
 * the browser's own tools can read them. What a PIN buys is the ordinary, useful thing: someone who
 * picks up the phone at the counter cannot open the till and read the day's takings.
 *
 * The PIN is never stored. A random salt and a PBKDF2 hash of the PIN are, which is enough to check
 * a PIN and not enough to recover one. A forgotten PIN is recovered the only honest way: the backup
 * file, or a wiped device.
 */

const ITERATIONS = 120_000;
const KEY_BITS = 256;

/** A PIN is 4 to 8 digits. Anything else is refused before it can be hashed. */
export function sanitizePin(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '');
  return /^\d{4,8}$/.test(digits) ? digits : null;
}

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

async function derive(pin: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return hex(new Uint8Array(bits));
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  return derive(pin, saltHex);
}

/**
 * Compare in a time that does not depend on how many digits match. The attack this closes — timing
 * a hash comparison — is remote and impractical here, but it costs nothing to close it.
 */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, saltHex: string, hashHex: string): Promise<boolean> {
  const clean = sanitizePin(pin);
  if (!clean) return false;
  return equal(await derive(clean, saltHex), hashHex);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** How long the till may sit untouched before it locks itself. `null` means never. */
export const LOCK_CHOICES: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 1, label: 'after 1 minute' },
  { minutes: 5, label: 'after 5 minutes' },
  { minutes: 10, label: 'after 10 minutes' },
  { minutes: 30, label: 'after 30 minutes' },
  { minutes: 0, label: 'never — lock it by hand' },
];

export function lockAfterLabel(minutes: number): string {
  const found = LOCK_CHOICES.find((c) => c.minutes === minutes);
  return found ? found.label : `after ${minutes} minutes`;
}

/** The event Settings fires so the shell can lock without owning the PIN state. */
export const LOCK_NOW_EVENT = 'slip:lock-now';
