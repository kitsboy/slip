import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSIST, sanitizeSettings } from '../src/core/settings';
import { buildHandover, handoverText } from '../src/core/handover';
import { allPassed, runSelfTest } from '../src/core/selftest';
import { EXPLANATIONS, explain } from '../src/core/explain';

describe('assistance switches', () => {
  it('defaults to helpful, not silent', () => {
    expect(DEFAULT_ASSIST.explainNumbers).toBe(true);
    expect(DEFAULT_ASSIST.rehearsal).toBe(false);
    expect(DEFAULT_ASSIST.bookSeal).toBe(true);
  });

  it('keeps a merchant’s choices and ignores junk', () => {
    const { settings } = sanitizeSettings({
      businessName: 'Café',
      assist: { explainNumbers: false, bookSeal: false, rehearsal: true, nonsense: true },
    });
    expect(settings.assist.explainNumbers).toBe(false);
    expect(settings.assist.bookSeal).toBe(false);
    expect(settings.assist.rehearsal).toBe(true);
    expect((settings.assist as unknown as Record<string, unknown>).nonsense).toBeUndefined();
  });

  it('ignores a non-boolean instead of coercing it', () => {
    const { settings } = sanitizeSettings({ assist: { explainNumbers: 'yes' } });
    expect(settings.assist.explainNumbers).toBe(DEFAULT_ASSIST.explainNumbers);
  });

  it('fills in every switch when an older settings blob has none', () => {
    const { settings } = sanitizeSettings({ businessName: 'Old shop' });
    expect(settings.assist).toEqual(DEFAULT_ASSIST);
  });
});

describe('handover note', () => {
  const base = {
    staffName: 'Ana',
    parkedTabs: 0,
    openSales: 0,
    refundsToday: 0,
    takingsToday: 12_000n,
    rateAgeSeconds: null,
  };

  it('says something useful even when nothing is happening', () => {
    const note = buildHandover(base);
    expect(note.headline).toBe('Handover from Ana');
    expect(note.lines[0]).toBe('no parked sales');
    expect(note.lines[1]).toBe('nothing waiting for payment');
  });

  it('names what is in flight, in the order the next person needs it', () => {
    const note = buildHandover({ ...base, parkedTabs: 2, openSales: 1, refundsToday: 1 });
    expect(note.lines[0]).toContain('2 sales parked');
    expect(note.lines[1]).toContain('1 sale still waiting');
    expect(note.lines[2]).toContain('1 refund recorded today');
  });

  it('warns about a stale rate only when it is really stale', () => {
    expect(buildHandover({ ...base, rateAgeSeconds: 120 }).lines.join(' ')).not.toContain('stale');
    expect(buildHandover({ ...base, rateAgeSeconds: 1200 }).lines.join(' ')).toContain('rate is stale');
  });

  it('prints as plain text a person can paste to the next shift', () => {
    const text = handoverText(buildHandover({ ...base, parkedTabs: 1 }));
    expect(text.split('\n')[0]).toBe('Handover from Ana');
    expect(text).toContain('· 1 sale parked');
  });
});

describe('self test', () => {
  const results = runSelfTest();

  it('runs five checks and passes every one on a correct build', () => {
    expect(results).toHaveLength(5);
    expect(allPassed(results)).toBe(true);
  });

  it('proves the derivation vector, not just that the function ran', () => {
    const derive = results.find((r) => r.name.startsWith('Derive'));
    expect(derive?.detail).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  });

  it('reports a failure rather than throwing when a check cannot run', () => {
    // A result object, never an exception: the button must not crash a till.
    expect(results.every((r) => typeof r.ok === 'boolean')).toBe(true);
  });
});

describe('explanations', () => {
  it('has a plain sentence and a caveat for every figure', () => {
    for (const [id, e] of Object.entries(EXPLANATIONS)) {
      expect(e.plain.length, id).toBeGreaterThan(30);
      expect(e.caveat.length, id).toBeGreaterThan(20);
      expect(e.plain.toLowerCase()).not.toContain('utxo');
    }
  });

  it('never lets a manual confirmation masquerade as an observation', () => {
    expect(explain('rail').caveat).toContain('manual');
    expect(explain('refund').caveat).toContain('cannot send money');
  });
});
