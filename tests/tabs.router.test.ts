import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION,
  LEGACY_ALIASES,
  PANEL_IDS,
  SECTIONS,
  TABS,
  hashForSection,
  isSection,
  isTab,
  resolveHash,
  sectionFromHash,
} from '../src/core/tabs.router';

describe('section router', () => {
  it('exposes the five NAV-MAP tabs in order, and Learn as a sixth section', () => {
    expect([...TABS]).toEqual(['sell', 'money', 'books', 'setup', 'more']);
    expect([...SECTIONS]).toEqual(['sell', 'money', 'books', 'setup', 'more', 'learn']);
  });

  it('defaults to Sell for empty, null and unknown hashes', () => {
    expect(DEFAULT_SECTION).toBe('sell');
    expect(sectionFromHash('')).toBe('sell');
    expect(sectionFromHash(null)).toBe('sell');
    expect(sectionFromHash('#nonsense')).toBe('sell');
  });

  it('accepts every section hash, with or without the leading #', () => {
    for (const s of SECTIONS) {
      expect(sectionFromHash(`#${s}`)).toBe(s);
      expect(sectionFromHash(s)).toBe(s);
      expect(hashForSection(s)).toBe(`#${s}`);
    }
  });

  it('aliases every legacy anchor and panel to its owning section (NAV-MAP §1 + §4)', () => {
    expect(sectionFromHash('#proof')).toBe('more'); // folded group: Verify/SelfTest now in More
    expect(sectionFromHash('#till')).toBe('sell');
    expect(sectionFromHash('#lightning')).toBe('sell');
    expect(sectionFromHash('#requests')).toBe('money');
    expect(sectionFromHash('#history')).toBe('books');
    expect(sectionFromHash('#wallets')).toBe('setup');
    expect(sectionFromHash('#verify')).toBe('more');
    expect(sectionFromHash('#selftest')).toBe('more');
    expect(sectionFromHash('#silentpay')).toBe('more');
    expect(sectionFromHash('#pair')).toBe('more');
    expect(sectionFromHash('#watchlist')).toBe('more');
    expect(sectionFromHash('#manual')).toBe('learn'); // Learn is a section, not an alias
  });

  it('preserves panel identity so deep links can scroll to the exact panel', () => {
    expect(resolveHash('#verify')).toEqual({ section: 'more', panel: 'verify' });
    expect(resolveHash('#proof')).toEqual({ section: 'more', panel: 'proof' });
    expect(resolveHash('#books')).toEqual({ section: 'books', panel: null });
    expect(resolveHash('#learn')).toEqual({ section: 'learn', panel: null });
    expect(resolveHash('')).toEqual({ section: 'sell', panel: null });
  });

  it('covers every audited data-panel id, and invents none', () => {
    // Every panel Nova audited (NAV-MAP §5) must be routable…
    for (const id of PANEL_IDS) {
      expect(LEGACY_ALIASES[id], `panel "${id}" must be in the alias table`).toBeTruthy();
      expect(isSection(LEGACY_ALIASES[id]!)).toBe(true);
    }
    // …and the alias table must not carry ids that are not real panels. The one folded group
    // alias (`proof`) is the only non-panel key; Learn is a section, not an alias.
    expect([...Object.keys(LEGACY_ALIASES)].sort()).toEqual([...PANEL_IDS, 'proof'].sort());
  });

  it('is strict: query-bearing or case-variant hashes fall to the default, not a near-miss', () => {
    // '#money?x=1' is not the '#money' section, so it must NOT resolve to 'money'.
    expect(sectionFromHash('#money?x=1')).toBe('sell');
    expect(LEGACY_ALIASES['money?x=1']).toBeUndefined();
    expect(sectionFromHash('#SELL')).toBe('sell');
    expect(sectionFromHash('#till?x')).toBe('sell');
  });

  it('treats every tab as a section, and Learn as a section but not a tab', () => {
    for (const t of TABS) expect(isSection(t)).toBe(true);
    expect(isSection('learn')).toBe(true);
    expect(isTab('learn')).toBe(false);
  });
});
