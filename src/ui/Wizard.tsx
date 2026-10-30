/**
 * Setup wizard — five screens, in the order a shop actually works.
 *
 * The workbench below it answers "what can this do?"; a stranger needs "what do I do
 * first?". Same components, sequenced, with the derivation gate enforced between screens
 * (see `gateFor` — the rule lives in core and is tested, not in a disabled attribute).
 */

import { useCallback, useMemo, useState } from 'react';
import { CURRENCIES } from '../core/currencies';
import {
  WIZARD_STEPS,
  gateFor,
  nextStep,
  previousStep,
  saveSettings,
  sanitizeSettings,
  type ShopSettings,
  type WizardState,
  type WizardStep,
} from '../core/settings';
import { createRepository, validateAccountInput } from '../core/accounts';
import { hashPin, isValidPin } from '../core/pin';
import type { Coin, NetworkId } from '../core/network';

const NETWORKS: Array<{ id: NetworkId; coin: Coin; label: string }> = [
  { id: 'btc-signet', coin: 'btc', label: 'Bitcoin Signet (test)' },
  { id: 'btc-testnet4', coin: 'btc', label: 'Bitcoin Testnet4 (test)' },
  { id: 'btc-mainnet', coin: 'btc', label: 'Bitcoin mainnet' },
  { id: 'ltc-testnet', coin: 'ltc', label: 'Litecoin testnet (test)' },
  { id: 'ltc-mainnet', coin: 'ltc', label: 'Litecoin mainnet' },
];

const COMMON = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'MXN', 'KWD', 'VND'];

