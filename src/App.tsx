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
import AnchorPanel from './ui/AnchorPanel';
import Pair from './ui/Pair';
import Verify from './ui/Verify';
import Watchlist from './ui/Watchlist';
import History from './ui/History';
import SilentPay from './ui/SilentPay';
import Install from './ui/Install';
import InfoVideo from './ui/InfoVideo';
import HowItWorks from './ui/HowItWorks';
import NextStep from './ui/NextStep';
import Tech, { Advanced } from './ui/Tech';
import Manual from './ui/Manual';
import BookSeal from './ui/BookSeal';
import SelfTest from './ui/SelfTest';
import WallClock from './ui/WallClock';
import WeeklyLetter from './ui/WeeklyLetter';
import LiveTest from './ui/LiveTest';
import { loadSettings } from './core/settings';
import Status from './ui/Status';
import { applyTheme, loadTheme, nextTheme, saveTheme, systemTheme, themeLabel, type Theme } from './core/theme';
import Wizard from './ui/Wizard';
import Watcher from './ui/Watcher';
import { buildLabel } from './core/buildinfo';
import { isOnboarded } from './core/settings';
import { store as appStore } from './core/storage';
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
    applyTheme(theme, document.documentElement);
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

  const tabClass = (t: Tab) =>
    activeSection === t
      ? 'border-accent bg-accent/10 text-accent'
      : 'border-line text-muted hover:border-accent hover:text-accent';

  return (
    <div className="flex min-h-full flex-col">
      <Watcher />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-bg"
            >
              s
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">slip</span>
              <span className="hidden text-xs text-muted sm:inline">point of sale</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="chip figure hidden sm:inline-flex">{buildLabel()}</span>
            {!onboarded && (
              <a
                href="?demo=1"
                target="_blank"
                rel="noreferrer noopener"
                className="chip hidden border-warn text-warn sm:inline-flex"
              >
                Demo
              </a>
            )}
            <button
              type="button"
              onClick={() => setTheme(nextTheme(theme))}
              className="chip hover:text-ink"
              aria-label={`Theme: ${themeLabel(theme)}. Switch theme.`}
              title={`Theme: ${themeLabel(theme)}`}
            >
              <span aria-hidden>{theme === 'dark' ? '◐' : theme === 'light' ? '☀' : '◑'}</span>
              {themeLabel(theme)}
            </button>
            <a href="#learn" className="chip hover:text-ink" aria-label="Help and the manual">
              <span aria-hidden>?</span>
            </a>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="chip hover:text-ink"
            >
              {onboarded ? 'run setup again' : 'start setup'}
            </button>
          </div>
        </div>
        {/* Slim top rail on tablet/desktop; phones get a bottom bar instead. */}
        <nav aria-label="Primary sections" className="hidden border-t border-line sm:block">
          <div className="mx-auto flex max-w-3xl gap-1 px-5 py-2">
            {TABS.map((t) => (
              <a
                key={t}
                href={`#${t}`}
                data-tab={t}
                aria-current={activeSection === t ? 'location' : undefined}
                className={`inline-flex min-h-10 items-center justify-center rounded-full border px-3 text-xs transition-colors ${tabClass(t)}`}
              >
                {TAB_LABELS[t]}
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
          <main className="mx-auto w-full max-w-3xl px-5 pb-28 pt-6 sm:pb-16">
            <section>
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
                  src="videos/01-intro.mp4"
                  poster="videos/01-intro.jpg"
                  title="What slip is"
                  seconds={12}
                  label="Watch: what is slip?"
                />
              </div>

              <HowItWorks onboarded={onboarded} onStart={() => setWizardOpen(true)} />

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
              <Counters />
              <Settings />
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
      <nav
        aria-label="Primary sections (phone)"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((t) => (
          <a
            key={t}
            href={`#${t}`}
            data-tab={t}
            aria-current={activeSection === t ? 'location' : undefined}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              activeSection === t ? 'text-accent' : 'text-muted'
            }`}
          >
            {TAB_LABELS[t]}
          </a>
        ))}
      </nav>

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
    <section id={id} className="mt-10 scroll-mt-16 sm:scroll-mt-24" hidden={!active}>
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</h2>
        <span className="text-[11px] text-muted/80">{why}</span>
      </div>
      {children}
    </section>
  );
}
