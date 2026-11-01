/**
 * Settings — the shop's own numbers, editable after setup.
 *
 * These were write-once in the wizard, which is wrong: a tax rate changes, a shop
 * renames, a receipt footer gets a phone number. Saving goes through the same sanitiser
 * the wizard uses, and the corrections it makes are shown to the merchant rather than
 * applied silently.
 *
 * The wipe lives here too, because "start over" is a settings-shaped action — and it is
 * written into the shift log *before* the data goes, so a wiped device cannot look virgin.
 */

import { useState } from 'react';
import { CURRENCIES } from '../core/currencies';
import { ASSIST_GROUPS, ASSIST_LABELS, loadSettings, sanitizeSettings, saveSettings, type AssistOptions } from '../core/settings';
import { printCounterCard } from './counterCard';
import { buildLabel } from '../core/buildinfo';
import { createRepository, SHIFT_STORAGE_KEY, STORAGE_KEY } from '../core/accounts';
import { SETTINGS_KEY } from '../core/settings';
import { store as appStore } from '../core/storage';

const COMMON = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'MXN', 'KWD', 'VND'];

export default function Settings() {
  const store = appStore();
  const loaded = loadSettings(store);

  const [businessName, setBusinessName] = useState(loaded.settings.businessName);
  const [currency, setCurrency] = useState(loaded.settings.currency);
  const [taxPercent, setTaxPercent] = useState(String(loaded.settings.taxBps / 100));
  const [receiptFooter, setReceiptFooter] = useState(loaded.settings.receiptFooter);
  const [explorerUrl, setExplorerUrl] = useState(loaded.settings.explorerUrl);
  const [rateEndpoint, setRateEndpoint] = useState(loaded.settings.rateEndpoint);
  const [autoRate, setAutoRate] = useState(loaded.settings.autoRate);
  const [staff, setStaff] = useState<{ name: string; walletId: string }[]>([...loaded.settings.staff]);
  const [assist, setAssist] = useState<AssistOptions>({ ...loaded.settings.assist });
  const [signature, setSignature] = useState(loaded.settings.signature);
  const [newStaff, setNewStaff] = useState('');
  const [newStaffWallet, setNewStaffWallet] = useState('');
  const wallets = createRepository(store).load().accounts;
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(
    loaded.warnings.length > 0 ? { kind: 'warn', text: loaded.warnings.join(' · ') } : null,
  );
  const [confirmWipe, setConfirmWipe] = useState('');

  function save() {
    const { settings, warnings } = sanitizeSettings({
      businessName,
      currency,
      taxBps: Math.round(Number(taxPercent || '0') * 100),
      taxInclusive: loaded.settings.taxInclusive,
      tipPresetsBps: loaded.settings.tipPresetsBps,
      receiptFooter,
      explorerUrl,
      rateEndpoint,
      autoRate,
      staff,
      assist,
      signature,
      language: 'en',
      onboardedAt: loaded.settings.onboardedAt ?? new Date().toISOString(),
    });

    saveSettings(store, settings);
    // Other panels read settings once at mount; without this a merchant would have to reload the
    // page to feel a switch they just flicked.
    window.dispatchEvent(new Event('slip:settings-changed'));
    setBusinessName(settings.businessName);
    setTaxPercent(String(settings.taxBps / 100));
    setNote(
      warnings.length > 0
        ? { kind: 'warn', text: `saved, with corrections: ${warnings.join(' · ')}` }
        : { kind: 'ok', text: 'saved' },
    );
  }

  async function wipe() {
    if (confirmWipe.trim().toUpperCase() !== 'WIPE') {
      setNote({ kind: 'bad', text: 'type WIPE to confirm — this cannot be undone' });
      return;
    }
    const repo = createRepository(store);
    // Record the wipe FIRST: an audit trail that ends before the deletion is the whole point.
    await repo.recordShift('account-added', null, null, 'DEVICE WIPED by the owner — all local data cleared');

    store.removeItem(STORAGE_KEY);
    store.removeItem(SHIFT_STORAGE_KEY);
    store.removeItem(SETTINGS_KEY);
    window.location.reload();
  }

  return (
    <section className="mt-6 panel" data-panel="settings" id="settings">
      <p className="eyebrow">Your shop</p>
      <h2 className="panel-title mt-1">Settings</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block" htmlFor="st-name">
          <span className="eyebrow">Shop name</span>
          <input
            id="st-name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="st-currency">
          <span className="eyebrow">Currency</span>
          <select
            id="st-currency"
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
        <label className="block" htmlFor="st-tax">
          <span className="eyebrow">Tax %</span>
          <input
            id="st-tax"
            value={taxPercent}
            onChange={(e) => setTaxPercent(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block" htmlFor="st-footer">
          <span className="eyebrow">Receipt footer</span>
          <input
            id="st-footer"
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            placeholder="Thanks — see you tomorrow"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="mt-3 block" htmlFor="st-explorer">
        <span className="eyebrow">Chain-data endpoint (leave empty for the public explorer)</span>
        <input
          id="st-explorer"
          value={explorerUrl}
          onChange={(e) => setExplorerUrl(e.target.value)}
          spellCheck={false}
          placeholder="https://mempool.space/api — or your own https://node.local/api"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
        />
      </label>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        A public explorer learns which addresses you ask about, and your IP. Point this at your own
        Esplora / electrs and it learns nothing. slip never sends anything else.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block" htmlFor="st-rate-endpoint">
          <span className="eyebrow">Rate endpoint (empty = type the rate yourself)</span>
          <input
            id="st-rate-endpoint"
            value={rateEndpoint}
            onChange={(e) => setRateEndpoint(e.target.value)}
            spellCheck={false}
            placeholder="https://mempool.space/api/v1/prices"
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="mt-4 flex items-start gap-2 text-xs" htmlFor="st-auto-rate">
          <input
            id="st-auto-rate"
            type="checkbox"
            checked={autoRate}
            onChange={(e) => setAutoRate(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Fetch the rate for me
            <span className="mt-0.5 block text-[11px] text-muted">
              The quote is stamped with the minute it was read and refused after 10 minutes. If the
              service is down you will be asked to type the rate, never sold a stale one.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-line p-2">
        <span className="eyebrow">Staff tip jars</span>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          A named person can take tips into their own wallet. Only public wallet material is stored —
          slip still cannot spend a sat.
        </p>
        {staff.length > 0 && (
          <ul className="mt-2 space-y-1">
            {staff.map((s) => (
              <li key={s.walletId} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1">
                  {s.name} →{' '}
                  {wallets.find((w) => w.id === s.walletId)?.label ?? 'a wallet that no longer exists'}
                </span>
                <button
                  type="button"
                  onClick={() => setStaff((cur) => cur.filter((x) => x.walletId !== s.walletId))}
                  className="rounded border border-line px-2 text-xs text-muted"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block" htmlFor="st-staff-name">
            <span className="eyebrow">Name</span>
            <input
              id="st-staff-name"
              value={newStaff}
              onChange={(e) => setNewStaff(e.target.value)}
              placeholder="Ana"
              className="mt-1 w-32 rounded-lg border border-line bg-bg p-2 text-xs outline-none focus:border-accent"
            />
          </label>
          <label className="block" htmlFor="st-staff-wallet">
            <span className="eyebrow">Their wallet</span>
            <select
              id="st-staff-wallet"
              value={newStaffWallet}
              onChange={(e) => setNewStaffWallet(e.target.value)}
              className="mt-1 rounded-lg border border-line bg-bg p-2 text-xs outline-none focus:border-accent"
            >
              <option value="">— choose —</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              if (newStaff.trim().length < 2 || !newStaffWallet) return;
              setStaff((cur) => [...cur.filter((x) => x.walletId !== newStaffWallet), { name: newStaff.trim().slice(0, 40), walletId: newStaffWallet }]);
              setNewStaff('');
              setNewStaffWallet('');
            }}
            className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-ink"
          >
            add
          </button>
          <span className="text-[11px] text-muted">remember to press Save settings</span>
        </div>
      </div>

      <label className="mt-3 block" htmlFor="st-signature">
        <span className="eyebrow">Credit on payment labels (empty = say nothing)</span>
        <input
          id="st-signature"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="giveabit.io"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs outline-none focus:border-accent"
        />
        <span className="mt-1 block text-[11px] text-muted">
          Rides on the BIP-21 label a customer’s wallet already shows — never a logo across the till.
        </span>
      </label>

      <div className="mt-4 rounded-lg border border-line p-2" data-panel="assist">
        <span className="eyebrow">Assistance</span>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Every switch here adds words or widgets to the screen. A busy counter can turn them all off;
          a first week can leave them on. Nothing here changes what slip does with money.
        </p>
        {ASSIST_GROUPS.map((group) => (
          <div key={group.id} className="mt-3" data-assist-group={group.id}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</h4>
              <span className="text-[11px] text-muted/80">{group.why}</span>
            </div>
            <ul className="mt-1 space-y-2">
              {group.keys.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <input
                    id={`as-${key}`}
                    type="checkbox"
                    checked={assist[key]}
                    onChange={(e) => setAssist((cur) => ({ ...cur, [key]: e.target.checked }))}
                    className="mt-0.5"
                  />
                  <label htmlFor={`as-${key}`} className="text-xs">
                    {ASSIST_LABELS[key].title}
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{ASSIST_LABELS[key].why}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const ok = printCounterCard({ shopName: businessName, version: buildLabel() });
              if (!ok) setNote({ kind: 'warn', text: 'allow pop-ups to print the counter card' });
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            print the counter card
          </button>
          <span className="text-[11px] text-muted">
            One A4 sheet of the rules, for the wall behind the till.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        className="mt-3 rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent"
      >
        Save settings
      </button>

      {note && (
        <p
          role="status"
          className={`mt-3 rounded-lg border p-2 text-xs ${
            note.kind === 'ok' ? 'border-good text-good' : note.kind === 'warn' ? 'border-warn text-warn' : 'border-bad text-bad'
          }`}
        >
          {note.text}
        </p>
      )}

      <hr className="divider my-5" />

      <p className="eyebrow">Danger zone</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Wiping removes every counter, the PIN hash and the shift log from <span className="text-ink">this
        device</span>. It cannot touch your money, because slip never had any — but if you have no
        backup, the counter list is gone for good. The wipe is written into the log first.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={confirmWipe}
          onChange={(e) => setConfirmWipe(e.target.value)}
          placeholder="type WIPE"
          aria-label="Type WIPE to confirm erasing local data"
          className="w-32 rounded-lg border border-line bg-bg p-2 font-mono text-xs uppercase outline-none focus:border-bad"
        />
        <button
          type="button"
          onClick={() => void wipe()}
          disabled={confirmWipe.trim().toUpperCase() !== 'WIPE'}
          className="btn btn-danger"
        >
          Wipe this device
        </button>
        <a href="#settings" className="text-[11px] text-muted underline hover:text-ink">
          back to top
        </a>
      </div>
    </section>
  );
}
