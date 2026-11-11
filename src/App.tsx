import { useEffect, useState } from 'react';
import About from './ui/About';
import Backup from './ui/Backup';
import AddressCheck from './ui/AddressCheck';
import Counters from './ui/Counters';
import KeyCheck from './ui/KeyCheck';
import PriceCheck from './ui/PriceCheck';
import RequestCounter from './ui/RequestCounter';
import Services from './ui/Services';
import Requests from './ui/Requests';
import Settings from './ui/Settings';
import Till from './ui/Till';
import Lightning from './ui/Lightning';
import FediCard from './ui/FediCard';
import { FEDI_CARD_ENABLED } from './core/fedi';
import AnchorPanel from './ui/AnchorPanel';
import Pair from './ui/Pair';
import Verify from './ui/Verify';
import Watchlist from './ui/Watchlist';
import History from './ui/History';
import SilentPay from './ui/SilentPay';
import Install from './ui/Install';
import InfoVideo from './ui/InfoVideo';
import HowItWorks from './ui/HowItWorks';
import Cannot from './ui/Cannot';
import LearnSearch from './ui/LearnSearch';
import { isSkinV2 } from './ui/skin';
import NextStep from './ui/NextStep';
import Tech, { Advanced } from './ui/Tech';
import Glossary from './ui/Glossary';
import Manual from './ui/Manual';
import BookSeal from './ui/BookSeal';
import SelfTest from './ui/SelfTest';
import WallClock from './ui/WallClock';
import WeeklyLetter from './ui/WeeklyLetter';
import LiveTest from './ui/LiveTest';
import { createRepository } from './core/accounts';
import { createLedger } from './core/ledger';
import TabIcon from './ui/TabIcon';
import { loadSettings } from './core/settings';
import Status from './ui/Status';
import { applyTheme, loadTheme, saveTheme, systemTheme, type Theme } from './core/theme';
import Readiness from './ui/Readiness';
import Wizard from './ui/Wizard';
import DemoBanner from './ui/DemoBanner';
import Footer from './ui/Footer';
import Watcher from './ui/Watcher';
import { buildLabel } from './core/buildinfo';
import { formatSats } from './core/money';
import { isOnboarded } from './core/settings';
import { isDemo, store as appStore } from './core/storage';
import { TABS, resolveHash, type Section, type Tab } from './core/tabs.router';

/**
 * slip — the shell.
 *
 * A working till and its surrounding instruments, organised by intent per Nova's NAV-MAP:
 * five tabs (Sell · Money in · Books · Setup · More) plus Learn behind the header "?". Every
 * section stays in the DOM and the inactive ones are hidden — never unmounted — so an
 * in-progress sale survives a peek at Books, and every `data-panel` id / deep link keeps
 * working. The hash is the single source of truth: tabs are plain anchors, back/forward is
 * free, and a panel alias (e.g. `#verify`) resolves to its section then scrolls to the panel.
 */

export const BUILD_STAGE = 'working till — sell, close the day, prove it';

const TRUST: ReadonlyArray<readonly [string, string]> = [
  ['watch-only', 'no key can be pasted'],
  ['offline', 'works with the network off'],
  ['0 requests', 'measured, not promised'],
];

const TAB_LABELS: Readonly<Record<Tab, string>> = {
  sell: 'Sell',
  money: 'Money in',
  books: 'Books',
  setup: 'Setup',
  more: 'More',
};

function TabBadge({
  tab,
  counts,
  floating,
}: {
  readonly tab: string;
  readonly counts: { waiting: number; wallets: number };
  readonly floating?: boolean;
}) {
  const label =
    tab === 'sell' && counts.waiting > 0
      ? String(counts.waiting)
      : tab === 'setup' && counts.wallets === 0
        ? '!'
        : null;
  if (!label) return null;
  const name = tab === 'sell' ? `${counts.waiting} waiting` : 'No wallet yet';
  if (floating) {
    // In a 52px tab the count would crowd the word, so the phone gets a dot on the corner.
    return (
      <span
        className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-bg"
        aria-label={name}
      />
    );
  }
  return (
    <span
      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-bg"
      aria-label={name}
    >
      {label}
    </span>
  );
}

