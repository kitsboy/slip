import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  gateFor,
  isOnboarded,
  loadSettings,
  nextStep,
  previousStep,
  sanitizeSettings,
  saveSettings,
  type WizardState,
} from '../src/core/settings';

function memoryStore() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

const base = (over: Partial<WizardState> = {}): WizardState => ({
  step: 1,
  settings: { ...DEFAULT_SETTINGS, businessName: 'Corner Coffee' },
  walletConfirmed: false,
  pinSet: false,
  walletSkipped: false,
  ...over,
});

describe('wizard gates', () => {
  it('always allows leaving the welcome screen', () => {
    expect(gateFor(base({ step: 1 })).canAdvance).toBe(true);
  });

  it('refuses step 2 without a shop name', () => {
    const g = gateFor(base({ step: 2, settings: { ...DEFAULT_SETTINGS, businessName: ' ' } }));
    expect(g.canAdvance).toBe(false);
    expect(g.reason).toMatch(/shop a name/);
  });

  it('refuses an unknown currency at step 2', () => {
    const g = gateFor(base({ step: 2, settings: { ...DEFAULT_SETTINGS, businessName: 'X', currency: 'ZZZ' } }));
    expect(g.canAdvance).toBe(false);
  });

  it('refuses a tax rate outside 0–100%', () => {
    for (const bps of [-1, 10_001]) {
      const g = gateFor(base({ step: 2, settings: { ...DEFAULT_SETTINGS, businessName: 'X', taxBps: bps } }));
      expect(g.canAdvance).toBe(false);
    }
  });

  it('will not leave the wallet step until address 0/0 is confirmed', () => {
    const g = gateFor(base({ step: 3, walletConfirmed: false }));
    expect(g.canAdvance).toBe(false);
    expect(g.reason).toMatch(/address 0\/0/);
    expect(gateFor(base({ step: 3, walletConfirmed: true })).canAdvance).toBe(true);
  });

  it('treats "skipped" as still blocked, not as consent', () => {
    const g = gateFor(base({ step: 3, walletSkipped: true }));
    expect(g.canAdvance).toBe(false);
    expect(g.reason).toMatch(/nowhere to pay/);
  });

  it('lets a merchant reach the summary without a PIN (it is asked for at hand-off)', () => {
    expect(gateFor(base({ step: 4, pinSet: false })).canAdvance).toBe(true);
  });
});

describe('step movement', () => {
  it('clamps at both ends', () => {
    expect(previousStep(1)).toBe(1);
    expect(nextStep(5)).toBe(5);
    expect(nextStep(1)).toBe(2);
  });
});

describe('settings sanitising', () => {
  it('clamps a wild tax rate and says so', () => {
    const { settings, warnings } = sanitizeSettings({ taxBps: 90_000 });
    expect(settings.taxBps).toBe(10_000);
    expect(warnings.join(' ')).toMatch(/clamped/);
  });

  it('rejects a non-ISO currency and falls back', () => {
    const { settings, warnings } = sanitizeSettings({ currency: 'DOGE' });
    expect(settings.currency).toBe('USD');
    expect(warnings.join(' ')).toMatch(/not an ISO 4217/);
  });

  it('drops nonsensical tip presets and de-duplicates', () => {
    const { settings } = sanitizeSettings({ tipPresetsBps: [0, 1000, 1000, -5, 20_000, 1500] });
    expect(settings.tipPresetsBps).toEqual([0, 1000, 1500]);
  });

  it('survives a corrupt stored blob', () => {
    const store = memoryStore();
    store.setItem('slip.settings.v1', '{oops');
    expect(loadSettings(store).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through the store and reports onboarding', () => {
    const store = memoryStore();
    expect(isOnboarded(store)).toBe(false);
    saveSettings(store, { ...DEFAULT_SETTINGS, businessName: 'Corner Coffee', onboardedAt: '2026-10-30T00:00:00Z' });
    expect(isOnboarded(store)).toBe(true);
    expect(loadSettings(store).settings.businessName).toBe('Corner Coffee');
  });
});
