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
  /**
   * Assistance. Every one of these adds words or widgets to the screen, so each is a switch: a
   * merchant who wants a clean counter turns things off, and a vendor shipping to a busy shop can
   * ship it quiet by default.
   */
  readonly assist: AssistOptions;
  /**
   * The small credit that rides on a payment label. Empty means "say nothing", which a shop is
   * free to choose; the app never stamps itself across the screen.
   */
  readonly signature: string;
  /**
   * How big the type is and how tightly the cards pack.
   *
   * Two of the three people behind a counter are over forty. A POS that only fits a 25-year-old's
   * eyesight gets zoomed with the browser and then looks broken, so the app offers the choice itself
   * and remembers it. Both values are whole-page, never per-panel.
   */
  readonly textSize: 'normal' | 'large';
  readonly density: 'comfortable' | 'compact';
  readonly language: 'en';
  readonly onboardedAt: string | null;
}

export interface AssistOptions {
  /** Tap a figure to see one plain sentence about what it is. */
  readonly explainNumbers: boolean;
  /** Practise a sale end to end with no ledger entry and no money expected. */
  readonly rehearsal: boolean;
  /** Small hints under fields, for a first week of use. */
  readonly hints: boolean;
  /** Age rings on fetched numbers (rate, balance). */
  readonly freshnessRings: boolean;
  /** The day digest in the footer. */
  readonly bookSeal: boolean;
  /** A three-line note when the till changes hands. */
  readonly handoverNote: boolean;
  /** The printable counter card (rules for staff). Always available from Settings when off. */
  readonly counterCard: boolean;
  /** A big quiet clock with today's takings, for the hours between customers. */
  readonly wallClock: boolean;
  /** The weekly letter: a week's takings written as sentences, printable. */
  readonly weeklyLetter: boolean;
  /** A short chime when money lands. A cue is a courtesy; it never changes an invoice. */
  readonly soundOnPayment: boolean;
  /** The real-money 100 sat test. Off by default: it spends money, however little. */
  readonly liveTest: boolean;
  /**
   * Show the technical names — xpub, LNURL, mempool, descriptor, BIP-85.
   *
   * Off by default, and that is a product decision, not a preference: a shopkeeper who wanted to
   * take a payment should never have to read the word "xpub" to do it. The exact terms stay one
   * toggle away for the person who wants them, and nothing is removed from the app.
   */
  readonly showTechnical: boolean;
}

export const DEFAULT_ASSIST: AssistOptions = {
  explainNumbers: true,
  rehearsal: false,
  hints: true,
  freshnessRings: true,
  bookSeal: true,
  handoverNote: true,
  counterCard: true,
  wallClock: false,
  weeklyLetter: false,
  soundOnPayment: true,
  liveTest: false,
  showTechnical: false,
};

export const ASSIST_LABELS: Readonly<Record<keyof AssistOptions, { title: string; why: string }>> = {
  explainNumbers: { title: 'Explain a number when I tap it', why: 'One plain sentence about what a figure means. Nothing changes, nothing is sent.' },
  rehearsal: { title: 'Rehearsal mode', why: 'Practise a whole sale with a real QR. No ledger entry, no proof, and the receipt says REHEARSAL.' },
  hints: { title: 'Show hints', why: 'Short helper lines under fields, for the first week or two.' },
  freshnessRings: { title: 'Show age rings', why: 'A ring that drains as a rate or balance gets older. Turn it off if you read ages elsewhere.' },
  bookSeal: { title: 'Show the day digest in the footer', why: 'Today\u2019s book hash, changing as sales land. Quiet proof, or noise — your call.' },
  handoverNote: { title: 'Note when the till changes hands', why: 'A three-line summary for whoever takes over: parked sales, refunds, stale rate.' },
  counterCard: { title: 'Offer the printable counter card', why: 'A one-page A4 of the rules for staff, for the wall behind the till.' },
  wallClock: { title: 'Quiet clock mode', why: 'A big clock with today\u2019s takings, for the gaps between customers.' },
  weeklyLetter: { title: 'Weekly letter', why: 'A week of takings written as sentences you can print and keep.' },
  soundOnPayment: { title: 'Chime when money lands', why: 'A short tone when a sale settles, and a duller one when money is seen but not yet mined. It never changes an invoice. Mute it in a quiet shop.' },
  showTechnical: {
    title: 'Show technical names',
    why: 'The exact technical wording, for the person who wants it. Off by default, because a shop that just wants to take a payment should never have to read it.',
  },
  liveTest: { title: 'Live 100 sat test', why: 'A real invoice for one hundred sats, on Lightning or signet, to prove a rail works before you trust it.' },
};

export const ASSIST_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  why: string;
  keys: readonly (keyof AssistOptions)[];
}> = [
  {
    id: 'explain',
    label: 'Plain language',
    why: 'How much of the technical side you want to see.',
    keys: ['showTechnical'],
  },
  {
    id: 'teaching',
    label: 'Teaching',
    why: 'For the first week, or a new member of staff.',
    keys: ['explainNumbers', 'hints', 'rehearsal'],
  },
  {
    id: 'quiet',
    label: 'Quiet the counter',
    why: 'Turn these off when the counter gets busy.',
    keys: ['freshnessRings', 'bookSeal', 'wallClock', 'handoverNote', 'counterCard', 'soundOnPayment'],
  },
  {
    id: 'records',
    label: 'Records and testing',
    why: 'The week on paper, and proving a rail works.',
    keys: ['weeklyLetter', 'liveTest'],
  },
];

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
  assist: DEFAULT_ASSIST,
  signature: 'giveabit.io',
  textSize: 'normal',
  density: 'comfortable',
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
      // Unknown keys are dropped rather than trusted, so an older settings blob cannot switch on
      // a behaviour this build does not have.
      signature: (() => {
        if (typeof input.signature !== 'string') return 'giveabit.io';
        const clean = input.signature.trim().slice(0, 40);
        return /^[\w .@:/+-]*$/.test(clean) ? clean : 'giveabit.io';
      })(),
      // Display preferences survive an older stored file: anything unrecognised falls back.
      textSize: input.textSize === 'large' ? 'large' : 'normal',
      density: input.density === 'compact' ? 'compact' : 'comfortable',
      assist: (() => {
        const raw = (input.assist ?? {}) as Partial<Record<keyof AssistOptions, unknown>>;
        const out = { ...DEFAULT_ASSIST };
        for (const key of Object.keys(DEFAULT_ASSIST) as (keyof AssistOptions)[]) {
          if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
        }
        return out;
      })(),
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