export default function App() {
  // Shop settings are held in state and reloaded on `slip:settings-changed` (dispatched by
  // Settings when a toggle flips) so assistance panels — wall clock, live test, weekly
  // letter — mount and unmount live rather than waiting for a reload.
  const [shop, setShop] = useState(() => loadSettings(appStore()));
  useEffect(() => {
    const reload = () => setShop(loadSettings(appStore()));
    window.addEventListener('slip:settings-changed', reload);
    return () => window.removeEventListener('slip:settings-changed', reload);
  }, []);
  const assist = shop.settings.assist;
  // The wizard is a guided path, not a gate: a shop owner gets walked through it, a
  // visitor evaluating slip still sees what it is. Never force a stranger through five
  // screens before they can read the page.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Live, device-read counts for the tab bar. Not decoration: each one is something to do.
  const [shellCounts, setShellCounts] = useState<{ waiting: number; wallets: number; openAtoms: bigint | null; sold: boolean }>({
    waiting: 0,
    wallets: 0,
    openAtoms: null,
    sold: false,
  });
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const store = appStore();
      const prefersLight =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
          : false;
      return loadTheme(store) ?? systemTheme(prefersLight);
    } catch {
      return 'dark';
    }
  });
  const [activeSection, setActiveSection] = useState<Section>(
    () => resolveHash(window.location.hash).section,
  );
  const [navTick, setNavTick] = useState(0);

  useEffect(() => {
    const read = () => {
      try {
        const store = appStore();
        const { invoices } = createLedger(store).load();
        const { accounts } = createRepository(store).load();
        const open = invoices
          .filter((invoice) => invoice.status === 'awaiting' || invoice.status === 'seen')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        setShellCounts({
          waiting: invoices.filter((invoice) => invoice.status !== 'complete' && invoice.status !== 'expired').length,
          wallets: accounts.length,
          sold: invoices.some((invoice) => invoice.status === 'complete'),
          // A sale that is still waiting is a customer standing there. It stays reachable.
          openAtoms: open ? open.amountAtoms : null,
        });
      } catch {
        setShellCounts({ waiting: 0, wallets: 0, openAtoms: null, sold: false });
      }
    };
    read();
    window.addEventListener('slip:data-changed', read);
    return () => window.removeEventListener('slip:data-changed', read);
  }, []);

  // Type size and spacing are whole-page attributes, set once here so every panel obeys them
  // without knowing the setting exists.
  useEffect(() => {
    const apply = () => {
      try {
        const { settings } = loadSettings(appStore());
        document.documentElement.dataset.size = settings.textSize;
        document.documentElement.dataset.density = settings.density;
      } catch {
        /* a broken settings blob falls back to the stylesheet defaults */
      }
    };
    apply();
    window.addEventListener('slip:settings-changed', apply);
    return () => window.removeEventListener('slip:settings-changed', apply);
  }, []);

  useEffect(() => {
    applyTheme(theme, document.documentElement);
    if (document.documentElement.dataset.skin === 'v2') {
      const light = theme === 'light';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', light ? '#24201c' : '#17130f');
    }
    try {
      saveTheme(appStore(), theme);
    } catch {
      /* private mode: the choice simply does not persist */
    }
  }, [theme]);

  useEffect(() => {
    const onHash = () => {
      const { section } = resolveHash(window.location.hash);
      setActiveSection(section);
      setWizardOpen(false);
      // Bump on every hashchange, even one that lands on the current section, so panel-only
      // changes inside one section (#verify → #pair) still scroll.
      setNavTick((n) => n + 1);
    };
    window.addEventListener('hashchange', onHash);
    // A deep link on first paint (#books, #verify) may land before the browser re-anchors, or
    // point at a panel with no element id; scroll once after the first commit.
    if (window.location.hash) setNavTick(1);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Scroll after React has committed the section change — never inside the hashchange handler,
  // where the target section is still hidden. Keyed on navTick (not the section name) so a
  // panel-only change still moves the page. A panel alias without a matching `[data-panel]`
  // (e.g. the folded `#proof`) falls back to its section. `?.` guards scrollIntoView, which
  // jsdom does not implement.
  useEffect(() => {
    if (navTick === 0) return;
    const { section, panel } = resolveHash(window.location.hash);
    const el = panel
      ? (document.querySelector(`[data-panel="${panel}"]`) ??
        document.getElementById(section))
      : document.getElementById(section);
    el?.scrollIntoView?.({ block: 'start' });
  }, [navTick]);

  const onboarded = (() => {
    try {
      return isOnboarded(appStore());
    } catch {
      return false;
    }
  })();

  const v2 = document.documentElement.dataset.skin === 'v2';
  const tabClass = (t: Tab) =>
    v2
      ? activeSection === t
        ? 'v2-tab v2-tab-on'
        : 'v2-tab'
      : activeSection === t
        ? 'border-accent bg-accent/10 text-accent'
        : 'border-line text-muted hover:border-accent hover:text-accent';

  return (
    <div className="flex min-h-full flex-col" data-section={activeSection}>
      <Watcher />
      <header className="v2-head sticky top-0 z-20">
        {isDemo && <DemoBanner />}
        {
          <div className="v2-head-row">
            <div className="v2-head-tools">
              <a href="#learn" className="chip hover:text-ink" aria-label="Help and the manual">
                <span aria-hidden>?</span>
              </a>
              <button type="button" onClick={() => setWizardOpen(true)} className="chip hover:text-ink">
                {onboarded ? 'run setup again' : 'start setup'}
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="chip hover:text-ink"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="More: appearance, demo, version"
              >
                <span aria-hidden>⋯</span>
              </button>
            </div>
            <div className="v2-head-title">
              {onboarded && shellCounts.sold ? (
                <h1 className="v2-head-word">slip</h1>
              ) : (
                <span className="v2-head-word">slip</span>
              )}
              <span className="v2-head-sub">point of sale</span>
            </div>
            <img className="v2-head-logo" src="./slip-mark.png" alt="" />
          </div>
        }
        {menuOpen && (
          <div className="mx-auto w-full max-w-3xl px-5 pb-3" role="menu" aria-label="Appearance and about">
            <div className="panel p-3">
              <p className="eyebrow">Appearance</p>
              <div className="mt-2 grid gap-1">
                {(
                  [
                    ['dark', 'Dark', '◐'],
                    ['light', 'Light', '☀'],
                    ['contrast', 'High contrast', '◑'],
                  ] as const
                ).map(([value, label, glyph]) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={theme === value}
                    onClick={() => {
                      setTheme(value);
                      setMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                      theme === value ? 'bg-accent/10 text-ink' : 'text-secondary hover:text-ink'
                    }`}
                  >
                    <span aria-hidden className="w-4">{glyph}</span>
                    <span className="flex-1">{label}</span>
                    {theme === value && <span className="text-xs text-accent">in use</span>}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-2 text-xs text-muted">
                {!onboarded && (
                  <a href="?demo=1" target="_blank" rel="noreferrer noopener" className="underline decoration-dotted hover:text-ink">
                    Open the pretend shop
                  </a>
                )}
                <a href="#learn" className="underline decoration-dotted hover:text-ink" onClick={() => setMenuOpen(false)}>
                  Help and the manual
                </a>
                <span className="figure ml-auto">{buildLabel()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Slim top rail on tablet/desktop; phones get a bottom bar instead. */}
        <nav aria-label="Primary sections" className="hidden border-t border-line sm:block">
          <div className="mx-auto flex max-w-3xl gap-1 px-5 py-2">
            {TABS.map((t) => (
              <a
                key={t}
                href={`#${t}`}
                data-tab={t}
                onClick={() => setWizardOpen(false)}
                aria-current={activeSection === t ? 'location' : undefined}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${tabClass(t)}`}
              >
                <TabIcon tab={t} />
                {TAB_LABELS[t]}
                <TabBadge tab={t} counts={shellCounts} />
              </a>
            ))}
          </div>
        </nav>
      </header>

      {wizardOpen ? (
        <Wizard onDone={() => setWizardOpen(false)} />
      ) : (
        <>
          <a href="#sell" className="skip-link">
            Skip to the till
          </a>
          <main className="mx-auto w-full max-w-3xl px-5 pb-28 pt-6 sm:pb-16 lg:max-w-6xl">
            <section>
              {onboarded ? (
                /* A shop that has set up does not need to be sold the product again. The pitch
                   collapses to one line, and the till is the first thing on the screen. */
                <>
                <div className="flex flex-wrap items-end justify-between gap-3" data-hero="compact">
                  <div className="min-w-0">
                    {/* No eyebrow here: a shop that is already trading does not need to be told
                        again what it is looking at. */}
                    {!shellCounts.sold && (
                    <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                      A till that pays you, not a bank.
                    </h1>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <InfoVideo
                      src="videos/01-intro.mp4"
                      poster="videos/01-intro.jpg"
                      title="What slip is"
                      seconds={12}
                      label="What is slip? — 12s"
                    />
                    <a href="#learn" className="chip hover:text-ink">
                      How it works
                    </a>
                  </div>
                </div>
                {/* Still there for the day a new member of staff starts — folded, not removed. */}
                <details className="mt-2" data-hero-howto>
                  <summary className="cursor-pointer text-xs text-muted">How it works, in three steps</summary>
                  <HowItWorks onboarded={onboarded} onStart={() => setWizardOpen(true)} />
                </details>
                </>
              ) : isSkinV2() ? (
                <div className="v2-start">
                  <h1 className="v2-start-title">A till that pays you, not a bank.</h1>
                  <p className="v2-start-line">
                    Your customer pays with Bitcoin. Every sale lands in your own wallet. slip cannot
                    hold or move a penny.
                  </p>
                  <div className="v2-start-actions">
                    <button type="button" onClick={() => setWizardOpen(true)} className="btn btn-primary">
                      Set up my shop
                    </button>
                    <a className="btn btn-secondary" href="?demo=1" target="_blank" rel="noreferrer noopener">
                      See it with pretend sales
                    </a>
                  </div>
                  <div className="v2-start-quiet">
                    <InfoVideo
                      src="videos/01-intro.mp4"
                      poster="videos/01-intro.jpg"
                      title="What slip is"
                      seconds={12}
                      label="What is slip? — 12 seconds"
                    />
                    <details className="v2-start-more">
                      <summary>How it works</summary>
                      <HowItWorks onboarded={onboarded} onStart={() => setWizardOpen(true)} />
                    </details>
                  </div>
                </div>
              ) : (
                <>
                  <p className="eyebrow">a free till for Bitcoin</p>
                  <h1 className="mt-2 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
                    A till that pays you, not a bank.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
                    Your customer pays with Bitcoin. Every sale lands in your own wallet the moment it
                    happens — no card machine, no account with us, and nobody taking a cut. slip cannot
                    hold or move a penny: it shows the code, then tells you what it saw.
                  </p>

                  <div className="mt-4">
                    <InfoVideo
                      card
                      src="videos/01-intro.mp4"
                      poster="videos/01-intro.jpg"
                      title="What slip is"
                      seconds={12}
                      label="What is slip? — 12 seconds"
                    />
                  </div>

                  <HowItWorks onboarded={onboarded} onStart={() => setWizardOpen(true)} />
                </>
              )}

            </section>

            <Group
              id="sell"
              label="Sell"
              why="Ring up a customer"
              active={activeSection === 'sell'}
            >
              <NextStep />
              <Till />
              <Lightning />
            </Group>

            <Group
              id="money"
              label="Money in"
              why="Sales that arrive on a schedule"
              active={activeSection === 'money'}
            >
              <Requests />
            </Group>

            <Group
              id="books"
              label="Books"
              why="What you took, and the proof of it"
              active={activeSection === 'books'}
            >
              <History />
              {assist.weeklyLetter && <WeeklyLetter />}
              <AnchorPanel />
            </Group>

            <Group
              id="setup"
              label="Setup"
              why="Wallets, settings, backups, calculators"
              active={activeSection === 'setup'}
            >
              <Readiness />
              <Counters />
              <Settings />
              {FEDI_CARD_ENABLED ? <FediCard /> : null}
              <Backup />
              <Advanced>
                <KeyCheck />
              </Advanced>
              <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
                <PriceCheck />
                <AddressCheck />
              </div>
            </Group>

            <Group
              id="more"
              label="More"
              why="Watching, pairing, proving, a real test"
              active={activeSection === 'more'}
            >
              <Verify />
              <Advanced>
                <SelfTest />
                <SilentPay />
                <Pair />
                <Watchlist />
                {assist.liveTest && <LiveTest />}
                {assist.wallClock && <WallClock />}
              </Advanced>
            </Group>

            <Group
              id="learn"
              label="Learn"
              why="The manual, what slip will offer, and why it is built this way"
              active={activeSection === 'learn'}
            >
              <LearnSearch />
              <Cannot />
              <Tech>
                <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted">
                  slip never holds money, never asks for a seed phrase, and has no server, account or
                  API key behind it. You paste public wallet material once — an xpub, a descriptor, a
                  Silent Payments address or a Lightning address — and every sale is paid directly to
                  you.
                </p>

                <ul className="mt-3 flex flex-wrap gap-2">
                  {TRUST.map(([label, detail]) => (
                    <li key={label} className="chip" title={detail}>
                      <span className="text-ink">{label}</span>
                      <span className="opacity-70">· {detail}</span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Status', BUILD_STAGE],
                    ['Rails live', 'BTC · LTC · Lightning · Silent Payments (display)'],
                    ['Networks', 'mainnet · signet · testnet4 · LTC testnet'],
                    ['Backend', 'none — by construction'],
                  ].map(([k, v]) => (
                    <div key={k} className="panel">
                      <dt className="eyebrow">{k}</dt>
                      <dd className="mt-1 text-sm">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Tech>

              <Glossary />
              <Manual />
              <Services />
              <About />
            </Group>

            <p className="mt-6 rounded-xl border border-line p-4 text-sm leading-relaxed text-muted">
              Everything on this page is live and covered by tests. slip cannot hold, move, refund or
              recover money: there is no key here to do it with. What it can do is show an address,
              watch it, and tell you honestly what it saw.
            </p>
          </main>
        </>
      )}

      {/* Bottom tab bar on phones — five equal targets inside thumb reach. */}
      {shellCounts.openAtoms !== null && activeSection !== 'sell' && (
        <a
          href="#till"
          data-open-sale
          className="fixed bottom-[86px] left-1/2 z-30 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-bg shadow-lg"
        >
          A sale is still waiting · {formatSats(shellCounts.openAtoms)} · back to it
        </a>
      )}

      <nav
        aria-label="Primary sections (phone)"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((t) => (
          <a
            key={t}
            href={`#${t}`}
            data-tab={t}
            onClick={() => setWizardOpen(false)}
            aria-current={activeSection === t ? 'location' : undefined}
            aria-label={TAB_LABELS[t]}
            className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              document.documentElement.dataset.skin === 'v2'
                ? activeSection === t
                  ? 'v2-tab v2-tab-on'
                  : 'v2-tab'
                : activeSection === t
                  ? 'text-accent'
                  : 'text-muted'
            }`}
          >
            <TabIcon tab={t} />
            {t === 'money' ? 'Money' : TAB_LABELS[t]}
            <TabBadge tab={t} counts={shellCounts} floating />
          </a>
        ))}
      </nav>

      {isSkinV2() ? (
        <Footer />
      ) : (
        <footer className="border-t border-line px-5 pb-24 pt-6 sm:pb-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
            <span className="chip figure">{buildLabel()}</span>
            <BookSeal />
            {loadSettings(appStore()).settings.signature.trim() && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted" data-brand="giveabit">
                <span aria-hidden>₿</span>
                <a
                  href="https://giveabit.io"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted hover:text-ink"
                >
                  {loadSettings(appStore()).settings.signature.trim()}
                </a>
              </span>
            )}
            <Status />
            <InfoVideo
              src="videos/03-status-strip.mp4"
              poster="videos/03-status-strip.jpg"
              title="Status, rails, networks, backend"
              seconds={17}
            />
            <Install />
            <RequestCounter />
            <span className="text-[11px] text-muted">
              no accounts · no analytics · no telemetry · MIT licensed
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}

/**
 * A page section with a name and a reason.
 *
 * The reason is the point: a merchant scanning the page should be able to decide "not that one"
 * in a second, without reading every panel underneath. Sections are hidden rather than
 * unmounted, so deep links and in-progress state survive a tab switch.
 */
function Group({
  id,
  label,
  why,
  active,
  children,
}: {
  id: string;
  label: string;
  why: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`mt-10 scroll-mt-16 sm:scroll-mt-24 ${document.documentElement.dataset.skin === 'v2' ? 'v2-section' : ''}`}
      hidden={!active}
    >
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</h2>
        <span className="text-[11px] text-muted/80">{why}</span>
      </div>
      {id === 'learn' && document.documentElement.dataset.skin === 'v2' ? (
        <details className="v2-learn" open>
          <summary>The manual</summary>
          {children}
        </details>
      ) : (
        children
      )}
    </section>
  );
}
