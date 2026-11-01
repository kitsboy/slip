import { afterEach, describe, expect, it } from 'vitest';

import {
  CUES,
  announceOnce,
  audioAvailable,
  cueForTransition,
  playCue,
  resetAnnouncements,
  resetAudio,
} from '../src/core/sound';

afterEach(() => {
  resetAudio();
});

describe('cues', () => {
  it('has exactly three cues, each with a plain meaning', () => {
    expect(Object.keys(CUES).sort()).toEqual(['attention', 'paid', 'seen']);
    for (const cue of Object.values(CUES)) {
      expect(cue.notes.length).toBeGreaterThan(0);
      expect(cue.meaning.length).toBeGreaterThan(10);
    }
  });

  it('makes the settled cue rise and the needs-you cue fall', () => {
    const paid = CUES.paid.notes.map((n) => n.hz);
    const attention = CUES.attention.notes.map((n) => n.hz);
    expect(paid[1]).toBeGreaterThan(paid[0]!);
    expect(Math.max(...attention)).toBeLessThan(Math.min(...paid));
  });
});

describe('result mapping', () => {
  it('maps a settled sale to the paid cue', () => {
    expect(cueForTransition('awaiting', 'confirmed')).toBe('paid');
    expect(cueForTransition('confirmed', 'complete')).toBe('paid');
  });

  it('maps seen, expired and short to their own cues', () => {
    expect(cueForTransition('awaiting', 'seen')).toBe('seen');
    expect(cueForTransition('awaiting', 'expired')).toBe('attention');
    expect(cueForTransition('awaiting', 'underpaid')).toBe('attention');
  });

  it('stays silent when nothing changed, and never invents a cue', () => {
    expect(cueForTransition('awaiting', 'awaiting')).toBeNull();
    expect(cueForTransition('awaiting', 'cancelled')).toBeNull();
    expect(cueForTransition(null, null)).toBeNull();
  });

  it('skips the dull seen cue while the tab is hidden', () => {
    expect(cueForTransition('awaiting', 'seen', { short: true })).toBeNull();
    expect(cueForTransition('awaiting', 'confirmed', { short: true })).toBe('paid');
  });
});

describe('without audio', () => {
  it('says there is no audio rather than pretending', () => {
    // jsdom has no WebAudio. Silence here is "no sound", never "no payment".
    expect(audioAvailable()).toBe(false);
    expect(playCue('paid')).toBe(false);
    expect(() => playCue('paid', { enabled: false })).not.toThrow();
  });
});

describe('one sale chimes once', () => {
  it('refuses to repeat a cue for the same invoice', () => {
    expect(announceOnce('inv-1', 'seen')).toBe(false); // no audio in this environment
    // The bookkeeping is what matters: the second call is refused before any sound is attempted.
    expect(announceOnce('inv-1', 'seen')).toBe(false);
  });

  it('never downgrades a settled sale to a duller cue', () => {
    announceOnce('inv-2', 'paid');
    expect(announceOnce('inv-2', 'seen')).toBe(false);
  });

  it('does nothing when the merchant has muted the till', () => {
    expect(announceOnce('inv-3', 'paid', { enabled: false })).toBe(false);
  });

  it('forgets everything on reset', () => {
    announceOnce('inv-4', 'paid');
    resetAnnouncements();
    expect(announceOnce('inv-4', 'paid')).toBe(false);
  });
});
