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
import { loadSettings, sanitizeSettings, saveSettings } from '../core/settings';
import { createRepository, SHIFT_STORAGE_KEY, STORAGE_KEY } from '../core/accounts';
import { SETTINGS_KEY } from '../core/settings';

const COMMON = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'CHF', 'MXN', 'KWD', 'VND'];

export default function Settings() {
  const store = window.localStorage;
  const loaded = loadSettings(store);

  const [businessName, setBusinessName] = useState(loaded.settings.businessName);
  const [currency, setCurrency] = useState(loaded.settings.currency);
  const [taxPercent, setTaxPercent] = useState(String(loaded.settings.taxBps / 100));
  const [receiptFooter, setReceiptFooter] = useState(loaded.settings.receiptFooter);
  const [explorerUrl, setExplorerUrl] = useState(loaded.settings.explorerUrl);
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
      language: 'en',
      onboardedAt: loaded.settings.onboardedAt ?? new Date().toISOString(),
    });

    saveSettings(store, settings);
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
    <section className="mt-6 panel" id="settings">
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

      <button
        type="button"
        onClick={save}
        className="mt-3 rounded-lg border border-accent px-3 py-2 text-xs uppercase tracking-wider text-accent"
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
          className="rounded-lg border border-bad px-3 py-2 text-xs uppercase tracking-wider text-bad disabled:border-line disabled:text-muted"
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
