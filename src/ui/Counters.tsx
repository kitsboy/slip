/**
 * Counters — one account per till, and the staff hand-off.
 *
 * The product question this answers: "can I hand the device to an employee at the same
 * shop and have the takings land in the right place?" Yes — each counter is its own
 * BIP-85-derived child account (imported as an xpub, never derived here), and handing
 * the till over names who is holding it and which counter it is ringing into.
 *
 * Honest stage: this build takes payments — the till ships. Accounts live on this device only;
 * a hand-off names who is holding the counter and which counter it is ringing into.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACCOUNT_PURPOSES,
  WALLET_COLOURS,
  colourHex,
  createMemoryStore,
  createRepository,
  purposeLabel,
  statusOf,
  validateAccountInput,
  type CounterAccount,
  type Repository,
} from '../core/accounts';
import { hashPin, isValidPin, validateHandoff, verifyPin } from '../core/pin';
import { createLedger } from '../core/ledger';
import { buildHandover } from '../core/handover';
import { paymentUri } from '../core/qr';
import { renderQrSvg } from '../core/qr';
import type { Coin, NetworkId } from '../core/network';
import type { ScriptType, SecretKind } from '../core/keys';
import { assertNotSecret, SecretRefused } from '../core/keys';
import { loadSettings } from '../core/settings';
import { fetchAddressActivity, formatAtoms, targetFor } from '../core/providers/esplora';
import type { AccountPurpose, WalletColour } from '../core/accounts';
import { store as appStore } from '../core/storage';

const NETWORKS: Array<{ id: NetworkId; coin: Coin; label: string }> = [
  { id: 'btc-mainnet', coin: 'btc', label: 'Bitcoin' },
  { id: 'btc-signet', coin: 'btc', label: 'Bitcoin Signet' },
  { id: 'btc-testnet4', coin: 'btc', label: 'Bitcoin Testnet4' },
  { id: 'ltc-mainnet', coin: 'ltc', label: 'Litecoin' },
  { id: 'ltc-testnet', coin: 'ltc', label: 'Litecoin Testnet' },
];

const SCRIPTS: Array<{ id: ScriptType; label: string }> = [
  { id: 'p2wpkh', label: 'Native segwit' },
  { id: 'p2sh-p2wpkh', label: 'Nested segwit' },
  { id: 'p2pkh', label: 'Legacy' },
];

/**
 * localStorage is unavailable on `file://` in some browsers and inside hardened
 * WebViews. A till that opens from disk must still work, so fall back to memory and
 * say so in the UI rather than throwing on first render.
 */
const STORAGE_KEY_PROBE = 'slip.storage.probe';
const memoryFallback = createMemoryStore();
let usingMemory = false;

function repo(): Repository {
  try {
    const ls = appStore();
    ls.getItem(STORAGE_KEY_PROBE); // throws when storage is blocked, not when it is empty
    return createRepository(ls);
  } catch {
    usingMemory = true;
    return createRepository(memoryFallback);
  }
}

export function isUsingMemoryStore(): boolean {
  return usingMemory;
}

