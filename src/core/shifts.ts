/**
 * Shift log — who held which counter, and when.
 *
 * A shop passes the till between staff several times a day, and each counter is its
 * own watch-only wallet account. The owner wants a record of that, and there is no
 * server to keep it on. So this is an append-only, hash-chained log held on the
 * device: every event commits to the previous event's hash, so a later edit cannot
 * be hidden without breaking every link after it.
 *
 * WHAT THIS IS: tamper-EVIDENT. Anyone can run `verifyLog` and see that an entry was
 * changed, removed or reordered, and exactly where the chain first fails.
 *
 * WHAT THIS IS NOT: tamper-PROOF. Whoever controls the device can delete entries from
 * the end, or rewrite every hash from the point of change onward and produce a log
 * that verifies cleanly. There is no signature here and no external witness, so
 * verification proves internal consistency — not that the sequence actually happened.
 *
 * No money moves through this file. It only records custody of a counter.
 */

export const GENESIS_HASH = '0'.repeat(64);

export type ShiftEventKind =
  | 'open'
  | 'handoff'
  | 'return'
  | 'acknowledge'
  | 'pin-set'
  | 'account-added';

/** The order the day sheet prints in; also the set of kinds this log accepts. */
export const SHIFT_EVENT_KINDS: readonly ShiftEventKind[] = [
  'open',
  'handoff',
  'return',
  'acknowledge',
  'pin-set',
  'account-added',
];

export interface ShiftEvent {
  readonly seq: number;
  /** ISO 8601 timestamp, supplied by the caller so a log can be rebuilt exactly. */
  readonly at: string;
  readonly kind: ShiftEventKind;
  readonly accountId: string | null;
  readonly accountLabel: string | null;
  readonly staff: string | null;
  readonly detail?: string;
  readonly prevHash: string;
  readonly hash: string;
}

export interface ShiftLog {
  readonly version: 1;
  readonly events: ShiftEvent[];
}

export interface ShiftEventInput {
  readonly kind: ShiftEventKind;
  readonly accountId: string | null;
  readonly accountLabel: string | null;
  readonly staff: string | null;
  readonly detail?: string;
  /** ISO timestamp. Defaults to now; tests pass it explicitly for determinism. */
  readonly at?: string;
}

/** The part of an event that is hashed: everything but the hash itself. */
type HashedEvent = Omit<ShiftEvent, 'hash'>;

// ---------------------------------------------------------------------------
// Canonical encoding
// ---------------------------------------------------------------------------

/**
 * JSON with object keys sorted at every depth, so the same event always produces the
 * same bytes regardless of property order or which engine serialised it. `undefined`
 * values are dropped (they carry no information) and `null` is kept (it means "no
 * account / no staff", which does).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const inner = record[key];
      if (inner === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalJson(inner)}`);
    }
    return `{${parts.join(',')}}`;
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  // Functions, symbols and bigints are never part of an event; refuse rather than
  // silently encode something ambiguous.
  throw new Error(`cannot canonicalise a ${typeof value} value`);
}

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * SHA-256 over `prevHash` + the canonical event. Chromium, WebViews and Node all
 * expose the same `crypto.subtle` API, so this needs no dependency and no Node-only
 * import — the same code runs in the built single-file app and under vitest.
 */
export async function computeEventHash(prevHash: string, payload: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is unavailable in this context; cannot hash the shift log');
  }
  const material = new TextEncoder().encode(`${prevHash}\n${canonicalJson(payload)}`);
  const digest = await subtle.digest('SHA-256', material);
  return toHex(digest);
}

// ---------------------------------------------------------------------------
// Appending
// ---------------------------------------------------------------------------

export function emptyLog(): ShiftLog {
  return { version: 1, events: [] };
}

export function lastEvent(log: ShiftLog): ShiftEvent | null {
  return log.events.length === 0 ? null : (log.events[log.events.length - 1] ?? null);
}

/**
 * Returns a NEW log with one event chained onto the end. The input log is never
 * mutated: there is no in-place append anywhere in this module, so a caller can hold
 * the previous state, compare two states, or discard a failed write.
 */
