/**
 * How old is this number, and can you still act on it?
 *
 * Every figure slip shows that came from somewhere else — a rate, a balance, a payment check —
 * carries the moment it was read. A number with no age is indistinguishable from a number that is
 * wrong, which is how a merchant sells coffee at last week's price during an outage.
 *
 * The ring is the visual; this file is the rule, so the ring cannot disagree with the refusal.
 */

export type FreshnessLevel = 'fresh' | 'ageing' | 'stale';

export interface Freshness {
  readonly ageSeconds: number;
  readonly level: FreshnessLevel;
  /** 1 = brand new, 0 = fully stale. Drives the ring's arc. */
  readonly fraction: number;
  /** Plain words for a merchant, never a percentage. */
  readonly label: string;
}

/** Beyond this, a quote must not be used to price anything. */
export const STALE_AFTER_SECONDS = 600;
/** Beyond this, the number is worth a visible nudge but still usable. */
export const AGEING_AFTER_SECONDS = 180;

export function freshness(fetchedAt: string, now = new Date(), staleAfter = STALE_AFTER_SECONDS): Freshness {
  const at = new Date(fetchedAt).getTime();
  if (!Number.isFinite(at)) {
    return { ageSeconds: Infinity, level: 'stale', fraction: 0, label: 'unknown age' };
  }
  const ageSeconds = Math.max(0, Math.round((now.getTime() - at) / 1000));
  const fraction = Math.max(0, Math.min(1, 1 - ageSeconds / staleAfter));

  if (ageSeconds >= staleAfter) {
    return { ageSeconds, level: 'stale', fraction: 0, label: `stale — read ${describeAge(ageSeconds)} ago` };
  }
  if (ageSeconds >= AGEING_AFTER_SECONDS) {
    return { ageSeconds, level: 'ageing', fraction, label: `read ${describeAge(ageSeconds)} ago` };
  }
  return { ageSeconds, level: 'fresh', fraction, label: `read ${describeAge(ageSeconds)} ago` };
}

export function describeAge(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'an unknown time';
  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 min';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 7200) return '1 hour';
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86_400)} days`;
}

/** A short hex slice for the tamper-evident footer. Never a truncation of something else. */
export function shortDigest(hex: string, groups = 2): string {
  const clean = hex.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return clean.slice(0, groups * 4).match(/.{1,4}/g)?.join(' ') ?? '';
}