export default function Wizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [taxPercent, setTaxPercent] = useState('0');
  const [label, setLabel] = useState('Front counter');
  const [networkId, setNetworkId] = useState<NetworkId>('btc-signet');
  const [xpub, setXpub] = useState('');
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState('');
  const [walletConfirmed, setWalletConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const coin = NETWORKS.find((n) => n.id === networkId)?.coin ?? 'btc';

  const settings: ShopSettings = useMemo(
    () =>
      sanitizeSettings({
        businessName,
        currency,
        taxBps: Math.round(Number(taxPercent || '0') * 100),
        tipPresetsBps: [0, 1000, 1500, 2000],
      }).settings,
    [businessName, currency, taxPercent],
  );

  const state: WizardState = useMemo(
    () => ({ step, settings, walletConfirmed, pinSet: pin.length > 0, walletSkipped: false }),
    [step, settings, walletConfirmed, pin],
  );
  const gate = gateFor(state);

  const validation = useMemo(() => {
    if (!xpub.trim()) return null;
    return validateAccountInput({ label: label || 'counter', xpub, coin, networkId });
  }, [xpub, label, coin, networkId]);

  const saveWallet = useCallback(() => {
    if (!validation || !validation.ok || !checked) return;
    const repo = createRepository(window.localStorage);
    const account = repo.addAccount(validation);
    repo.acknowledge(account.id);
    void repo.recordShift('account-added', account, null, 'created during setup');
    void repo.recordShift('acknowledge', account, null, 'address 0/0 confirmed during setup');
    setWalletConfirmed(true);
    setMessage(`${account.label} saved — address 0/0 is ${account.firstAddress}`);
  }, [validation, checked]);

  async function savePin() {
    if (!isValidPin(pin)) {
      setMessage('A PIN is 4 to 8 digits.');
      return;
    }
    const repo = createRepository(window.localStorage);
    repo.setPin(await hashPin(pin));
    void repo.recordShift('pin-set', null, null, 'PIN set during setup');
    setMessage('PIN set — only a hash is stored on this device.');
  }

  function finish() {
    const store = window.localStorage;
    saveSettings(store, { ...settings, onboardedAt: new Date().toISOString() });
    onDone();
  }

  const stepper = WIZARD_STEPS.find((s) => s.step === step);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10">
      <div className="flex items-center gap-2">
        {WIZARD_STEPS.map((s) => (
          <span
            key={s.step}
            aria-hidden
            className={`h-1 flex-1 rounded-full ${s.step <= step ? 'bg-accent' : 'bg-line'}`}
          />
        ))}
      </div>
      <p className="eyebrow mt-4">
        step {step} of 5 · {stepper?.title}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{stepper?.title}</h1>
      <p className="mt-1 text-sm text-muted">{stepper?.why}</p>

      {step === 1 && (
        <div className="mt-6 panel">
          <p className="text-sm leading-relaxed">
            slip turns this device into a till that pays <span className="text-ink">straight into
            your own wallet</span>. It has no server, no account and no way to spend — so there is
            nothing for us to hold, freeze or lose.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-warn">
            It will never ask for your seed phrase. If anything ever does, it is not slip.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            <li>· works offline once loaded</li>
            <li>· you paste public keys only — never a private one</li>
            <li>· start on a test network until a full sale works</li>
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 panel">
          <label className="block" htmlFor="wz-name">
            <span className="eyebrow">Shop name (appears on receipts)</span>
            <input
              id="wz-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Corner Coffee"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block" htmlFor="wz-currency">
              <span className="eyebrow">Currency</span>
              <select
                id="wz-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
              >
                {COMMON.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCIES[c]?.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor="wz-tax">
              <span className="eyebrow">Tax % (0 if none)</span>
              <input
                id="wz-tax"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 panel">
          <label className="block" htmlFor="wz-label">
            <span className="eyebrow">Counter name</span>
            <input
              id="wz-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="mt-3 block" htmlFor="wz-network">
            <span className="eyebrow">Network</span>
            <select
              id="wz-network"
              value={networkId}
              onChange={(e) => setNetworkId(e.target.value as NetworkId)}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            >
              {NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block" htmlFor="wz-xpub">
            <span className="eyebrow">Account xpub or descriptor</span>
            <textarea
              id="wz-xpub"
              value={xpub}
              onChange={(e) => setXpub(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="zpub6… or wpkh(zpub…/0/*)"
              className="mt-1 w-full resize-y rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
            />
          </label>

          {validation && !validation.ok && (
            <p className="mt-2 rounded-lg border border-warn p-2 text-xs text-warn" role="alert">
              {validation.error}
            </p>
          )}

          {validation && validation.ok && (
            <>
              <ol className="mt-3 space-y-1">
                {validation.draft.preview.slice(0, 3).map((a) => (
                  <li key={a.address} className="flex gap-2 rounded border border-line px-2 py-1">
                    <span className="w-10 shrink-0 text-[10px] text-muted">{a.path}</span>
                    <code className="break-all font-mono text-[11px]">{a.address}</code>
                  </li>
                ))}
              </ol>
              <label className="mt-2 flex items-start gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I opened my wallet and address 0/0 is{' '}
                  <span className="font-mono text-ink">{validation.draft.firstAddress}</span>
                </span>
              </label>
              <button
                type="button"
                onClick={saveWallet}
                disabled={!checked || walletConfirmed}
                className="mt-2 rounded-lg border border-accent px-3 py-2 text-xs uppercase tracking-wider text-accent disabled:border-line disabled:text-muted"
              >
                {walletConfirmed ? 'saved' : 'Save wallet'}
              </button>
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 panel">
          <label className="block" htmlFor="wz-pin">
            <span className="eyebrow">Till PIN (4–8 digits)</span>
            <input
              id="wz-pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => void savePin()}
            className="mt-2 rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink"
          >
            Set PIN
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The PIN names who is holding the device and blocks a silent counter switch. Only a hash
            is stored here, and it can never move money. You can skip this and set it later — the
            hand-off will ask for it.
          </p>
        </div>
      )}

      {step === 5 && (
        <div className="mt-6 panel">
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ['Shop', businessName || '—'],
              ['Currency', currency],
              ['Tax', `${taxPercent || '0'}%`],
              ['Wallet', walletConfirmed ? 'confirmed' : 'not confirmed'],
              ['PIN', pin ? 'set' : 'not set'],
              ['Stage', 'no till yet — counters and price maths only'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line px-3 py-2">
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-0.5 text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-warn">
            slip cannot take a payment yet. The catalog, invoice and payment engine are the next
            phases — this setup records your shop so the till can use it the moment they land.
          </p>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 rounded-lg border border-line p-2 text-xs text-muted">
          {message}
        </p>
      )}

      {!gate.canAdvance && gate.reason && (
        <p className="mt-3 text-[11px] text-warn">{gate.reason}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStep(previousStep(step))}
          disabled={step === 1}
          className="rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink disabled:opacity-40"
        >
          Back
        </button>
        {step < 5 ? (
          <button
            type="button"
            onClick={() => setStep(nextStep(step))}
            disabled={!gate.canAdvance}
            className="rounded-lg border border-accent px-4 py-2 text-xs uppercase tracking-wider text-accent disabled:border-line disabled:text-muted"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="rounded-lg border border-accent bg-accent/10 px-4 py-2 text-xs uppercase tracking-wider text-accent"
          >
            Finish setup
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="ml-auto text-[11px] uppercase tracking-wider text-muted underline hover:text-ink"
        >
          skip to the workbench
        </button>
      </div>
    </div>
  );
}
