/**
 * The lock screen.
 *
 * It is deliberately not a login: there is no account, no server, and nothing to send anywhere. It
 * says so on the screen, because a lock that pretends to be more than it is teaches the person
 * depending on it the wrong thing. What it does is keep a passer-by out of the day's takings.
 */

import { useEffect, useRef, useState } from 'react';
import { sanitizePin, verifyPin } from '../core/lock';
import Brand from './Brand';

type LockProps = {
  readonly shopName: string;
  readonly salt: string;
  readonly hash: string;
  readonly onUnlock: () => void;
};

export default function Lock({ shopName, salt, hash, onUnlock }: LockProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const clean = sanitizePin(pin);
    if (!clean) {
      setError('A PIN is 4 to 8 digits.');
      return;
    }
    setBusy(true);
    // A wrong PIN gets slower each time. Not a security control — the hash is what protects the
    // PIN — but a person guessing at a counter should not get twenty easy tries a minute.
    if (tries >= 3) await new Promise((r) => window.setTimeout(r, Math.min(4000, 500 * (tries - 2))));
    const ok = await verifyPin(clean, salt, hash);
    setBusy(false);
    if (ok) {
      setPin('');
      setError('');
      onUnlock();
      return;
    }
    setTries((n) => n + 1);
    setPin('');
    setError('That is not the PIN.');
    field.current?.focus();
  };

  return (
    <div className="v2-lock" data-lock-screen>
      <div className="v2-lock-card">
        <Brand variant="mark" height={34} title="slip" />
        <p className="eyebrow mt-3">Till locked</p>
        <h1 className="v2-lock-title">{shopName || 'This till'}</h1>
        <form onSubmit={(e) => void submit(e)} className="mt-4">
          <label className="block text-xs text-muted" htmlFor="lk-pin">
            PIN
          </label>
          <input
            id="lk-pin"
            ref={field}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            className="v2-lock-pin mt-1"
            aria-describedby="lk-help"
          />
          <button type="submit" className="btn btn-primary v2-lock-go mt-3" aria-disabled={busy || undefined}>
            {busy ? 'Checking…' : 'Open the till'}
          </button>
          <p className="mt-2 min-h-[1.2em] text-xs" role="status" aria-live="polite" data-lock-error>
            {error}
          </p>
        </form>
        <p className="v2-lock-help" id="lk-help">
          This keeps a passer-by out of the day's takings. It is not encryption — the books live in
          this browser, and anyone with the device and its tools can read them. Forgotten PIN? Restore
          the backup file on a fresh device.
        </p>
      </div>
    </div>
  );
}
