/**
 * Setup wizard — five screens, in the order a shop actually works.
 *
 * The workbench below it answers "what can this do?"; a stranger needs "what do I do
 * first?". Same components, sequenced, with the derivation gate enforced between screens
 * (see `gateFor` — the rule lives in core and is tested, not in a disabled attribute).
 *
 * The one rule is demonstrated, not just stated: pasting a seed phrase or a private key into
 * any key field is refused on the spot, the field is emptied, and nothing is stored. The wizard
 * ENDS on the compare-address moment — the address 0/0 must be checked against the merchant's own
 * wallet before the counter opens.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import AddressText from './AddressText';
import { isSkinV2 } from './skin';
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
import WalletPicker from './WalletPicker';
import { CameraCapture } from './Scan';
import { publicCodeFromScan } from '../core/scanner';
import { assertNotSecret, SecretRefused, type SecretKind } from '../core/keys';
import { setCompareStopped } from '../core/compare-stop';
import { hashPin, isValidPin } from '../core/pin';
import type { Coin, NetworkId } from '../core/network';
import { store as appStore } from '../core/storage';

const NETWORKS: Array<{ id: NetworkId; coin: Coin; label: string }> = [
  { id: 'btc-signet', coin: 'btc', label: 'Bitcoin Signet (test)' },
  { id: 'btc-testnet4', coin: 'btc', label: 'Bitcoin Testnet4 (test)' },
  { id: 'btc-mainnet', coin: 'btc', label: 'Bitcoin mainnet' },
  { id: 'ltc-testnet', coin: 'ltc', label: 'Litecoin testnet (test)' },
  { id: 'ltc-mainnet', coin: 'ltc', label: 'Litecoin mainnet' },
];

const COMMON = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'MXN', 'KWD', 'VND'];

/** Refusal copy names the KIND and never repeats the material (red = danger only). */
function refusalCopy(kind: SecretKind): string {
  return kind === 'seed phrase'
    ? "That's a recovery phrase. slip can never hold it — paste your public wallet address instead."
    : "That's a private key. slip can never hold it — paste your public wallet address instead.";
}

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
  const [matchStop, setMatchStop] = useState(false);
  const [confirmedAddress, setConfirmedAddress] = useState('');
  const [verifyChecked, setVerifyChecked] = useState(false);
  const [refusal, setRefusal] = useState<SecretKind | null>(null);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [tryRefusal, setTryRefusal] = useState<SecretKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * A wizard that forgets is a wizard people abandon: a merchant who checks one detail on their
   * wallet app and comes back should land where they left off. The draft is public material plus
   * form fields — the PIN is never written, and completing the wizard clears it.
   */
  useEffect(() => {
    try {
      const raw = appStore().getItem('wizard:draft');
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, unknown>;
      if (typeof draft.step === 'number') setStep(Math.min(5, Math.max(1, draft.step)) as WizardStep);
      if (typeof draft.businessName === 'string') setBusinessName(draft.businessName);
      if (typeof draft.currency === 'string') setCurrency(draft.currency);
      if (typeof draft.taxPercent === 'string') setTaxPercent(draft.taxPercent);
      if (typeof draft.label === 'string') setLabel(draft.label);
      if (typeof draft.networkId === 'string') setNetworkId(draft.networkId as NetworkId);
      if (typeof draft.xpub === 'string') setXpub(draft.xpub);
      if (typeof draft.checked === 'boolean') setChecked(draft.checked);
      if (typeof draft.walletConfirmed === 'boolean') setWalletConfirmed(draft.walletConfirmed);
      if (typeof draft.confirmedAddress === 'string') setConfirmedAddress(draft.confirmedAddress);
    } catch {
      /* a broken draft is no draft */
    }
  }, []);

  useEffect(() => {
    try {
      appStore().setItem(
        'wizard:draft',
        JSON.stringify({ step, businessName, currency, taxPercent, label, networkId, xpub, checked, walletConfirmed, confirmedAddress }),
      );
    } catch {
      /* private mode: the draft simply does not persist */
    }
  }, [step, businessName, currency, taxPercent, label, networkId, xpub, checked, walletConfirmed, confirmedAddress]);

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

  /** Refuse anything that could spend, and never let it sit in the field (or in state). */
  const changeXpub = useCallback((value: string) => {
    try {
      assertNotSecret(value);
      setXpub(value);
      setRefusal(null);
    } catch (e) {
      if (e instanceof SecretRefused) {
        setXpub('');
        setRefusal(e.kind);
      } else {
        setXpub(value);
        setRefusal(null);
      }
    }
  }, []);

  const saveWallet = useCallback(() => {
    if (!validation || !validation.ok || !checked) return;
    const repo = createRepository(appStore());
    const account = repo.addAccount(validation);
    repo.acknowledge(account.id);
    void repo.recordShift('account-added', account, null, 'created during setup');
    void repo.recordShift('acknowledge', account, null, 'address 0/0 confirmed during setup');
    setWalletConfirmed(true);
    setConfirmedAddress(account.firstAddress);
    setVerifyChecked(false);
    setMessage(`${account.label} saved. Address 0/0 is on screen, in groups of four. Check the bold ends against your wallet.`);
  }, [validation, checked]);

  async function savePin() {
    if (!isValidPin(pin)) {
      setMessage('A PIN is 4 to 8 digits.');
      return;
    }
    const repo = createRepository(appStore());
    repo.setPin(await hashPin(pin));
    void repo.recordShift('pin-set', null, null, 'PIN set during setup');
    setMessage('PIN set — only a hash is stored on this device.');
  }

  function finish() {
    const store = appStore();
    saveSettings(store, { ...settings, onboardedAt: new Date().toISOString() });
    try {
      appStore().removeItem('wizard:draft');
    } catch {
      /* nothing to clear */
    }
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
      {isSkinV2() && (
        <p className="v2-stages">
          {(['Welcome', 'Shop', 'Wallet', 'PIN', 'Ready'] as const).map((name, i) => (
            <span key={name} className={step === i + 1 ? 'v2-on' : undefined}>{i + 1} {name}</span>
          ))}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow m-0">
          step {step} of 5 · {stepper?.title}
        </p>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Leave setup
        </button>
      </div>
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

          {/* The wall, demonstrated offline and on this device. Nothing is written. */}
          <div className="mt-4 rounded-lg border border-line p-3">
            <p className="text-xs">
              <strong>Try it.</strong> Paste a seed phrase or a private key here and watch slip
              refuse it. Nothing is saved.
            </p>
            <input
              id="wz-try"
              aria-label="Try pasting a secret — slip will refuse it"
              onChange={(e) => {
                try {
                  assertNotSecret(e.target.value);
                  setTryRefusal(null);
                } catch (err) {
                  if (err instanceof SecretRefused) {
                    e.target.value = '';
                    setTryRefusal(err.kind);
                  }
                }
              }}
              placeholder="paste anything here"
              spellCheck={false}
              className="mt-2 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
            />
            {tryRefusal && (
              <p role="alert" className="mt-2 rounded-lg border border-bad p-2 text-xs text-bad">
                {refusalCopy(tryRefusal)}
              </p>
            )}
          </div>

          <WalletPicker />

          <div className="mt-4 rounded-lg border border-line p-3">
            <p className="text-xs">
              <strong>No wallet yet?</strong> Open the demo shop — a pretend café in its own drawer, with a
              simulated explorer, so you can take a sale in about a minute. It is also always in the
              Manual.
            </p>
            <a href="?demo=1" target="_blank" rel="noreferrer noopener" className="btn btn-secondary mt-2">
              Pretend shop first
            </a>
          </div>
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
            <span className="eyebrow">Your wallet&apos;s public code</span>
            <textarea
              id="wz-xpub"
              value={xpub}
              onChange={(e) => changeXpub(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="zpub6… or wpkh(zpub…/0/*)"
              className="mt-1 w-full resize-y rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
            />
            <p className="mt-1 text-sm text-ink">Scan the QR from your wallet, or paste the zpub. A private key is refused and wiped.</p>
            <CameraCapture
              label="Scan the zpub"
              onText={(raw) => {
                try {
                  assertNotSecret(raw);
                } catch (err) {
                  if (err instanceof SecretRefused) {
                    changeXpub('');
                    setRefusal(err.kind);
                    setScanMiss(null);
                    return;
                  }
                }
                const code = publicCodeFromScan(raw);
                if (!code) {
                  setScanMiss('That code is not a public wallet code. Paste the zpub instead.');
                  return;
                }
                changeXpub(code);
                setScanMiss(null);
              }}
            />
            {scanMiss && <p className="mt-1 text-sm text-warn" role="status">{scanMiss}</p>}
          </label>

          {refusal && (
            <p role="alert" className="mt-2 rounded-lg border border-bad p-2 text-xs text-bad">
              {refusalCopy(refusal)}
            </p>
          )}

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
                    <span className="w-10 shrink-0 text-[11px] text-muted">{a.path}</span>
                    <code className="break-all font-mono text-[11px]">
                      <AddressText address={a.address} />
                    </code>
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
                  <span className="font-mono text-ink">
                    <AddressText address={validation.draft.firstAddress} />
                  </span>
                </span>
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCompareStopped(false);
                    setChecked(true);
                    setMatchStop(false);
                  }}
                >
                  They match
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setCompareStopped(true);
                    setChecked(false);
                    setMatchStop(true);
                  }}
                >
                  They don&apos;t match
                </button>
              </div>
              {matchStop && (
                <p className="mt-2 rounded-lg border border-bad p-2 text-sm text-bad" role="alert" data-compare-stop>
                  They don&apos;t match. slip will not take a sale until address 0/0 matches your wallet.
                  There is no skip. Check the address, then press They match.
                </p>
              )}
              <button
                type="button"
                onClick={saveWallet}
                disabled={!checked || walletConfirmed}
                className="btn btn-primary mt-2"
              >
                {walletConfirmed ? 'Saved' : 'Save wallet'}
              </button>
              {!checked && (
                <p className="mt-1 text-xs text-warn" role="status" data-blocker>
                  Tick the box, or press They match, before saving. slip will not guess.
                </p>
              )}
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
          <button type="button" onClick={() => void savePin()} className="btn btn-secondary mt-2">
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
          <p className="eyebrow">Compare once more, then open the counter</p>

          {confirmedAddress ? (
            <>
              <p className="mt-2 text-sm leading-relaxed">
                This is your address 0/0 — the one every sale pays into. Check it against your own
                wallet before you take money.
              </p>
              <code className="mt-2 block break-all rounded-lg border border-accent bg-bg p-4 font-mono text-lg font-semibold leading-relaxed text-ink sm:text-xl">
                <AddressText address={confirmedAddress} />
              </code>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCompareStopped(false);
                    setVerifyChecked(true);
                    setMatchStop(false);
                  }}
                >
                  They match
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setCompareStopped(true);
                    setVerifyChecked(false);
                    setMatchStop(true);
                  }}
                >
                  They don&apos;t match
                </button>
              </div>
              {matchStop && (
                <p className="mt-2 rounded-lg border border-bad p-2 text-sm text-bad" role="alert" data-compare-stop>
                  They don&apos;t match. This setup cannot open the counter. There is no skip.
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed">
                If this address doesn&rsquo;t match the first address in your wallet, go back and check it.
              </p>
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-line p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={verifyChecked}
                  onChange={(e) => setVerifyChecked(e.target.checked)}
                  className="mt-0.5"
                />
                <span>I checked address 0/0 in my own wallet and it matches</span>
              </label>
            </>
          ) : (
            <p className="mt-2 rounded-lg border border-warn p-2 text-xs text-warn">
              No wallet is confirmed yet. Go back to step 3 and check address 0/0 first.
            </p>
          )}

          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              ['Shop', businessName || '—'],
              ['Currency', currency],
              ['Tax', `${taxPercent || '0'}%`],
              ['Wallet', walletConfirmed ? 'confirmed' : 'not confirmed'],
              ['PIN', pin ? 'set' : 'not set'],
              ['Stage', 'Working till — sell, close the day, prove it'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line px-3 py-2">
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-0.5 text-sm">{v}</dd>
              </div>
            ))}
          </dl>
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
          onClick={() => {
            setStep(previousStep(step));
            setMessage(null);
          }}
          disabled={step === 1}
          className="btn btn-secondary"
        >
          Back
        </button>
        {step === 1 && (
          <p className="text-xs text-warn" role="status" data-blocker>This is the first step. There is nothing before it.</p>
        )}
        {step < 5 ? (
          <button
            type="button"
            onClick={() => {
              setStep(nextStep(step));
              setMessage(null);
            }}
            disabled={!gate.canAdvance}
            className="btn btn-primary"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={!walletConfirmed || !verifyChecked || matchStop}
            className="btn btn-primary"
          >
            Finish setup
          </button>
        )}
        <button type="button" onClick={onDone} className="btn btn-ghost ml-auto">
          Leave setup
        </button>
      </div>
      {matchStop && (
        <p className="mt-2 text-xs text-bad" role="alert" data-compare-stop>
          There is no way past a mismatch. You can leave this screen. The counter stays closed until address 0/0 matches.
        </p>
      )}
      {step === 5 && (!walletConfirmed || !verifyChecked) && !matchStop && (
        <p className="mt-1 text-xs text-warn" role="status" data-blocker>
          Check address 0/0 and press They match before opening the counter.
        </p>
      )}
    </div>
  );
}
