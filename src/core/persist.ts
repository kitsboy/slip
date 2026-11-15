/**
 * Persistent-storage request and its honest answer.
 *
 * Browsers evict a site's data (localStorage included) when the device is short of space —
 * iOS Safari is the most eager — and a shop is exactly the data a browser would rather drop.
 * The Permissions `navigator.storage.persist()` API asks the browser to promise to keep this
 * site's storage. But the key word is "ask": support and behavior vary by browser, an
 * incognito/user gesture may refuse the whole call, and even a granted request is a promise
 * the browser can still break in an emergency. So this module
 *  1. requests persistence once (not on every boot),
 *  2. records the *real* answer it got back — kept / not guaranteed / unknown,
 *  3. reports that answer in Settings, plainly, and
 *  never suggests that a granted request replaces the backup file. (It does not: a .slip
 *  file is the only copy that survives across browsers and devices.)
 */

const PERSIST_KEY = 'slip.persistGrant.v1';

export type PersistAnswer = 'kept' | 'not-guaranteed' | 'unknown';

export interface PersistState {
  answer: PersistAnswer;
  /** When the decision was made, so Settings can say "not yet asked". */
  promisedAt: string | null;
}

export function storageApiPresent(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.persist === 'function' &&
    typeof navigator.storage.persisted === 'function'
  );
}

interface SnapshotStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readExisting(store: SnapshotStore): PersistState | null {
  try {
    const raw = store.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistState>;
    if (typeof parsed.answer !== 'string') return null;
    return {
      answer: parsed.answer as PersistAnswer,
      promisedAt: typeof parsed.promisedAt === 'string' ? parsed.promisedAt : null,
    };
  } catch {
    return null;
  }
}

function write(store: SnapshotStore, state: PersistState): void {
  try {
    store.setItem(PERSIST_KEY, JSON.stringify(state));
  } catch {
    // Best-effort bookkeeping; a changed answer that fails to persist just re-asks next boot.
  }
}

/**
 * The current, recorded persistence answer. Before the first request this is null — the app
 * shows "not yet asked / unknown" rather than guessing.
 */
export function persistState(store: SnapshotStore): PersistState | null {
  return readExisting(store);
}

/**
 * Request persistent storage once per browser and collapse the messy three-outcome reality
 * into a stable three-way label. Call at boot; it reads the recorded answer and only calls
 * the browser when nothing has been recorded. Safe to call more than once — it never hammers
 * the API and never lies about the outcome.
 */
export async function ensurePersistentStorage(store: SnapshotStore): Promise<PersistState> {
  const existing = readExisting(store);
  if (existing) return existing;

  let answer: PersistAnswer = 'unknown';
  if (storageApiPresent()) {
    try {
      const granted = await navigator.storage.persist();
      // Double-check what the browser is actually prepared to say, not just what we asked for.
      const persisted = await navigator.storage.persisted();
      answer = persisted ? 'kept' : granted ? 'not-guaranteed' : 'not-guaranteed';
    } catch {
      answer = 'unknown';
    }
  }

  const state: PersistState = { answer, promisedAt: new Date().toISOString() };
  write(store, state);
  return state;
}

/** A button in Settings can re-check: don't just reuse a stale promise, ask again. */
export async function recheckPersistence(store: SnapshotStore): Promise<PersistState> {
  let answer: PersistAnswer = 'unknown';
  if (storageApiPresent()) {
    try {
      const persisted = await navigator.storage.persisted();
      answer = persisted ? 'kept' : 'not-guaranteed';
    } catch {
      answer = 'unknown';
    }
  }
  const state: PersistState = { answer, promisedAt: new Date().toISOString() };
  write(store, state);
  return state;
}
