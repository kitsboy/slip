/** A failed record stays loud until that record really reaches storage. */
import { useEffect, useState } from 'react';
import { isWriteFailed, subscribeWriteState } from '../core/save-state';
import { retryPendingWrites } from '../core/storage';

export default function SaveWarning() {
  const [failed, setFailed] = useState(isWriteFailed);
  const [retryNote, setRetryNote] = useState('');
  useEffect(() => subscribeWriteState(setFailed), []);
  if (!failed) return null;
  return (
    <div
      role="alert"
      className="relative z-40 border-b border-bad/40 bg-bad/10 px-4 py-3 text-sm"
      data-save-warning
    >
      <div className="mx-auto w-full max-w-3xl leading-relaxed">
        <p>
          <strong>This device refused a save. Some changes are not saved.</strong> A full disk or
          private mode can stop records reaching browser storage. Failed changes are kept only in
          this open tab for recovery, not counted as safely recorded. Do not close or reload this
          tab. Clear space, then retry, or export an encrypted backup now.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="underline"
            onClick={async () => {
              try {
                await retryPendingWrites();
                setRetryNote('');
              } catch {
                setRetryNote(
                  'The device still refused a save. Keep this tab open and export a backup.',
                );
              }
            }}
          >
            Retry unsaved changes
          </button>
          <a className="underline" href="#backup">
            Export encrypted backup
          </a>
        </div>
        {retryNote && <p>{retryNote}</p>}
      </div>
    </div>
  );
}
