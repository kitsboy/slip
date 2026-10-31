/**
 * Section routing for slip's shell.
 *
 * Nova's NAV-MAP (docs/NAV-MAP.md): five tabs — Sell · Money in · Books · Setup · More —
 * plus a sixth, secondary destination, Learn (Manual + Services + About), reached from the
 * header "?" rather than the tab bar. Every pre-existing anchor and panel id aliases to the
 * section that now holds it, so old links, printed receipts and bookmarks keep working. The
 * location hash is the single source of truth; an unknown hash falls back to the default.
 *
 * The router knows nothing about panels or money. It maps hashes to sections and, for deep
 * links, preserves the panel identity so the shell can scroll to the exact panel after
 * activating its section. Strict matching on purpose: a hash is either exactly a section, or
 * exactly a known alias, or it lands on the default — no query-stripping, no case folding —
 * so junk and QR noise can never resolve somewhere surprising.
 */

export const TABS = ['sell', 'money', 'books', 'setup', 'more'] as const;
export type Tab = (typeof TABS)[number];

/** Learn is a sixth destination, reached from the header "?", not the tab bar. */
export const SECTIONS = ['sell', 'money', 'books', 'setup', 'more', 'learn'] as const;
export type Section = (typeof SECTIONS)[number];

export const DEFAULT_SECTION: Section = 'sell';

/**
 * The 21 audited data-panel ids (Nova's NAV-MAP §5). Every one must be routable via a
 * section; the shell scrolls to `[data-panel="<id>"]` when the hash names a panel, not just
 * a section. Kept here as the single contract so a test can assert "all panels are routed"
 * mechanically.
 */
export const PANEL_IDS: readonly string[] = [
  'till',
  'lightning',
  'requests',
  'history',
  'findsale',
  'anchor',
  'letter',
  'wallets',
  'assist',
  'settings',
  'backup',
  'verify',
  'selftest',
  'silentpay',
  'pair',
  'watchlist',
  'livetest',
  'wallclock',
  'manual',
  'demo-link',
  'explainer',
];

/**
 * Every legacy anchor / panel id → the section that now contains its panel, per NAV-MAP §1
 * + §4. `proof` is the one folded group (its instruments Verify/SelfTest now live in More);
 * Learn is a section in its own right (see SECTIONS), not an alias target.
 */
export const LEGACY_ALIASES: Readonly<Record<string, Section>> = {
  // folded group
  proof: 'more',
  // Sell
  till: 'sell',
  lightning: 'sell',
  // Money in
  requests: 'money',
  // Books
  history: 'books',
  findsale: 'books',
  anchor: 'books',
  letter: 'books',
  // Setup
  wallets: 'setup',
  assist: 'setup',
  settings: 'setup',
  backup: 'setup',
  // More
  verify: 'more',
  selftest: 'more',
  silentpay: 'more',
  pair: 'more',
  watchlist: 'more',
  livetest: 'more',
  wallclock: 'more',
  // Learn (secondary destination, header "?")
  manual: 'learn',
  'demo-link': 'learn',
  explainer: 'learn',
};

export interface HashResolution {
  readonly section: Section;
  /** The panel/alias named in the hash, if it was a panel rather than a bare section. */
  readonly panel: string | null;
}

export function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

/** Resolve a raw location hash (with or without a leading '#') to a section. */
export function sectionFromHash(raw: string | null): Section {
  return resolveHash(raw).section;
}

/**
 * Resolve a raw location hash to { section, panel }. `panel` is set when the hash named a
 * specific panel (e.g. `#verify` → { section: 'more', panel: 'verify' }) so the shell can
 * activate the section and then scroll the panel into view on the next frame.
 */
export function resolveHash(raw: string | null): HashResolution {
  const h = (raw ?? '').replace(/^#/, '');
  if (h === '') return { section: DEFAULT_SECTION, panel: null };
  if (isSection(h)) return { section: h, panel: null };
  const alias = LEGACY_ALIASES[h];
  return alias ? { section: alias, panel: h } : { section: DEFAULT_SECTION, panel: null };
}

/** The hash a section should sit at. */
export function hashForSection(section: Section): string {
  return `#${section}`;
}
