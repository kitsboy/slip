import KeyCheck from './ui/KeyCheck';
import Services from './ui/Services';

/**
 * slip — shell only (phase P0).
 *
 * This screen exists to prove the pipeline: strict TS, React, Tailwind, and a
 * single-file production build with a build-time CSP and a published hash.
 * There is deliberately NO selling UI here yet — a till that displays an address
 * before the derivation-preview safeguard exists would be the one bug that costs
 * a merchant money, so product screens land in later phases in a fixed order.
 */

export const BUILD_STAGE = 'P2 — key check online (no till yet)';

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tracking-tight">slip</span>
            <span className="text-xs text-muted">point of sale</span>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-[11px] uppercase tracking-widest text-muted">
            watch-only
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="text-2xl font-semibold leading-tight">
          Sells pay straight into your own wallet.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          slip never holds money, never asks for a seed phrase, and has no server,
          account or API key behind it. You paste public wallet material once —
          an xpub, a descriptor, a Silent Payments address or a Lightning address —
          and every sale is paid directly to you.
        </p>

        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            ['Stage', BUILD_STAGE],
            ['Assets', 'BTC · LTC · Lightning · Fedimint · Silent Payments'],
            ['Networks', 'mainnet · signet · testnet4 · LTC testnet'],
            ['Backend', 'none — by construction'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-surface p-4">
              <dt className="text-[11px] uppercase tracking-widest text-muted">{k}</dt>
              <dd className="mt-1 text-sm">{v}</dd>
            </div>
          ))}
        </dl>

        <KeyCheck />

        <Services />

        <p className="mt-8 rounded-xl border border-warn/40 p-4 text-sm text-warn">
          Not a till yet. The key check above is real, but there is no catalog, no
          invoice and no payment engine — those are the next phases in{' '}
          <code className="font-mono text-xs">SLIP-PLAN.md</code>. Nothing here can
          take a payment, and it will not pretend to.
        </p>
      </main>

      <footer className="border-t border-line px-5 py-4 text-center text-[11px] text-muted">
        no accounts · no analytics · no telemetry
      </footer>
    </div>
  );
}