export default function Counters() {
  const [accounts, setAccounts] = useState<CounterAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [pinSet, setPinSet] = useState(false);

  // add-account form
  const [label, setLabel] = useState('');
  const [networkId, setNetworkId] = useState<NetworkId>('btc-mainnet');
  const [scriptType, setScriptType] = useState<ScriptType | 'auto'>('auto');
  const [xpub, setXpub] = useState('');
  const [refusal, setRefusal] = useState<SecretKind | null>(null);
  const [checked, setChecked] = useState(false);
  const [colour, setColour] = useState<WalletColour>('orange');
  const [purpose, setPurpose] = useState<AccountPurpose>('till');
  const [note, setNote] = useState('');
  const [balances, setBalances] = useState<Record<string, { text: string; source: string; at: string }>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  // which account's receive QR is open (address 0/0 only — a preview, never an invoice)
  const [qrFor, setQrFor] = useState<string | null>(null);

  // hand-off form
  const [staffInput, setStaffInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [newPin, setNewPin] = useState('');

  // Reading and announcing are separate on purpose: a panel that dispatches the change
  // event must not also listen to it, or refresh() calls itself forever.
  const readState = useCallback(() => {
    const r = repo();
    setAccounts(r.load().accounts);
    setActiveId(r.load().activeAccountId);
    setStaff(r.currentStaff());
    setPinSet(Boolean(r.pinHash()));
  }, []);

  const refresh = useCallback(() => {
    readState();
    // Sibling panels (Backup, Settings) read the same store; tell them it moved rather
    // than duplicating state and letting one panel act on a stale list.
    window.dispatchEvent(new Event('slip:data-changed'));
  }, [readState]);

  useEffect(() => {
    readState();
    const onChange = () => readState();
    window.addEventListener('slip:data-changed', onChange);
    return () => window.removeEventListener('slip:data-changed', onChange);
  }, [readState]);

  const coin = useMemo(() => NETWORKS.find((n) => n.id === networkId)?.coin ?? 'btc', [networkId]);

  const validation = useMemo(() => {
    if (!xpub.trim()) return null;
    return validateAccountInput({
      label: label || 'account',
      xpub,
      coin,
      networkId,
      colour,
      purpose,
      note,
      ...(scriptType === 'auto' ? {} : { scriptType }),
    });
  }, [xpub, label, coin, networkId, scriptType, colour, purpose, note]);

  const activeAccount = accounts.find((a) => a.id === activeId) ?? null;

  /**
   * Live balance for one address, from the configured explorer (public by default).
   * It is explicitly ONE address — address 0/0 — not "the wallet", because slip does not
   * scan a whole chain and saying otherwise would be a lie with a number attached.
   */
  async function checkBalance(account: CounterAccount) {
    const { settings } = loadSettings(appStore());
    const target = targetFor(account.networkId, settings.explorerUrl);
    if (!target) {
      setBalances((b) => ({
        ...b,
        [account.id]: { text: 'no explorer', source: 'none configured', at: '—' },
      }));
      return;
    }
    setBalances((b) => ({ ...b, [account.id]: { text: 'checking…', source: '', at: '' } }));
    try {
      const activity = await fetchAddressActivity(target, account.firstAddress);
      setBalances((b) => ({
        ...b,
        [account.id]: {
          text: `${formatAtoms(activity.confirmedBalanceAtoms, account.coin)} · ${activity.receivedAtoms > 0n ? 'used' : 'unused'}`,
          source: target.kind === 'public' ? new URL(target.baseUrl).host : 'your node',
          at: activity.fetchedAt.slice(11, 16),
        },
      }));
    } catch (e) {
      setBalances((b) => ({
        ...b,
        [account.id]: {
          text: e instanceof Error ? e.message : 'lookup failed',
          source: target.kind === 'public' ? new URL(target.baseUrl).host : 'your node',
          at: '—',
        },
      }));
    }
  }

  function addAccount() {
    if (!validation || !validation.ok) return;
    if (!checked) {
      setMessage({
        kind: 'warn',
        text: 'Open your wallet first and compare address 0/0. Tick the box only when it matches.',
      });
      return;
    }
    const r = repo();
    const account = r.addAccount(validation);
    r.acknowledge(account.id);
    void r.recordShift('account-added', account, null, `${account.scriptType} · ${account.networkId}`);
    void r.recordShift('acknowledge', account, null, 'address 0/0 confirmed against the wallet');
    refresh();
    setMessage({
      kind: 'ok',
      text: `${account.label} saved and checked. First address ${account.firstAddress}`,
    });
    setLabel('');
    setXpub('');
    setChecked(false);
  }

  async function handOver() {
    if (!activeAccount && accounts.length > 0) {
      // choose the first ready account as the one to hand over
      const ready = accounts.find((a) => statusOf(a) === 'ready');
      if (!ready) {
        setMessage({ kind: 'bad', text: 'No checked account to hand over yet.' });
        return;
      }
    }
    const target = activeAccount ?? accounts.find((a) => statusOf(a) === 'ready') ?? null;
    const verdict = validateHandoff(
      { staffName: staffInput, accountId: target?.id ?? pendingAccountId, ...(pinInput ? { pin: pinInput } : {}) },
      {
        accountExists: Boolean(target),
        accountAcknowledged: target ? statusOf(target) === 'ready' : false,
        currentStaff: staff,
        pinSet,
      },
    );
    if (!verdict.ok) {
      setMessage({ kind: 'bad', text: verdict.reason });
      return;
    }

    const storedHash = repo().pinHash();
    if (storedHash) {
      const ok = await verifyPin(pinInput, storedHash);
      if (!ok) {
        setMessage({ kind: 'bad', text: 'That PIN is not right.' });
        return;
      }
    }

    repo().setHandoff(verdict.accountId, verdict.staffName);
    void repo().recordShift('handoff', target, verdict.staffName, 'till handed over');
    refresh();
    // The next person should not have to guess what is in flight. The note is built from state
    // that already exists — nothing is invented.
    const settings = loadSettings(appStore()).settings;
    if (settings.assist.handoverNote) {
      const ledger = createLedger(appStore());
      const data = ledger.load();
      const today = new Date().toISOString().slice(0, 10);
      const note = buildHandover({
        staffName: staff,
        parkedTabs: (() => {
          try {
            return (JSON.parse(appStore().getItem('slip.tabs.v1') ?? '[]') as unknown[]).length;
          } catch {
            return 0;
          }
        })(),
        openSales: data.invoices.filter((i) => i.status === 'awaiting' || i.status === 'seen').length,
        refundsToday: data.refunds.filter((r) => r.at.startsWith(today)).length,
        takingsToday: data.invoices
          .filter((i) => i.status === 'complete' && i.createdAt.slice(0, 10) === today)
          .reduce((s, i) => s + i.amountAtoms, 0n),
        rateAgeSeconds: null,
      });
      setMessage({ kind: 'ok', text: `Till handed to ${verdict.staffName}. ${note.lines.join(' · ')}` });
    } else {
      setMessage({ kind: 'ok', text: `Till handed to ${verdict.staffName}.` });
    }
    setStaffInput('');
    setPinInput('');
  }

  async function savePin() {
    if (!isValidPin(newPin)) {
      setMessage({ kind: 'bad', text: 'The PIN is 4 to 8 digits.' });
      return;
    }
    repo().setPin(await hashPin(newPin));
    void repo().recordShift('pin-set', null, null, 'till PIN set (hash stored, never the PIN)');
    setNewPin('');
    refresh();
    setMessage({ kind: 'ok', text: 'Till PIN set. Only the hash is stored on this device.' });
  }

  // Which account a fresh hand-off would use (the checked one selected below).
  const [pendingAccountId, setPendingAccountId] = useState<string>('');

  return (
    <section className="mt-6 panel" data-panel="wallets">
      <h2 className="panel-title">Wallets &amp; staff hand-off</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        One entry per wallet you need to watch — your own, your employer's, your parents' — each
        with its own colour and label so you can tell them apart at a glance. A wallet is any of:
        an <span className="text-ink">xpub</span>, a <span className="text-ink">BIP-380
        descriptor</span> (multisig included), a single public key, or a plain address. For a{' '}
        <span className="text-ink">BIP-85</span> child account you import the child xpub your own
        signer produced — slip never derives BIP-85 itself, because that needs your master key.
      </p>

      {staff && (
        <p className="mt-3 rounded-lg border border-accent p-3 text-sm">
          Held by <span className="font-semibold text-accent">{staff}</span>
          {activeAccount ? ` · ${activeAccount.label}` : ''}
          <button
            type="button"
            onClick={() => {
              repo().clearHandoff();
              void repo().recordShift('return', activeAccount, staff, 'till returned');
              refresh();
            }}
            className="ml-3 rounded border border-line px-2 text-xs text-muted hover:text-ink"
          >
            return till
          </button>
        </p>
      )}

      {accounts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: colourHex(a.colour) }}
                  />
                  {a.label}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${
                    statusOf(a) === 'ready' ? 'border-good text-good' : 'border-warn text-warn'
                  }`}
                >
                  {statusOf(a) === 'ready' ? 'checked' : 'needs your check'}
                </span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted">{a.firstAddress}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-muted">
                {WALLET_COLOURS.find((c) => c.id === a.colour)?.label ?? '—'} ·{' '}
                {purposeLabel(a.purpose)} · {a.networkId} · {a.scriptType} · fp {a.fingerprintHex}
              </p>
              {a.note && <p className="mt-0.5 text-[11px] text-muted">{a.note}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void checkBalance(a)}
                  className="rounded border border-line px-2 text-xs text-muted hover:text-ink"
                >
                  check balance
                </button>
                {balances[a.id] && (
                  <span className="text-[11px] text-muted">
                    <span className="figure text-ink">{balances[a.id]!.text}</span> · from{' '}
                    {balances[a.id]!.source} at {balances[a.id]!.at}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQrFor(qrFor === a.id ? null : a.id)}
                className="mt-2 rounded border border-line px-2 text-xs text-muted hover:text-ink"
              >
                {qrFor === a.id ? 'hide QR' : 'address 0/0 QR'}
              </button>
              {qrFor === a.id && (
                <div className="mt-2 flex items-start gap-3">
                  {/* Our own generated SVG — the only markup injected here, and its content
                      is a QR matrix, not merchant text. */}
                  <div
                    className="h-32 w-32 shrink-0 rounded-lg bg-white p-1"
                    dangerouslySetInnerHTML={{
                      __html: renderQrSvg(
                        paymentUri('bitcoin', {
                          address: a.firstAddress,
                          label: a.label,
                        }),
                        { scale: 6, margin: 2 },
                      ),
                    }}
                  />
                  <p className="text-[11px] leading-relaxed text-muted">
                    <span className="text-warn">Preview only.</span> These are the first addresses of
                    this counter, not an invoice. A real sale will reserve a fresh index before any
                    QR is shown.
                    <br />
                    <span className="font-mono break-all">{a.firstAddress}</span>
                  </p>
                </div>
              )}
              {statusOf(a) !== 'ready' && (
                <button
                  type="button"
                  onClick={() => {
                    repo().acknowledge(a.id);
                    void repo().recordShift('acknowledge', a, null, 'address 0/0 confirmed against the wallet');
                    refresh();
                    setMessage({ kind: 'ok', text: `${a.label} marked as checked against your wallet.` });
                  }}
                  className="mt-2 rounded border border-line px-2 text-xs text-muted hover:text-ink"
                >
                  I compared address 0/0 with my wallet
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Add a wallet</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block" htmlFor="ct-label">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Name</span>
            <input
              id="ct-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Front counter"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block" htmlFor="ct-network">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Network</span>
            <select
              id="ct-network"
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
          <label className="block" htmlFor="ct-script">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Script</span>
            <select
              id="ct-script"
              value={scriptType}
              onChange={(e) => setScriptType(e.target.value as ScriptType | 'auto')}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            >
              <option value="auto">Auto from prefix</option>
              {SCRIPTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block" htmlFor="ct-purpose">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">What is it for</span>
            <select
              id="ct-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as AccountPurpose)}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            >
              {ACCOUNT_PURPOSES.map((p2) => (
                <option key={p2.id} value={p2.id}>
                  {p2.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block" htmlFor="ct-note">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Note (optional)</span>
            <input
              id="ct-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mum's rent account"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <fieldset className="mt-2">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Colour — <span className="text-ink">{WALLET_COLOURS.find((c) => c.id === colour)?.label}</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {WALLET_COLOURS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColour(c.id)}
                aria-label={`Colour ${c.label}`}
                aria-pressed={colour === c.id}
                title={c.label}
                className={`h-8 w-8 rounded-full border-2 ${colour === c.id ? 'border-ink' : 'border-transparent'}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </fieldset>

        <label className="mt-2 block" htmlFor="ct-xpub">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            xpub · descriptor · public key · address
          </span>
          <textarea
            id="ct-xpub"
            value={xpub}
            onChange={(e) => {
              const v = e.target.value;
              // Refuse anything that could spend, and never let it linger in the field or state.
              try {
                assertNotSecret(v);
                setXpub(v);
                setRefusal(null);
              } catch (err) {
                if (err instanceof SecretRefused) {
                  setXpub('');
                  setRefusal(err.kind);
                } else {
                  setXpub(v);
                  setRefusal(null);
                }
              }
            }}
            rows={3}
            spellCheck={false}
            placeholder="zpub6rFR7y4Q2AijB…"
            className="mt-1 w-full resize-y rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
          />
        </label>

        {refusal && (
          <p role="alert" className="mt-2 rounded-lg border border-bad p-2 text-xs text-bad">
            {refusal === 'seed phrase'
              ? "That's a recovery phrase. slip can never hold it — paste your public wallet address instead."
              : "That's a private key. slip can never hold it — paste your public wallet address instead."}
          </p>
        )}

        {validation && !validation.ok && (
          <p className="mt-2 rounded-lg border border-warn p-2 text-xs text-warn" role="alert">
            {validation.error}
          </p>
        )}

        {validation && validation.ok && (
          <div className="mt-2">
            {validation.warnings.map((w) => (
              <p key={w} className="mt-1 rounded-lg border border-warn p-2 text-[11px] text-warn">
                {w}
              </p>
            ))}
            <ol className="mt-2 space-y-1">
              {validation.draft.preview.slice(0, 3).map((a) => (
                <li key={a.address} className="flex gap-2 rounded border border-line px-2 py-1">
                  <span className="w-10 shrink-0 text-[11px] text-muted">{a.path}</span>
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
                I opened my wallet&apos;s Receive tab and address 0/0 is{' '}
                <span className="font-mono text-ink">{validation.draft.firstAddress}</span>
              </span>
            </label>
            <button
              type="button"
              onClick={addAccount}
              disabled={!checked}
              className="mt-2 rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent disabled:border-line disabled:text-muted"
            >
              Save counter
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Hand the till over</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="block" htmlFor="ho-account">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Counter</span>
            <select
              id="ho-account"
              value={pendingAccountId}
              onChange={(e) => {
                setPendingAccountId(e.target.value);
                repo().save({ ...repo().load(), activeAccountId: e.target.value || null });
                refresh();
              }}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            >
              <option value="">choose…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({statusOf(a)})
                </option>
              ))}
            </select>
          </label>
          <label className="block" htmlFor="ho-staff">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Staff name</span>
            <input
              id="ho-staff"
              value={staffInput}
              onChange={(e) => setStaffInput(e.target.value)}
              placeholder="Ana"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block" htmlFor="ho-pin">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Till PIN</span>
            <input
              id="ho-pin"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              placeholder={pinSet ? '••••' : 'none set'}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handOver()}
            className="rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent"
          >
            Hand over
          </button>
          {!pinSet && (
            <>
              <input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                placeholder="set a 4–8 digit PIN"
                aria-label="Set a till PIN"
                className="w-40 rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => void savePin()}
                className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
              >
                Set PIN
              </button>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Only a hash of the PIN is stored, on this device. Handing the till over names who is
          holding it — switching counters without the PIN is refused.
        </p>
      </div>

      {message && (
        <p
          role="status"
          data-testid="counter-message"
          className={`mt-3 rounded-lg border p-2 text-xs ${
            message.kind === 'ok'
              ? 'border-good text-good'
              : message.kind === 'warn'
                ? 'border-warn text-warn'
                : 'border-bad text-bad'
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
