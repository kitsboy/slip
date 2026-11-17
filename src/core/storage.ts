/** Real and demo drawers never share keys. Failed writes live in a tab-local recovery overlay. */
import { clearWriteFailed, setWriteFailed } from './save-state';
import { coordinatedSnapshot, coordinateShift, SHIFT_KEY } from './shift-store';

const DEMO_PREFIX = 'slip.demo.';
const LEDGER_KEY = 'slip.ledger.v1';
function isDemoMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
}
export const isDemo = isDemoMode();
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PendingWrite = { base: string | null; value: string | null };
const pending = new Map<KeyValueStore, Map<string, PendingWrite>>();
const identities = new WeakMap<KeyValueStore, number>();
let nextIdentity = 0;
function identity(store: KeyValueStore, key: string): string {
  if (!identities.has(store)) identities.set(store, ++nextIdentity);
  return `${identities.get(store)}:${key}`;
}
function writes(store: KeyValueStore): Map<string, PendingWrite> {
  let entries = pending.get(store);
  if (!entries) {
    entries = new Map();
    pending.set(store, entries);
  }
  return entries;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Rebase only locally changed fields/records onto the latest other-tab value.
 * This is best-effort read-modify-write, not a cross-tab transaction or lock.
 */
function merge(base: unknown, local: unknown, remote: unknown): unknown {
  if (equal(base, local)) return remote;
  if (equal(local, remote) || equal(base, remote)) return local;
  if (record(local) && record(remote)) {
    const before = record(base) ? base : {};
    const result = { ...remote };
    for (const key of new Set([...Object.keys(before), ...Object.keys(local)])) {
      if (equal(before[key], local[key])) continue;
      if (!(key in local)) {
        if (!equal(before[key], remote[key]))
          throw new Error(
            'Recovery conflict: export an encrypted backup before resolving changes from another tab.',
          );
        delete result[key];
      }
      // Never move a concurrently advanced address cursor backwards during recovery.
      else if (
        key === 'next' &&
        typeof local[key] === 'number' &&
        typeof remote[key] === 'number'
      ) {
        result[key] = Math.max(local[key], remote[key]);
      } else result[key] = merge(before[key], local[key], remote[key]);
    }
    return result;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const before = Array.isArray(base) ? base : [];
    const identified = (values: unknown[]) =>
      values.every((v) => record(v) && typeof v.id === 'string');
    if (identified(before) && identified(local) && identified(remote)) {
      const byId = new Map(remote.map((v) => [v.id, v]));
      const old = new Map(before.map((v) => [v.id, v]));
      const current = new Map(local.map((v) => [v.id, v]));
      for (const id of old.keys())
        if (!current.has(id)) {
          if (!equal(old.get(id), byId.get(id)))
            throw new Error('Recovery conflict: export an encrypted backup first.');
          byId.delete(id);
        }
      for (const [id, value] of current) {
        if (!equal(old.get(id), value)) byId.set(id, merge(old.get(id), value, byId.get(id)));
      }
      return [...current.keys(), ...byId.keys()]
        .filter((id, i, ids) => ids.indexOf(id) === i && byId.has(id))
        .map((id) => byId.get(id));
    }
    // Address-index arrays are sets: retain other-tab reservations on recovery.
    if ([...before, ...local, ...remote].every((v) => typeof v === 'number')) {
      return [
        ...new Set([...remote.filter((v) => !before.includes(v) || local.includes(v)), ...local]),
      ];
    }
  }
  throw new Error(
    'Recovery conflict: export an encrypted backup before resolving changes from another tab.',
  );
}
function recovered(entry: PendingWrite, remote: string | null): string | null {
  if (remote === entry.base) return entry.value;
  let base: unknown, local: unknown, latest: unknown;
  try {
    base = JSON.parse(entry.base ?? 'null');
    local = JSON.parse(entry.value ?? 'null');
    latest = JSON.parse(remote ?? 'null');
  } catch {
    throw new Error(
      'Recovery conflict: export an encrypted backup before replacing changed storage.',
    );
  }
  return JSON.stringify(merge(base, local, latest));
}
function read(store: KeyValueStore, key: string): string | null {
  const entry = pending.get(store)?.get(key);
  // Even if the browser refuses reads, keep the last failed record recoverable.
  try {
    const remote = store.getItem(key);
    return entry ? recovered(entry, remote) : remote;
  } catch (error) {
    if (entry) return entry.value;
    throw error;
  }
}

/** Throws the original error; an in-memory record is never a persisted success. */
function writeItem(
  store: KeyValueStore,
  key: string,
  value: string,
  retry = false,
  authoritativeBase?: string | null,
  deferAck = false,
): void {
  const entries = writes(store);
  const previous = entries.get(key);
  if (previous && !retry)
    throw new Error(
      'Unsaved changes already exist for this record. Retry or export an encrypted backup first.',
    );
  let base = previous?.base ?? null;
  if (authoritativeBase !== undefined) base = authoritativeBase;
  if (!previous && authoritativeBase === undefined) {
    try {
      base = store.getItem(key);
    } catch {
      /* write may still work */
    }
  }
  try {
    store.setItem(key, value);
    if (!deferAck) acknowledge(store, key);
  } catch (error) {
    // A failed retry must preserve the ORIGINAL local delta. Its rebased candidate
    // contains other-tab changes, which must not become local edits on the next retry.
    if (!previous) entries.set(key, { base, value });
    setWriteFailed(identity(store, key));
    throw error;
  }
}

function acknowledge(raw: KeyValueStore, key: string): void {
  pending.get(raw)?.delete(key);
  if (!pending.get(raw)?.size) pending.delete(raw);
  clearWriteFailed(identity(raw, key));
}
function retain(raw: KeyValueStore, key: string, base: string | null, value: string | null): void {
  writes(raw).set(key, { base, value });
}

export function guardedSetItem(store: KeyValueStore, key: string, value: string): void {
  writeItem(store, key, value);
}

const real: KeyValueStore = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
};
const demo: KeyValueStore = {
  getItem: (key) => real.getItem(DEMO_PREFIX + key),
  setItem: (key, value) => real.setItem(DEMO_PREFIX + key, value),
  removeItem: (key) => real.removeItem(DEMO_PREFIX + key),
};
function overlay(raw: KeyValueStore): KeyValueStore {
  return {
    getItem: (key) => raw.getItem(key),
    setItem: (key, value) => {
      if (key === SHIFT_KEY || key === LEDGER_KEY)
        throw new Error('Shift-log writes require the asynchronous coordinated API.');
      guardedSetItem(raw, key, value);
    },
    removeItem: (key) => {
      if (key === SHIFT_KEY || key === LEDGER_KEY)
        throw new Error('Shift-log deletion requires the asynchronous coordinated API.');
      raw.removeItem(key); // A failed deletion must not discard recovery data.
      pending.get(raw)?.delete(key);
      clearWriteFailed(identity(raw, key));
    },
  };
}
const plainStore = overlay(real);
const demoStore = overlay(demo);
export function store(): KeyValueStore {
  return isDemo ? demoStore : plainStore;
}

