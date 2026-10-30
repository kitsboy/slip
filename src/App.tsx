import { useState } from 'react';
import About from './ui/About';
import Backup from './ui/Backup';
import AddressCheck from './ui/AddressCheck';
import Counters from './ui/Counters';
import KeyCheck from './ui/KeyCheck';
import PriceCheck from './ui/PriceCheck';
import RequestCounter from './ui/RequestCounter';
import Services from './ui/Services';
import Wizard from './ui/Wizard';
import { buildLabel } from './core/buildinfo';
import { isOnboarded } from './core/settings';

/**
 * slip — the shell.
 *
 * Deliberately not a till yet: no catalog, no invoice, no payment engine. The panels
 * below are real and tested, and the page says exactly that — a till that shows a
 * receive address before the derivation gate exists is the one bug that costs a
 * merchant money, so screens land in a fixed order (SLIP-PLAN.md §7).
 */

export const BUILD_STAGE = 'P6 — counters, descriptors, backup, shift log (no till yet)';

const TRUST: ReadonlyArray<readonly [string, string]> = [
  ['watch-only', 'no key can be pasted'],
  ['no backend', 'no server, account or key'],
  ['offline', 'works with the network off'],
  ['0 requests', 'measured, not promised'],
];

export default function App() {
  // The wizard is a guided path, not a gate: a shop owner gets walked through it, a
  // visitor evaluating slip still sees what it is. Never force a stranger through five
  // screens before they can read the page.
  const [wizardOpen, setWizardOpen] = useState(false);
  const onboarded = (() => {
    try {
      return isOnboarded(window.localStorage);
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-10">
        <section>
          <p className="eyebrow">non-custodial · serverless · no KYC</p>
          <h1 className="mt-2 text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            Sells pay straight into your own wallet.
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
            ['Stage', BUILD_STAGE],
            ['Planned rails', 'BTC · LTC · Lightning · Fedimint · Silent Payments'],
            ['Networks', 'mainnet · signet · testnet4 · LTC testnet'],
            ['Backend', 'none — by construction'],
          ].map(([k, v]) => (
            <div key={k} className="panel">
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1 text-sm">{v}</dd>
            </div>
          ))}
        </section>

        <Counters />

        <Backup />

        <KeyCheck />

        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <PriceCheck />
          <AddressCheck />
        </div>

        <Services />

        <About />

        <p className="mt-6 rounded-xl border border-warn/40 bg-warn/5 p-4 text-sm leading-relaxed text-warn">
          Not a till yet. The counters, key check, price maths and address check above are real
          and tested, but there is no catalog, no invoice and no payment engine — those are the
          next phases in <code className="font-mono text-xs">SLIP-PLAN.md</code>. Nothing here
          can take a payment, and it will not pretend to.
        </p>
      </main>
      )}

      <footer className="border-t border-line px-5 py-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
          <span className="chip figure">{buildLabel()}</span>
          <RequestCounter />
          <span className="text-[11px] text-muted">
            no accounts · no analytics · no telemetry · MIT licensed
          </span>
        </div>
      </footer>
    </div>
  );
}
