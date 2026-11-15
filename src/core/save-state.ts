/**
 * Write-failure state for the whole shop.
 *
 * localStorage.setItem has no return value and no warning — it either wrote or it threw,
 * and for years slip let a thrown QutaExceededError bubble up into a click handler, where
 * it looked like "the sale did not go through" instead of "this device is full". A single
 * flag, read by the shell, turns that silent failure into a banner that cannot be missed.
 *
 * The flag is module-level because a shop is one drawer: whatever panel caused the last
 * failed write, the whole app must know not to look settled. It clears on the next write
 * that succeeds, so a transient quota error (a video downloaded, then deleted) resolves
 * itself without pretending nothing happened in the meantime.
 */

type Listener = (failed: boolean) => void;

let failed = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(failed);
}

/** True when the most recent write to the store threw. */
export function isWriteFailed(): boolean {
  return failed;
}

/** Subscribe to write-state changes; returns an unsubscribe function. */
export function subscribeWriteState(l: Listener): () => void {
  listeners.add(l);
  l(failed);
  return () => listeners.delete(l);
}

/** Record that a write to the store failed. */
export function setWriteFailed(): void {
  if (failed) return;
  failed = true;
  emit();
}

/** Record that a write to the store succeeded. */
export function clearWriteFailed(): void {
  if (!failed) return;
  failed = false;
  emit();
}

/** A failure that is clearly a full device rather than code: safe to name as such. */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014;
}