/** Browser shift writes are async and durable-coordinated; synchronous reads stay on disk. */
export async function mutateShift(
  change: (base: string | null) => Promise<string | null>,
  replace = false,
): Promise<void> {
  const raw = isDemo ? demo : real;
  try {
    if (pending.get(raw)?.has(SHIFT_KEY) && !replace)
      throw new Error(
        'Unsaved changes already exist for this record. Retry or export an encrypted backup first.',
      );
    let base: string | null = null;
    await coordinateShift(
      isDemo,
      raw,
      async (current) => {
        base = current;
        if (pending.get(raw)?.has(SHIFT_KEY) && !replace)
          throw new Error('Unsaved changes already exist for this record.');
        return change(current);
      },
      (value) => {
        if (value === null) raw.removeItem(SHIFT_KEY);
        else writeItem(raw, SHIFT_KEY, value, true, base, true);
      },
      undefined,
      replace,
      SHIFT_KEY,
      (before, value) => retain(raw, SHIFT_KEY, before, value),
    );
    acknowledge(raw, SHIFT_KEY);
    clearWriteFailed(identity(raw, 'shift-coordination'));
  } catch (error) {
    setWriteFailed(identity(raw, 'shift-coordination'));
    throw error;
  }
}
export async function replaceShiftLog(value: string | null): Promise<void> {
  await mutateShift(async () => value, true);
}

export function isBrowserStore(value: unknown): boolean {
  return value === plainStore || value === demoStore;
}
export async function mutateLedger(
  change: (base: string | null) => Promise<string | null>,
  replace = false,
): Promise<void> {
  const raw = isDemo ? demo : real;
  try {
    let base: string | null = null;
    await coordinateShift(
      isDemo,
      raw,
      async (current) => {
        if (pending.get(raw)?.has(LEDGER_KEY) && !replace)
          throw new Error('Unsaved books: retry or export a recovery backup first.');
        base = current;
        return change(current);
      },
      (value) => {
        if (value === null) raw.removeItem(LEDGER_KEY);
        else writeItem(raw, LEDGER_KEY, value, true, base, true);
      },
      undefined,
      replace,
      LEDGER_KEY,
      (before, value) => retain(raw, LEDGER_KEY, before, value),
    );
    acknowledge(raw, LEDGER_KEY);
    clearWriteFailed(identity(raw, 'ledger-coordination'));
  } catch (error) {
    setWriteFailed(identity(raw, 'ledger-coordination'));
    throw error;
  }
}
export async function replaceLedger(value: string | null): Promise<void> {
  await mutateLedger(async () => value, true);
}

