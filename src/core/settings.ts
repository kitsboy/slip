/**
 * Shop settings and the setup wizard's state machine.
 *
 * The machine lives in core (not in the component) so the "you cannot finish step 3
 * without confirming address 0/0" rule is a tested function rather than a disabled
 * attribute someone can drop in a refactor.
 */

import { CURRENCIES } from './currencies';

export interface ShopSettings {
  readonly businessName: string;
  readonly currency: string;
  /** Tax rate in basis points: 875 = 8.75%. */
  readonly taxBps: number;
  readonly taxInclusive: boolean;
  /** Tip presets in basis points, e.g. [0, 1000, 1500, 2000]. */
  readonly tipPresetsBps: readonly number[];
  readonly receiptFooter: string;
  /**
   * Chain-data endpoint. Empty means "use the public explorer for this network". A
   * merchant's own Esplora/electrs URL goes here; it is the difference between a third
   * party learning every address we watch and nobody learning anything.
   */
  readonly explorerUrl: string;
  /**
   * Optional rate source. Empty means "type the rate yourself", which is the safest default:
   * a shop that sells against a number it did not choose is a shop that can be mispriced by a
   * third party's outage.
   */
  readonly rateEndpoint: string;
  /** True when the merchant wants slip to fetch the rate instead of typing it. */
  readonly autoRate: boolean;
  /** Staff who can own a tip jar — each name points at a wallet id. Public keys only. */
  readonly staff: readonly { readonly name: string; readonly walletId: string }[];
  readonly language: 'en';
  readonly onboardedAt: string | null;
}

export const SETTINGS_KEY = 'slip.settings.v1';

export const DEFAULT_SETTINGS: ShopSettings = {
  businessName: '',
  currency: 'USD',
  taxBps: 0,
  taxInclusive: false,
  tipPresetsBps: [0, 1000, 1500, 2000],
  receiptFooter: '',
  explorerUrl: '',
  rateEndpoint: '',
  autoRate: false,
  staff: [],
  language: 'en',
  onboardedAt: null,
};

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const WIZARD_STEPS: ReadonlyArray<{ step: WizardStep; title: string; why: string }> = [
  { step: 1, title: 'Welcome', why: 'What slip is, and the one thing it will never ask for.' },
  { step: 2, title: 'Your shop', why: 'Name, currency and tax — the numbers every sale uses.' },
  { step: 3, title: 'Your wallet', why: 'Paste public material and confirm address 0/0 matches your wallet.' },
  { step: 4, title: 'Who holds the till', why: 'A PIN so you can hand the device to staff and back.' },
  { step: 5, title: 'Ready', why: 'A summary you can check before taking money.' },
];

export interface WizardState {
  readonly step: WizardStep;
  readonly settings: ShopSettings;
  /** True once a counter exists AND its address 0/0 was acknowledged. */
  readonly walletConfirmed: boolean;
  readonly pinSet: boolean;
  /** Set when the merchant explicitly chooses to skip the wallet step. */
  readonly walletSkipped: boolean;
}

export interface StepGate {
  readonly canAdvance: boolean;
  readonly reason?: string;
}

/** Whether the current step may be left. Pure, so it is testable and cannot drift. */
export function gateFor(state: WizardState): StepGate {
  switch (state.step) {
    case 1:
      return { canAdvance: true };
    case 2: {
      if (state.settings.businessName.trim().length < 2) {
        return { canAdvance: false, reason: 'give your shop a name — it appears on receipts' };
      }
      if (!CURRENCIES[state.settings.currency]) {
        return { canAdvance: false, reason: 'choose a currency' };
      }
      if (state.settings.taxBps < 0 || state.settings.taxBps > 10_000) {
        return { canAdvance: false, reason: 'tax must be between 0% and 100% (0–10000 basis points)' };
      }
      return { canAdvance: true };
    }
    case 3:
      if (state.walletConfirmed) return { canAdvance: true };
      if (state.walletSkipped) {
        return { canAdvance: false, reason: 'add a wallet first — a till with nowhere to pay is not a till' };
      }
      return {
        canAdvance: false,
        reason: 'paste your key and tick the box that address 0/0 matches your wallet',
      };
    case 4:
      // A PIN is strongly recommended but not required to reach the summary; the
      // hand-off will demand one the moment staff are involved.
      return { canAdvance: true };
    case 5:
      return { canAdvance: true };
    default:
      return { canAdvance: false, reason: 'unknown step' };
  }
}

