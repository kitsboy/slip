/**
 * Backup, restore and the shift log — the two things that make a shop's records
 * survive a lost phone and a change of staff.
 *
 * The file this produces is ENCRYPTED even though it holds no spending keys: an xpub
 * reveals every past and future address of a wallet, so an xpub in a plaintext JSON file
 * is a privacy leak, not a convenience.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRepository, type CounterAccount } from '../core/accounts';
import { createBackup, describeBackup, passphraseStrength, restoreBackup } from '../core/backup';
import ConfirmButton from './ConfirmButton';
import { exportLogLines, staffSummary, verifyLog, type ShiftLog } from '../core/shifts';
import { LEDGER_KEY } from '../core/ledger';
import { store as appStore } from '../core/storage';

interface BackupState {
  accounts: CounterAccount[];
  activeAccountId: string | null;
  /** The till PIN hash. Without it a restore leaves the device unprotected and looks fine. */
  pinHash: string | null;
  shifts: ShiftLog;
  /**
   * The books. Without these a restored device has wallets but no history — and the history
   * is what a merchant is actually trying not to lose.
   */
  ledger?: unknown;
  app: 'slip';
  savedAt: string;
}

interface PendingRestore {
  readonly file: File;
  readonly createdAt: string;
  readonly bytes: number;
}