/** Explicit recovery view; never used for ordinary ledger/resume/payment reads. */
export async function backupSnapshot(): Promise<{view: KeyValueStore; recovery: Record<string,string|null>}> {
  const raw = isDemo ? demo : real;
  const {records, prepared} = await coordinatedSnapshot(isDemo, raw);
  const recovery = {...prepared, ...pendingRecoveryWrites()};
  // Keep failed deltas separately: never replace committed books with a failed candidate.
  return {view: {...recoveryStore(), getItem: key => key in records ? records[key]! : read(raw,key)}, recovery};
}
export function recoveryStore(): KeyValueStore {
  const raw = isDemo ? demo : real;
  return { ...store(), getItem: (key) => read(raw, key) };
}
let recoverySale: unknown = null;
/** Memory-only informational cart snapshot; never automatically becomes a sale on restore. */
export function rememberRecoverySale(snapshot: unknown | null): void {
  recoverySale =
    snapshot === null
      ? null
      : JSON.parse(
          JSON.stringify(snapshot, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        );
}
export function recoverySaleSnapshot(): unknown {
  return recoverySale;
}
/** The exact failed values, not a speculative merged success. Encrypted backup only. */
export function pendingRecoveryWrites(): Record<string, string | null> {
  return Object.fromEntries(
    [...(pending.get(isDemo ? demo : real) ?? [])].map(([key, entry]) => [key, entry.value]),
  );
}

/** Logical keys only; demo and real writes remain isolated. No record contents exposed. */
export function pendingWriteKeys(): string[] {
  return [...(pending.get(isDemo ? demo : real)?.keys() ?? [])];
}

/** Retry genuine writes, rebasing on disk first. Try every key; rethrow the first error. */
export async function retryPendingWrites(): Promise<void> {
  const raw = isDemo ? demo : real;
  let firstError: unknown;
  let failed = false;
  for (const [key] of [...(pending.get(raw) ?? [])]) {
    try {
      const entry = pending.get(raw)!.get(key)!;
      if (key === SHIFT_KEY || key === LEDGER_KEY) {
        await coordinateShift(
          isDemo,
          raw,
          async (base) => recovered(entry, base),
          (value) => { if (value === null) raw.removeItem(key); else writeItem(raw, key, value, true, undefined, true); },
          entry.value,
          false,
          key,
          (base, value) => retain(raw, key, base, value),
        );
        acknowledge(raw, key);
        clearWriteFailed(
          identity(raw, key === SHIFT_KEY ? 'shift-coordination' : 'ledger-coordination'),
        );
      } else { const value = recovered(entry, raw.getItem(key)); if (value === null) raw.removeItem(key); else writeItem(raw, key, value, true); }
    } catch (error) {
      if (!failed) firstError = error;
      failed = true;
    }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('slip:data-changed'));
  if (failed) throw firstError;
}

export function demoExists(): boolean {
  try {
    return real.getItem(DEMO_PREFIX + 'seeded') === '1';
  } catch {
    return false;
  }
}
export async function clearDemo(): Promise<void> {
  await coordinateShift(
    true,
    demo,
    async () => null,
    () => demo.removeItem(SHIFT_KEY),
    undefined,
    true,
  );
  pending.get(demo)?.delete(SHIFT_KEY);
  clearWriteFailed(identity(demo, SHIFT_KEY));
  clearWriteFailed(identity(demo, 'shift-coordination'));
  await coordinateShift(
    true,
    demo,
    async () => null,
    () => demo.removeItem(LEDGER_KEY),
    undefined,
    true,
    LEDGER_KEY,
  );
  pending.get(demo)?.delete(LEDGER_KEY);
  clearWriteFailed(identity(demo, LEDGER_KEY));
  clearWriteFailed(identity(demo, 'ledger-coordination'));
  const storage = window.localStorage;
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(DEMO_PREFIX)) doomed.push(key.slice(DEMO_PREFIX.length));
  }
  for (const key of new Set([...doomed, ...(pending.get(demo)?.keys() ?? [])]))
    if (key !== SHIFT_KEY && key !== LEDGER_KEY) demoStore.removeItem(key);
}
