import { describe, expect, it } from 'vitest';

import {
  FEDI_CARD_COPY,
  FEDI_CARD_ENABLED,
  FEDI_RAILS,
  checkFediAddress,
  sweepSuggestion,
} from '../src/core/fedi';

/**
 * Fedi is prepared, not shipped. These tests pin the two things that would make shipping it wrong:
 * a card that turns itself on, and a "sweep" that edits a balance.
 */

describe('the Fedi template', () => {
  it('stays switched off until someone turns it on deliberately', () => {
    expect(FEDI_CARD_ENABLED).toBe(false);
  });

  it('admits which Fedi payment path a point-of-sale cannot see', () => {
    const ecash = FEDI_RAILS.find((rail) => rail.id === 'ecash');
    expect(ecash?.works).toBe(false);
    expect(FEDI_RAILS.filter((rail) => rail.works).map((rail) => rail.id)).toEqual(['lightning', 'onchain']);
  });

  it('says plainly that slip does not join the federation', () => {
    expect(FEDI_CARD_COPY.limit).toMatch(/never joins the federation/i);
    expect(FEDI_CARD_COPY.limit).toMatch(/cannot move money/i);
  });
});

describe('checking a Fedi lightning address', () => {
  it('accepts an ordinary lightning address', () => {
    const check = checkFediAddress('shop@fedi.example');
    expect(check.ok).toBe(true);
  });

  it('refuses an empty field and a space without echoing what was typed', () => {
    expect(checkFediAddress('').ok).toBe(false);
    const spaced = checkFediAddress('shop @example');
    expect(spaced.ok).toBe(false);
    expect(spaced.reason).not.toContain('shop');
  });

  it('refuses something that is not an address at all', () => {
    expect(checkFediAddress('lnbc1notanaddress').ok).toBe(false);
  });

  it('does not claim to know the host is Fedi — only the live lookup can', () => {
    expect(checkFediAddress('anything@anywhere.example').reason).toMatch(/still has to ask the host/i);
  });
});

describe('the sweep nudge', () => {
  it('stays quiet below the threshold', () => {
    expect(sweepSuggestion({ thresholdSats: 500_000n, balanceSats: 100_000n })).toEqual({
      at: false,
      sentence: null,
    });
  });

  it('stays quiet when the balance is unknown, rather than guessing', () => {
    expect(sweepSuggestion({ thresholdSats: 500_000n, balanceSats: null }).at).toBe(false);
  });

  it('speaks once the balance passes the threshold, and offers no action', () => {
    const nudge = sweepSuggestion({ thresholdSats: 500_000n, balanceSats: 900_000n, label: 'Café Fedi' });
    expect(nudge.at).toBe(true);
    expect(nudge.sentence).toContain('Café Fedi');
    expect(nudge.sentence).toMatch(/slip cannot do it/i);
  });

  it('is off when no threshold was set', () => {
    expect(sweepSuggestion({ thresholdSats: 0n, balanceSats: 9_000_000n }).at).toBe(false);
  });
});
