import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/core/settings';
import { WALLET_GUIDES, guideById } from '../src/core/walletGuides';

/**
 * The two things a stranger meets before they can take a penny: "which wallet?" and "how big is the
 * type?". Both are easy to get subtly wrong — a guide that promises a menu that no longer exists, or
 * a display setting that a stored file silently drops.
 */

describe('wallet guides', () => {
  it('every guide has a name, a plain blurb and at least two steps', () => {
    for (const guide of WALLET_GUIDES) {
      expect(guide.name.length).toBeGreaterThan(2);
      expect(guide.blurb.length).toBeGreaterThan(20);
      expect(guide.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('a Lightning-only wallet is routed to the Lightning field, never told to find an xpub', () => {
    for (const id of ['phoenix', 'strike', 'cashapp', 'fedi']) {
      expect(guideById(id)?.kind).toBe('lightning');
    }
    expect(guideById('bluewallet')?.kind).toBe('code');
  });

  it('no guide ever asks for a seed phrase, and the catch-all says to stop if offered one', () => {
    const other = guideById('other');
    expect(other?.caveat ?? '').toMatch(/seed words|private key/i);
    for (const guide of WALLET_GUIDES) {
      const text = [guide.blurb, ...guide.steps, guide.caveat ?? ''].join(' ');
      expect(text).not.toMatch(/paste (your )?(seed|recovery) phrase/i);
    }
  });

  it('ids are unique', () => {
    const ids = WALLET_GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('display settings', () => {
  it('default to normal type and comfortable spacing', () => {
    expect(DEFAULT_SETTINGS.textSize).toBe('normal');
    expect(DEFAULT_SETTINGS.density).toBe('comfortable');
  });

  it('keep a chosen size across a save', () => {
    const { settings } = sanitizeSettings({ ...DEFAULT_SETTINGS, textSize: 'large', density: 'compact' });
    expect(settings.textSize).toBe('large');
    expect(settings.density).toBe('compact');
  });

  it('fall back rather than trust an unknown value in a stored file', () => {
    const { settings } = sanitizeSettings({ ...DEFAULT_SETTINGS, textSize: 'enormous', density: 'tiny' });
    expect(settings.textSize).toBe('normal');
    expect(settings.density).toBe('comfortable');
  });
});
