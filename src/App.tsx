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
import { buildLabel } from './core/buildinfo';
import { isOnboarded } from './core/settings';
import { store as appStore } from './core/storage';

/**
 * slip — the shell.
 *
 * A working till and its surrounding instruments. The page is ordered by what a shopkeeper is
 * trying to do — sell, see the money in, close the books, prove something, set up, learn — and
 * every surface is real, tested and documented (docs/FEATURE-MAP.md).
 */

export const BUILD_STAGE = 'working till — sell, close the day, prove it';

const TRUST: ReadonlyArray<readonly [string, string]> = [
  ['watch-only', 'no key can be pasted'],
  ['no backend', 'no server, account or key'],
  ['offline', 'works with the network off'],
  ['0 requests', 'measured, not promised'],
];

export default function App() {
  const assist = loadSettings(appStore()).settings.assist;
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

  useEffect(() => {
    applyTheme(theme, document.documentElement);
    try {
      saveTheme(appStore(), theme);
    } catch {
      /* private mode: the choice simply does not persist */
    }
  }, [theme]);
  const onboarded = (() => {
    try {
      return isOnboarded(appStore());
    } catch {
      return false;
    }
  })();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
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
          <div className="flex items-center gap-2">
            <span className="chip figure hidden sm:inline-flex">{buildLabel()}</span>
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
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="chip chip-accent hover:bg-accent/10"
            >
              {onboarded ? 'run setup again' : 'start setup'}
            </button>
          </div>
        </div>
      </header>

      {wizardOpen ? (
        <Wizard onDone={() => setWizardOpen(false)} />
      ) : (
      <>
        <a href="#sell" className="skip-link">
          Skip to the till
        </a>
        <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6">
        <section>
          <p className="eyebrow">non-custodial · serverless · no KYC</p>
          <h1 className="mt-2 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Sales pay straight into your own wallet.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            slip never holds money, never asks for a seed phrase, and has no server, account or
            API key behind it. You paste public wallet material once — an xpub, a descriptor, a
            Silent Payments address or a Lightning address — and every sale is paid directly to
            you.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="rounded-lg border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-wider text-accent"
            >
              {onboarded ? 'run setup again' : 'set up your shop'}
            </button>
            <span className="text-[11px] text-muted">five screens · about a minute</span>
          </div>

          <ul className="mt-4 flex flex-wrap gap-2">
            {TRUST.map(([label, detail]) => (
              <li key={label} className="chip" title={detail}>
                <span className="text-ink">{label}</span>
                <span className="opacity-70">· {detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
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
        </section>

        {assist.wallClock && <WallClock />}

        {/* The page is long by design, so it is navigable by intent rather than by scroll. */}
        <nav
          aria-label="Sections"
          className="sticky top-0 z-20 mt-4 flex w-full gap-1 overflow-x-auto border-y border-line bg-bg/95 px-1 py-2 backdrop-blur"
        >
          {[
            ['sell', 'Sell'],
            ['money', 'Money in'],
            ['books', 'Books'],
            ['proof', 'Proof'],
            ['setup', 'Setup'],
            ['more', 'More'],
            ['learn', 'Learn'],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              {label}
            </a>
          ))}
          <a
            href="?demo=1"
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-full border border-warn px-3 py-1 text-[11px] text-warn"
          >
            Demo
          </a>
        </nav>

        <Group id="sell" label="Sell" why="Ring up a customer">
          <Till />
          <Lightning />
        </Group>

        <Group id="money" label="Money in" why="Sales that arrive on a schedule">
          <Requests />
        </Group>

        <Group id="books" label="Books" why="What you took, and the proof of it">
          <History />
          {assist.weeklyLetter && <WeeklyLetter />}
          <AnchorPanel />
        </Group>

        <Group id="proof" label="Proof" why="Check a receipt, check the app itself">
          <Verify />
          <SelfTest />
        </Group>

        <Group id="setup" label="Setup" why="Wallets, settings, backups, calculators">
          <Counters />
          <Settings />
          <Backup />
          <KeyCheck />
          <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
            <PriceCheck />
            <AddressCheck />
          </div>
        </Group>

        <Group id="more" label="More" why="Watching, pairing, privacy rails, a real test">
          <SilentPay />
          <Pair />
          <Watchlist />
          {assist.liveTest && <LiveTest />}
        </Group>

        <Group id="learn" label="Learn" why="The manual, what slip will offer, and why it is built this way">
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

      <footer className="border-t border-line px-5 py-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
          <span className="chip figure">{buildLabel()}</span>
          <BookSeal />
          {loadSettings(appStore()).settings.signature.trim() && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted" data-brand="giveabit">
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
 * in a second, without reading every panel underneath.
 */
function Group({
  id,
  label,
  why,
  children,
}: {
  id: string;
  label: string;
  why: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-16">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line pb-1">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</h2>
        <span className="text-[10px] text-muted/80">{why}</span>
      </div>
      {children}
    </section>
  );
}
