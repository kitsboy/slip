/**
 * Counters — one account per till, and the staff hand-off.
 *
 * The product question this answers: "can I hand the device to an employee at the same
 * shop and have the takings land in the right place?" Yes — each counter is its own
 * BIP-85-derived child account (imported as an xpub, never derived here), and handing
 * the till over names who is holding it and which counter it is ringing into.
 *
 * Honest stage: this build stores accounts on this device only. There is no till yet, so
 * a hand-off changes who the app says is holding the counter — it cannot take money.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMemoryStore,
  createRepository,
  statusOf,
  validateAccountInput,
  type CounterAccount,
  type Repository,
} from '../core/accounts';
import { hashPin, isValidPin, validateHandoff, verifyPin } from '../core/pin';
import type { Coin, NetworkId } from '../core/network';
import type { ScriptType } from '../core/keys';

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
    const ls = window.localStorage;
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
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  // hand-off form
  const [staffInput, setStaffInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [newPin, setNewPin] = useState('');

  const refresh = useCallback(() => {
    const r = repo();
    setAccounts(r.load().accounts);
    setActiveId(r.load().activeAccountId);
    setStaff(r.currentStaff());
    setPinSet(Boolean(r.pinHash()));
  }, []);

  useEffect(refresh, [refresh]);

  const coin = useMemo(() => NETWORKS.find((n) => n.id === networkId)?.coin ?? 'btc', [networkId]);

  const validation = useMemo(() => {
    if (!xpub.trim()) return null;
    return validateAccountInput({
      label: label || 'account',
      xpub,
      coin,
      networkId,
      ...(scriptType === 'auto' ? {} : { scriptType }),
    });
  }, [xpub, label, coin, networkId, scriptType]);

  const activeAccount = accounts.find((a) => a.id === activeId) ?? null;

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
    refresh();
    setMessage({ kind: 'ok', text: `Till handed to ${verdict.staffName}.` });
    setStaffInput('');
    setPinInput('');
  }

  async function savePin() {
    if (!isValidPin(newPin)) {
      setMessage({ kind: 'bad', text: 'The PIN is 4 to 8 digits.' });
      return;
    }
    repo().setPin(await hashPin(newPin));
    setNewPin('');
    refresh();
    setMessage({ kind: 'ok', text: 'Till PIN set. Only the hash is stored on this device.' });
  }

  // Which account a fresh hand-off would use (the checked one selected below).
  const [pendingAccountId, setPendingAccountId] = useState<string>('');

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-base font-semibold">Counters &amp; staff hand-off</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        One account per till, truck or staff member — each a <span className="text-ink">BIP-85</span>{' '}
        child account you derived on your own signer and imported here as an xpub. slip never derives
        BIP-85 itself, because that needs your master private key.
      </p>

      {staff && (
        <p className="mt-3 rounded-lg border border-accent p-3 text-sm">
          Held by <span className="font-semibold text-accent">{staff}</span>
          {activeAccount ? ` · ${activeAccount.label}` : ''}
          <button
            type="button"
            onClick={() => {
              repo().clearHandoff();
              refresh();
            }}
            className="ml-3 rounded border border-line px-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
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
                <span className="text-sm font-medium">{a.label}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    statusOf(a) === 'ready' ? 'border-good text-good' : 'border-warn text-warn'
                  }`}
                >
                  {statusOf(a) === 'ready' ? 'checked' : 'needs your check'}
                </span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted">{a.firstAddress}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
                {a.networkId} · {a.scriptType} · fp {a.fingerprintHex}
              </p>
              {statusOf(a) !== 'ready' && (
                <button
                  type="button"
                  onClick={() => {
                    repo().acknowledge(a.id);
                    refresh();
                    setMessage({ kind: 'ok', text: `${a.label} marked as checked against your wallet.` });
                  }}
                  className="mt-2 rounded border border-line px-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
                >
                  I compared address 0/0 with my wallet
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Add a counter</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block" htmlFor="ct-label">
            <span className="text-[11px] uppercase tracking-widest text-muted">Name</span>
            <input
              id="ct-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Front counter"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block" htmlFor="ct-network">
            <span className="text-[11px] uppercase tracking-widest text-muted">Network</span>
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
            <span className="text-[11px] uppercase tracking-widest text-muted">Script</span>
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

        <label className="mt-2 block" htmlFor="ct-xpub">
          <span className="text-[11px] uppercase tracking-widest text-muted">
            Child account xpub
          </span>
          <textarea
            id="ct-xpub"
            value={xpub}
            onChange={(e) => setXpub(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="zpub6rFR7y4Q2AijB…"
            className="mt-1 w-full resize-y rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
          />
        </label>

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
                I opened my wallet&apos;s Receive tab and address 0/0 is{' '}
                <span className="font-mono text-ink">{validation.draft.firstAddress}</span>
              </span>
            </label>
            <button
              type="button"
              onClick={addAccount}
              disabled={!checked}
              className="mt-2 rounded-lg border border-accent px-3 py-2 text-xs uppercase tracking-wider text-accent disabled:border-line disabled:text-muted"
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
            <span className="text-[11px] uppercase tracking-widest text-muted">Counter</span>
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
            <span className="text-[11px] uppercase tracking-widest text-muted">Staff name</span>
            <input
              id="ho-staff"
              value={staffInput}
              onChange={(e) => setStaffInput(e.target.value)}
              placeholder="Ana"
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block" htmlFor="ho-pin">
            <span className="text-[11px] uppercase tracking-widest text-muted">Till PIN</span>
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
            className="rounded-lg border border-accent px-3 py-2 text-xs uppercase tracking-wider text-accent"
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
                className="rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink"
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