export function nextStep(step: WizardStep): WizardStep {
  return step === 5 ? 5 : ((step + 1) as WizardStep);
}

export function previousStep(step: WizardStep): WizardStep {
  return step === 1 ? 1 : ((step - 1) as WizardStep);
}

/** Validates and clamps untrusted stored settings, reporting what it changed. */
export function sanitizeSettings(raw: unknown): { settings: ShopSettings; warnings: string[] } {
  const warnings: string[] = [];
  const input = (raw ?? {}) as Partial<ShopSettings>;

  const currency =
    typeof input.currency === 'string' && CURRENCIES[input.currency.toUpperCase()]
      ? input.currency.toUpperCase()
      : DEFAULT_SETTINGS.currency;
  if (input.currency && currency !== input.currency) {
    warnings.push(`currency "${input.currency}" is not an ISO 4217 code we know — using ${currency}`);
  }

  let taxBps = typeof input.taxBps === 'number' && Number.isFinite(input.taxBps) ? Math.round(input.taxBps) : 0;
  if (taxBps < 0 || taxBps > 10_000) {
    const clamped = Math.min(10_000, Math.max(0, taxBps));
    warnings.push(`tax ${taxBps}bps is outside 0–10000 — clamped to ${clamped}`);
    taxBps = clamped;
  }

  const presets = Array.isArray(input.tipPresetsBps)
    ? input.tipPresetsBps
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10_000)
        .map((n) => Math.round(n))
    : DEFAULT_SETTINGS.tipPresetsBps;

  return {
    settings: {
      businessName: typeof input.businessName === 'string' ? input.businessName.slice(0, 80) : '',
      currency,
      taxBps,
      taxInclusive: Boolean(input.taxInclusive),
      tipPresetsBps: presets.length > 0 ? [...new Set(presets)].sort((a, b) => a - b) : DEFAULT_SETTINGS.tipPresetsBps,
      receiptFooter: typeof input.receiptFooter === 'string' ? input.receiptFooter.slice(0, 200) : '',
      explorerUrl: (() => {
        const url = typeof input.explorerUrl === 'string' ? input.explorerUrl.trim() : '';
        if (url === '') return '';
        if (!/^https?:\/\/[^\s]+$/i.test(url)) {
          warnings.push(`explorer URL "${url.slice(0, 40)}" is not an http(s) URL — ignored, using the public default`);
          return '';
        }
        return url.replace(/\/+$/, '');
      })(),
      rateEndpoint: (() => {
        const url = typeof input.rateEndpoint === 'string' ? input.rateEndpoint.trim() : '';
        if (url === '') return '';
        if (!/^https?:\/\/[^\s]+$/i.test(url)) {
          warnings.push(`rate endpoint "${url.slice(0, 40)}" is not an http(s) URL — ignored`);
          return '';
        }
        return url.replace(/\/+$/, '');
      })(),
      // Auto-rate without an endpoint is a promise the app cannot keep, so it is off.
      autoRate: Boolean(input.autoRate),
      staff: Array.isArray(input.staff)
        ? input.staff
            .filter(
              (s): s is { name: string; walletId: string } =>
                Boolean(s) && typeof (s as { name?: unknown }).name === 'string' && typeof (s as { walletId?: unknown }).walletId === 'string',
            )
            .map((s) => ({ name: s.name.slice(0, 40), walletId: s.walletId.slice(0, 64) }))
            .slice(0, 20)
        : [],
      language: 'en',
      onboardedAt: typeof input.onboardedAt === 'string' ? input.onboardedAt : null,
    },
    warnings,
  };
}

export interface SettingsStoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSettings(store: SettingsStoreLike): { settings: ShopSettings; warnings: string[] } {
  const raw = store.getItem(SETTINGS_KEY);
  if (!raw) return { settings: DEFAULT_SETTINGS, warnings: [] };
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { settings: DEFAULT_SETTINGS, warnings: ['stored settings could not be read — starting fresh'] };
  }
}

export function saveSettings(store: SettingsStoreLike, settings: ShopSettings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isOnboarded(store: SettingsStoreLike): boolean {
  return loadSettings(store).settings.onboardedAt !== null;
}
