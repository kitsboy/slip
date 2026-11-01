/**
 * Sound, for a counter you cannot look at.
 *
 * A merchant serving a customer is looking at the customer. The title badge helps only when the tab
 * is hidden, so slip gives the till three cues and nothing more.
 *
 * Two rules keep it honest:
 *   1. A cue never changes an invoice. The badge, the receipt and the books still say only what the
 *      engine observed. Mute the till and you lose convenience, never truth.
 *   2. One sale chimes once. The till polls while a payment screen is open and the shell watcher
 *      sweeps in the background; both can see the same event. `announceOnce` dedupes per invoice.
 *
 * There are no audio files. Three oscillators, no request, because a till that downloads a chime is
 * a till that phones home.
 */

export type Cue = 'seen' | 'paid' | 'attention';

interface Note {
  readonly hz: number;
  readonly at: number;
  readonly ms: number;
  readonly gain: number;
}

export interface CueSpec {
  readonly notes: readonly Note[];
  /** One plain sentence: what the merchant is hearing, and what it does not mean. */
  readonly meaning: string;
}

export const CUES: Readonly<Record<Cue, CueSpec>> = {
  // Someone paid the address. Quiet, short, and deliberately duller than "paid".
  seen: {
    notes: [{ hz: 659.25, at: 0, ms: 160, gain: 0.1 }],
    meaning: 'someone paid the address, but the network has not mined it yet',
  },
  // The sale is settled. Two notes rising: the only cue a merchant must never miss.
  paid: {
    notes: [
      { hz: 783.99, at: 0, ms: 130, gain: 0.16 },
      { hz: 1046.5, at: 120, ms: 220, gain: 0.14 },
    ],
    meaning: 'a sale is settled',
  },
  // Needs a human: the invoice expired, or the amount was short.
  attention: {
    notes: [
      { hz: 196, at: 0, ms: 180, gain: 0.14 },
      { hz: 196, at: 220, ms: 180, gain: 0.14 },
    ],
    meaning: 'a sale needs you — expired, or short of the amount',
  },
};

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
/** Invoice id → the strongest cue already played for it. */
const announced = new Map<string, Cue>();

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioContextCtor | undefined =
    (window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      return null;
    }
  }
  return context;
}

/** True where the device can make a sound at all. A test environment says false, not "silent". */
export function audioAvailable(): boolean {
  return audioContext() !== null;
}

/**
 * Browsers only allow audio after a gesture. Call this from the press that opens a payment, so the
 * cue that matters later is not the one the browser refuses.
 */
export function primeAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Play one cue. Returns false when there is no audio (or the cue is switched off). */
export function playCue(cue: Cue, options: { enabled?: boolean; haptics?: boolean } = {}): boolean {
  const { enabled = true, haptics = true } = options;
  if (!enabled) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  const spec = CUES[cue];
  try {
    for (const note of spec.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + note.at / 1000;
      const end = start + note.ms / 1000;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.hz, start);
      // A short attack and a longer decay: a click is a bug, a bell is a chime.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
    if (haptics) haptic(cue === 'paid' ? 30 : 12);
    return true;
  } catch {
    return false;
  }
}

/** A short buzz where the device has one. Never the only signal — plenty of tills have no motor. */
export function haptic(ms: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as unknown as { vibrate?: (pattern: number | number[]) => boolean };
  try {
    nav.vibrate?.(ms);
  } catch {
    // Vibration is a courtesy, like the sound. It cannot fail a sale.
  }
}

/** Which cue a status change deserves, if any. */
export function cueForTransition(
  previous: string | null | undefined,
  next: string | null | undefined,
  options: { short?: boolean } = {},
): Cue | null {
  if (!next || previous === next) return null;
  if (next === 'confirmed' || next === 'complete') return 'paid';
  if (next === 'underpaid' || next === 'expired') return 'attention';
  if (next === 'seen') return options.short ? null : 'seen';
  return null;
}

/**
 * Announce a cue at most once per invoice, and never downgrade it: a sale that has chimed "paid"
 * does not later chime "seen" because another poller read an older observation.
 */
export function announceOnce(invoiceId: string, cue: Cue, options: { enabled?: boolean } = {}): boolean {
  const { enabled = true } = options;
  if (!enabled) return false;
  const already = announced.get(invoiceId);
  if (already === 'paid') return false;
  if (already === cue) return false;
  announced.set(invoiceId, cue);
  return playCue(cue, { enabled: true });
}

/** Forget everything about a sale — used when it is cancelled or leaves the counter. */
export function resetAnnouncements(): void {
  announced.clear();
}

/** Forget the audio context too. Tests only; a real browser keeps its primed context. */
export function resetAudio(): void {
  announced.clear();
  if (context) {
    try {
      void context.close();
    } catch {
      // Closing a context that is already closed is not an error worth reporting.
    }
    context = null;
  }
}