export async function appendEvent(log: ShiftLog, input: ShiftEventInput): Promise<ShiftLog> {
  if (!SHIFT_EVENT_KINDS.includes(input.kind)) {
    throw new Error(`unknown shift event kind: ${String(input.kind)}`);
  }

  const previous = lastEvent(log);
  const prevHash = previous?.hash ?? GENESIS_HASH;
  const body: HashedEvent = {
    seq: previous ? previous.seq + 1 : 0,
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    accountId: input.accountId,
    accountLabel: input.accountLabel,
    staff: input.staff,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    prevHash,
  };
  const hash = await computeEventHash(prevHash, body);

  return { version: 1, events: [...log.events, { ...body, hash }] };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerificationResult {
  readonly ok: boolean;
  /** Index of the first event that fails, or null when the whole log verifies. */
  readonly brokenAt: number | null;
  readonly reason?: string;
}

/**
 * Recomputes every hash and checks seq continuity plus prevHash linkage, reporting the
 * FIRST failure and stopping there — in a hash chain everything after the first break
 * is suspect anyway, and naming the earliest bad index is what makes the report
 * actionable.
 *
 * A clean result means the log is internally consistent. It does NOT prove the events
 * happened: see the file header. A whole-chain rewrite verifies perfectly.
 */
export async function verifyLog(log: ShiftLog): Promise<VerificationResult> {
  let expectedHash = GENESIS_HASH;

  for (let index = 0; index < log.events.length; index += 1) {
    const event = log.events[index];
    if (!event) {
      return { ok: false, brokenAt: index, reason: 'event is missing from the array' };
    }

    if (event.seq !== index) {
      return {
        ok: false,
        brokenAt: index,
        reason: `expected seq ${index} but found ${event.seq}`,
      };
    }

    if (event.prevHash !== expectedHash) {
      return {
        ok: false,
        brokenAt: index,
        reason:
          index === 0
            ? 'first event does not start from the genesis hash'
            : `event ${index} does not link to event ${index - 1}`,
      };
    }

    const body: HashedEvent = {
      seq: event.seq,
      at: event.at,
      kind: event.kind,
      accountId: event.accountId,
      accountLabel: event.accountLabel,
      staff: event.staff,
      ...(event.detail === undefined ? {} : { detail: event.detail }),
      prevHash: event.prevHash,
    };

    let recomputed: string;
    try {
      recomputed = await computeEventHash(event.prevHash, body);
    } catch (e) {
      return {
        ok: false,
        brokenAt: index,
        reason: e instanceof Error ? e.message : 'could not hash this event',
      };
    }

    if (recomputed !== event.hash) {
      return {
        ok: false,
        brokenAt: index,
        reason: `event ${index} was altered after it was written`,
      };
    }

    expectedHash = event.hash;
  }

  return { ok: true, brokenAt: null };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function eventsForAccount(log: ShiftLog, accountId: string): ShiftEvent[] {
  return log.events.filter((event) => event.accountId === accountId);
}

export interface StaffShift {
  readonly staff: string;
  readonly accountLabel: string;
  readonly startedAt: string;
  /** null when the counter was never handed back — the shift is still open. */
  readonly endedAt: string | null;
  readonly events: number;
}

/**
 * Pairs each 'handoff' with the next 'return' for the same account, in log order. A
 * handoff with no return before the next handoff (or before the end of the log) stays
 * open with `endedAt: null` rather than borrowing a later shift's return.
 */
export function staffSummary(log: ShiftLog): StaffShift[] {
  const shifts: StaffShift[] = [];

  log.events.forEach((event, index) => {
    // 'open' is a shift starting on its own — the first person in, with nobody to take over from.
    if (event.kind !== 'handoff' && event.kind !== 'open') return;

    let end: ShiftEvent | null = null;
    let nextHandoffAt = log.events.length;

    for (let cursor = index + 1; cursor < log.events.length; cursor += 1) {
      const candidate = log.events[cursor];
      if (!candidate || candidate.accountId !== event.accountId) continue;
      if (candidate.kind === 'handoff' || candidate.kind === 'open') {
        nextHandoffAt = cursor;
        break;
      }
      if (candidate.kind === 'return') {
        end = candidate;
        break;
      }
    }

    const stop = end ? log.events.indexOf(end) : nextHandoffAt;
    const span = log.events
      .slice(index, stop + 1)
      .filter((e) => e.accountId === event.accountId).length;

    shifts.push({
      staff: event.staff ?? 'unassigned',
      accountLabel: event.accountLabel ?? 'unknown counter',
      startedAt: event.at,
      endedAt: end ? end.at : null,
      events: span,
    });
  });

  return shifts;
}

// ---------------------------------------------------------------------------
// Day sheet
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<ShiftEventKind, string> = {
  open: 'OPEN',
  handoff: 'HANDOFF',
  return: 'RETURN',
  acknowledge: 'ACKNOWLEDGE',
  'pin-set': 'PIN-SET',
  'account-added': 'ACCOUNT-ADDED',
};

/** `2026-10-30T14:02:11.000Z` → `2026-10-30 14:02` (UTC, as written). */
function stampOf(at: string): string {
  return at.replace('T', ' ').slice(0, 16);
}

/**
 * One plain line per event for a printed day sheet, e.g.
 *
 *   2026-10-30 14:02  HANDOFF      Ana  Front counter  #3 a1b2c3d4
 *
 * The trailing eight hex characters are the front of the event hash: enough for a
 * human to spot a line that does not belong, and for a reader to check one line
 * against `verifyLog`. No line contains a newline, so the array maps straight onto
 * printed rows.
 */
export function exportLogLines(log: ShiftLog): string[] {
  return log.events.map((event) => {
    const fields = [
      stampOf(event.at),
      KIND_LABEL[event.kind].padEnd(13),
      event.staff ?? '—',
      event.accountLabel ?? '—',
      `#${event.seq} ${event.hash.slice(0, 8)}`,
    ];
    return fields.join('  ');
  });
}
