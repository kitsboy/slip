import { c5, c17, c18, c19, c20, c21, c22, c23 } from './classes';
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
import {
  createBackup,
  describeBackup,
  passphraseStrength,
  recordBackupTaken,
  restoreBackup,
} from '../core/backup';
import { testBackup } from '../core/test-backup';
import ConfirmButton from './ConfirmButton';
import { exportLogLines, staffSummary, verifyLog, type ShiftLog } from '../core/shifts';
import { LEDGER_KEY } from '../core/ledger';
import {
  pendingWriteKeys,
  backupSnapshot,
  recoveryStore,
  replaceShiftLog,
  replaceLedger,
  recoverySaleSnapshot,
  store as appStore,
} from '../core/storage';
import { isWriteFailed, subscribeWriteState } from '../core/save-state';
import Tech from './Tech';

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
  /** Unsaved raw records sealed inside the encrypted file for recovery. */
  recoveryWrites?: Record<string, string | null>;
  recoverySale?: unknown;
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
  const [preflight, setPreflight] = useState<number | null>(null);
  const generation = useRef(0);
  const selectedFile = useRef<File | null>(null);
  function invalidatePreflight() {
    generation.current += 1;
    setPreflight(null);
  }
  const [unsaved, setUnsaved] = useState(isWriteFailed);
  useEffect(() => subscribeWriteState(setUnsaved), []);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    const repo = createRepository(appStore());
    setAccounts(repo.load().accounts);
    const shifts = repo.shifts();
    setLog(shifts);
    void verifyLog(shifts).then((r) =>
      setVerified({ ok: r.ok, ...(r.reason ? { reason: r.reason } : {}) }),
    );
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
    const live = createRepository(recoveryStore()).load().accounts;
    if (live.length === 0 && pendingWriteKeys().length === 0 && recoverySaleSnapshot() === null) {
      setNote({ kind: 'warn', text: 'there is nothing to back up yet — add a counter first' });
      return;
    }
    if (!strength?.ok) {
      setNote({ kind: 'warn', text: strength?.reason ?? 'choose a passphrase first' });
      return;
    }
    setBusy(true);
    try {
      const snapshot = await backupSnapshot();
      const repo = createRepository(snapshot.view);
      const rawLedger = snapshot.view.getItem(LEDGER_KEY);
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
        ...(recoverySaleSnapshot() !== null ? { recoverySale: recoverySaleSnapshot() } : {}),
        ...(Object.keys(snapshot.recovery).length
          ? {
              recoveryWrites: snapshot.recovery,
            }
          : {}),
      };
      const text = await createBackup(state, passphrase);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slip-backup-${new Date().toISOString().slice(0, 10)}.slip`;
      a.click();
      URL.revokeObjectURL(url);
      recordBackupTaken(appStore());
      if (!state.recoveryWrites) {
        try {
          appStore().setItem('slip.backup-books.v1', rawLedger ?? '');
        } catch {
          /* download remains usable; close evidence stays unavailable */
        }
      }
      // Let the History day-close nudge learn the fresh backup date immediately.
      window.dispatchEvent(new Event('slip:data-changed'));
      setNote({
        kind: 'ok',
        text: `Encrypted backup download requested (${(text.length / 1024).toFixed(1)} KB). Check that the file finished downloading.${state.recoveryWrites ? ' Includes unsaved recovery records; this does not save them to this device.' : ''} Keep it somewhere you would keep a bank statement.`,
      });
      invalidatePreflight();
      setPassphrase('');
    } catch (e) {
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'could not write the backup' });
    } finally {
      setBusy(false);
    }
  }

  /** Reads the file header only — no passphrase, nothing written. */
  async function inspectFile(file: File) {
    invalidatePreflight();
    selectedFile.current = file;
    setPending(null);
    try {
      const text = await file.text();
      const head = describeBackup(text);
      if (selectedFile.current !== file) return;
      setPending({ file, createdAt: head.createdAt, bytes: head.bytes });
      setNote({
        kind: 'warn',
        text: `backup from ${head.createdAt.slice(0, 10)} (${(head.bytes / 1024).toFixed(1)} KB, encrypted). Restoring REPLACES the counters on this device — enter the passphrase and confirm.`,
      });
    } catch (e) {
      if (selectedFile.current !== file) return;
      setPending(null);
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'that is not a slip backup' });
    }
  }

  async function checkFile() {
    if (!pending || busy || !passphrase) {
      setNote({ kind: 'warn', text: 'Choose a .slip file and enter its original passphrase first.' });
      return;
    }
    invalidatePreflight();
    const token = generation.current;
    const file = pending.file;
    setBusy(true);
    try {
      const result = await testBackup(await file.text(), passphrase);
      if (generation.current !== token || selectedFile.current !== file) return;
      setPreflight(result.ok ? token : null);
      setNote({
        kind: result.ok ? 'ok' : 'bad',
        text: result.summary ?? result.error ?? 'Validation failed',
      });
    } catch (e) {
      if (generation.current !== token || selectedFile.current !== file) return;
      setNote({ kind: 'bad', text: e instanceof Error ? e.message : 'Could not test backup' });
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    const token = generation.current;
    const current = () => preflight === token && generation.current === token && selectedFile.current === file;
    if (!current() || busy) return;
    setBusy(true);
    try {
      const text = await file.text();
      const head = describeBackup(text);
      const validation = await testBackup(text, passphrase);
      if (!current()) return;
      if (!validation.ok) throw new Error(validation.error);
      const result = await restoreBackup(text, passphrase);
      if (!result.ok) {
        setNote({ kind: 'bad', text: result.error });
        return;
      }
      if (!current()) return;
      const state = result.state as BackupState;
      if (!Array.isArray(state?.accounts)) {
        setNote({ kind: 'bad', text: 'that file does not contain slip counters' });
        return;
      }
      const repo = createRepository(appStore());
      const env = repo.load();
      repo.save({
        ...env,
        accounts: state.accounts,
        activeAccountId: state.activeAccountId ?? null,
      });
      // The PIN travels with the backup: a restored till with no PIN would silently drop
      // the hand-off protection the merchant thinks they still have.
      repo.setPin(state.pinHash ?? null);
      await replaceShiftLog(JSON.stringify(state.shifts ?? { version: 1, events: [] }));
      // Restore the books too, and say so when the file predates them rather than pretending
      // the history came back.
      const hadLedger = state.ledger !== undefined && state.ledger !== null;
      if (hadLedger) await replaceLedger(JSON.stringify(state.ledger));
      setNote({
        kind: 'ok',
        text: `restored ${state.accounts.length} counter(s), ${state.pinHash ? 'the PIN' : 'no PIN'}${hadLedger ? ' and the books' : ' — no books in that file (older backup)'}${state.recoverySale || state.recoveryWrites ? ' — recovery notes are informational only; not automatically imported' : ''}, from a backup made ${head.createdAt.slice(0, 10)}.`,
      });
      invalidatePreflight();
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
      <p className={c20}>
        Your wallets, settings and staff log, in one file you can keep. No keys — there are none to
        keep. Still locked with a passphrase, because a list of your shop&apos;s addresses is nobody
        else&apos;s business.
      </p>
      {unsaved && (
        <p role="status" className="mt-3 text-warn">
          Unsaved changes are held only in this tab. The encrypted backup includes recoverable
          records from this tab, even when this device refuses saves. Exporting does not clear the
          save warning. Check the download before closing this tab.
        </p>
      )}
      <Tech>
        <p className={c21}>
          The file holds no spending keys, because none exist here. It is encrypted anyway: an xpub
          reveals every past and future address of a wallet.
        </p>
      </Tech>

      <details className="mt-3" data-guided-recovery open><summary>Recover this device safely</summary>
        <ol><li>Keep a backup of this device first if you need its existing records.</li><li>Choose your encrypted .slip file, enter its original passphrase, then Test my backup — no changes.</li><li>Read the validation result before confirming replacement twice.</li></ol>
        <p>No file? Find your off-device copy; slip has no server copy. Forgotten passphrase? It cannot be reset. A wallet seed is not a slip backup — never paste seeds or private keys here.</p>
        <p>Restore replaces counters, PIN and staff log; books are replaced only if present in the file. Older files without books leave current books unchanged. Recovery notes are not auto-imported. Replacement is not all-or-nothing across these records; a failure may leave a partial restore. Keep both files and check the result before selling.</p>
      </details>
      <label className="mt-4 block" htmlFor="bk-pass">
        <span className={c22}>
          Backup passphrase
        </span>
        <input
          id="bk-pass"
          type="password"
          value={passphrase}
          onChange={(e) => { invalidatePreflight(); setPassphrase(e.target.value); }}
          autoComplete="new-password"
          className={c5}
        />
      </label>
      {strength && !strength.ok && <p className="mt-1 text-[11px] text-warn">{strength.reason}</p>}
      {strength?.ok && <p className="mt-1 text-[11px] text-good">passphrase is usable</p>}

      <div className={c17}>
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            void exportFile();
          }}
          aria-disabled={busy || undefined}
          className={`rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent${busy ? ' v2-blocked' : ''}`}
        >
          Export encrypted backup
        </button>
        {busy && (
          <p className="w-full text-xs text-warn" role="status" data-blocker>
            Working on the file now. The button comes back when it is written.
          </p>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className={c23}
        >
          Print / save as PDF
        </button>
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            fileInput.current?.click();
          }}
          aria-disabled={busy || undefined}
          className={`rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:text-ink${busy ? ' v2-blocked' : ''}`}
        >
          Test or restore a .slip file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".slip,application/json"
          className="hidden"
          aria-label="Choose a .slip backup file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            invalidatePreflight();
            selectedFile.current = f ?? null;
            if (f) void inspectFile(f);
            else setPending(null);
          }}
        />
        {accounts.length === 0 && (
          <span className="text-[11px] text-muted">
            add a counter first — there is nothing to back up
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-3 rounded-lg border border-warn p-3">
          <p className="text-xs text-warn">
            Backup from {pending.createdAt.slice(0, 10)} ({(pending.bytes / 1024).toFixed(1)} KB).
            Restoring <span className="text-ink">replaces</span> the counters on this device. Enter
            the passphrase above, test without changes, then confirm replacement.
          </p>
          {!preflight && <p role="status">Test this file successfully with this passphrase before restore is available.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              aria-disabled={busy || !passphrase}
              onClick={() => void checkFile()}
            >
              Test my backup — no changes
            </button>
            <ConfirmButton
              key={generation.current}
              label="Confirm restore"
              confirmLabel="Restore again — this replaces this device"
              onConfirm={() => void importFile(pending.file)}
              disabled={busy || !passphrase || preflight !== generation.current || pending.file !== selectedFile.current}
              className="rounded-lg border border-warn px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-warn disabled:border-line disabled:text-muted"
            />
            {!passphrase && (
              <p className="mt-1 w-full text-xs text-warn" role="status" data-blocker>
                Enter the passphrase first. The restore stays grey until then.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                invalidatePreflight();
                selectedFile.current = null;
                setPending(null);
                setNote(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
              className={c18}
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
            note.kind === 'ok'
              ? 'border-good text-good'
              : note.kind === 'warn'
                ? 'border-warn text-warn'
                : 'border-bad text-bad'
          }`}
        >
          {note.text}
        </p>
      )}

      <hr className="divider my-4" />

      <div className={c19}>
        <h3 className="text-sm font-semibold">Staff &amp; shift log</h3>
        {verified && (
          <span className={`chip ${verified.ok ? 'chip-good' : 'border-bad text-bad'}`}>
            {verified.ok
              ? `chain intact · ${lines.length} events`
              : `chain broken · ${verified.reason ?? ''}`}
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
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.08em] text-muted">
            printable day sheet ({lines.length} lines)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted">
            {lines.join('\n')}
          </pre>
        </details>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        The log is tamper-<span className="text-ink">evident</span>, not tamper-proof: each entry
        carries the hash of the one before it, so an edited or reordered line is detectable. Someone
        holding the device can still rewrite the whole chain — there is no server and no signature
        to prevent that, and claiming otherwise would be a lie.
      </p>
    </section>
  );
}