export default function Backup() {
  const [accounts, setAccounts] = useState<CounterAccount[]>([]);
  const [log, setLog] = useState<ShiftLog | null>(null);
  const [verified, setVerified] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    const repo = createRepository(appStore());
    setAccounts(repo.load().accounts);
    const shifts = repo.shifts();
    setLog(shifts);
    void verifyLog(shifts).then((r) => setVerified({ ok: r.ok, ...(r.reason ? { reason: r.reason } : {}) }));
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('slip:data-changed', onChange);
    return () => window.removeEventListener('slip:data-changed', onChange);
  }, [refresh]);

  const strength = passphrase ? passphraseStrength(passphrase) : null;

  async function exportFile() {
    // Read the live store: a counter added in another panel must be in the backup even if
    // this component has not re-rendered yet.
    const live = createRepository(appStore()).load().accounts;
    if (live.length === 0) {
      setNote({ kind: 'warn', text: 'there is nothing to back up yet — add a counter first' });
      return;
    }
    if (!strength?.ok) {
      setNote({ kind: 'warn', text: strength?.reason ?? 'choose a passphrase first' });
      return;
    }
    setBusy(true);
    try {
      const repo = createRepository(appStore());
      const rawLedger = appStore().getItem(LEDGER_KEY);
      const state: BackupState = {
        accounts: repo.load().accounts,
        activeAccountId: repo.load().activeAccountId,
        pinHash: repo.load().pinHash,
        shifts: repo.shifts(),
        // Stored in the same wire shape the app already writes: strings for every amount,
        // so a 8-decimal sat total cannot lose precision on the way into the file.
        ...(rawLedger ? { ledger: JSON.parse(rawLedger) } : {}),
        app: 'slip',
        savedAt: new Date().toISOString(),
      };
      const text = await createBackup(state, passphrase);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slip-backup-${new Date().toISOString().slice(0, 10)}.slip`;
      a.click();
      URL.revokeObjectURL(url);
      setNote({
        kind: 'ok',
        text: `backup written (${(text.length / 1024).toFixed(1)} KB, encrypted). Keep it somewhere you would keep a bank statement.`,
      });
      setPassphrase('');
    } catch (e) {
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'could not write the backup' });
    } finally {
      setBusy(false);
    }
  }

  /** Reads the file header only — no passphrase, nothing written. */
  async function inspectFile(file: File) {
    try {
      const text = await file.text();
      const head = describeBackup(text);
      setPending({ file, createdAt: head.createdAt, bytes: head.bytes });
      setNote({
        kind: 'warn',
        text: `backup from ${head.createdAt.slice(0, 10)} (${(head.bytes / 1024).toFixed(1)} KB, encrypted). Restoring REPLACES the counters on this device — enter the passphrase and confirm.`,
      });
    } catch (e) {
      setPending(null);
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'that is not a slip backup' });
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const head = describeBackup(text);
      const result = await restoreBackup(text, passphrase);
      if (!result.ok) {
        setNote({ kind: 'bad', text: result.error });
        return;
      }
      const state = result.state as BackupState;
      if (!Array.isArray(state?.accounts)) {
        setNote({ kind: 'bad', text: 'that file does not contain slip counters' });
        return;
      }
      const repo = createRepository(appStore());
      const env = repo.load();
      repo.save({ ...env, accounts: state.accounts, activeAccountId: state.activeAccountId ?? null });
      // The PIN travels with the backup: a restored till with no PIN would silently drop
      // the hand-off protection the merchant thinks they still have.
      repo.setPin(state.pinHash ?? null);
      appStore().setItem('slip.shifts.v1', JSON.stringify(state.shifts ?? { version: 1, events: [] }));
      // Restore the books too, and say so when the file predates them rather than pretending
      // the history came back.
      const hadLedger = state.ledger !== undefined && state.ledger !== null;
      if (hadLedger) appStore().setItem(LEDGER_KEY, JSON.stringify(state.ledger));
      setNote({
        kind: 'ok',
        text: `restored ${state.accounts.length} counter(s), ${state.pinHash ? 'the PIN' : 'no PIN'}${hadLedger ? ' and the books' : ' — no books in that file (older backup)'}, from a backup made ${head.createdAt.slice(0, 10)}.`,
      });
      setPassphrase('');
      setPending(null);
      // Every panel reads the same store; after a restore they all need to re-read, or the
      // till keeps showing an empty counter list while the data is actually there.
      window.dispatchEvent(new Event('slip:data-changed'));
      refresh();
    } catch (e) {
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'could not read that file' });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const shifts = log ? staffSummary(log) : [];
  const lines = log ? exportLogLines(log) : [];

  return (
    <section className="mt-6 panel" data-panel="backup">
      <p className="eyebrow">Backups &amp; staff record</p>
      <h2 className="panel-title mt-1">Your records, on your device, recoverable</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        The file holds your counters, settings and the staff log — and no keys, because none
        exist here. It is still encrypted, because xpubs reveal every past and future address of
        a wallet.
      </p>

      <label className="mt-4 block" htmlFor="bk-pass">
        <span className="text-[11px] uppercase tracking-widest text-muted">
          Backup passphrase
        </span>
        <input
          id="bk-pass"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-line bg-bg p-2 font-mono text-sm outline-none focus:border-accent"
        />
      </label>
      {strength && !strength.ok && (
        <p className="mt-1 text-[11px] text-warn">{strength.reason}</p>
      )}
      {strength?.ok && <p className="mt-1 text-[11px] text-good">passphrase is usable</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void exportFile()}
          disabled={busy}
          className="rounded-lg border border-accent px-3 py-2 text-xs uppercase tracking-wider text-accent disabled:border-line disabled:text-muted"
        >
          Export encrypted backup
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink"
        >
          Print / save as PDF
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-2 text-xs uppercase tracking-wider text-muted hover:text-ink disabled:opacity-50"
        >
          Restore from a .slip file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".slip,application/json"
          className="hidden"
          aria-label="Choose a .slip backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void inspectFile(f);
          }}
        />
        {accounts.length === 0 && (
          <span className="text-[11px] text-muted">add a counter first — there is nothing to back up</span>
        )}
      </div>

      {pending && (
        <div className="mt-3 rounded-lg border border-warn p-3">
          <p className="text-xs text-warn">
            Backup from {pending.createdAt.slice(0, 10)} ({(pending.bytes / 1024).toFixed(1)} KB).
            Restoring <span className="text-ink">replaces</span> the counters on this device. Enter the
            passphrase above, then confirm.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ConfirmButton
              label="Confirm restore"
              confirmLabel="Restore again — this replaces this device"
              onConfirm={() => void importFile(pending.file)}
              disabled={busy || !passphrase}
              className="rounded-lg border border-warn px-3 py-2 text-[11px] uppercase tracking-wider text-warn disabled:border-line disabled:text-muted"
            />
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setNote(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
              className="rounded-lg border border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

      <hr className="divider my-4" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Staff &amp; shift log</h3>
        {verified && (
          <span className={`chip ${verified.ok ? 'chip-good' : 'border-bad text-bad'}`}>
            {verified.ok ? `chain intact · ${lines.length} events` : `chain broken · ${verified.reason ?? ''}`}
          </span>
        )}
      </div>

      {shifts.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          No hand-offs recorded yet. Hand the till over above and it appears here, hash-chained.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shifts.map((s) => (
            <li
              key={`${s.staff}-${s.accountLabel}-${s.startedAt}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs"
            >
              <span className="font-medium">{s.staff}</span>
              <span className="text-muted">{s.accountLabel}</span>
              <span className="figure text-[11px] text-muted">
                {s.startedAt.slice(11, 16)} → {s.endedAt ? s.endedAt.slice(11, 16) : 'open'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted">
            printable day sheet ({lines.length} lines)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[10px] leading-relaxed text-muted">
            {lines.join('\n')}
          </pre>
        </details>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        The log is tamper-<span className="text-ink">evident</span>, not tamper-proof: each entry
        carries the hash of the one before it, so an edited or reordered line is detectable. Someone
        holding the device can still rewrite the whole chain — there is no server and no signature to
        prevent that, and claiming otherwise would be a lie.
      </p>
    </section>
  );
}
