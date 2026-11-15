/**
 * The one thing the shell must never hide: a write to this device failed, so whatever the
 * shop just did is not on disk. localStorage gives no warning and no return value — a sale
 * that "looks recorded" but was never stored is a money-record bug, so the banner sits on
 * the page until the next write succeeds. It is a banner, not a toast: a toast is gone and
 * the books still lie.
 *
 * It listens to the shared write-state flag so any panel's failed save — the till, a
 * settings toggle, a refund — raises the same banner. Dismissal is a lie, so there is no
 * dismiss button; a device that keeps refusing stays loud until it accepts a write again.
 */

import { useEffect, useState } from 'react';
import { isWriteFailed, subscribeWriteState } from '../core/save-state';
import { store as appStore } from '../core/storage';

export default function SaveWarning() {
  const [failed, setFailed] = useState(isWriteFailed);
  useEffect(() => subscribeWriteState(setFailed), []);

  if (!failed) return null;

  return (
    <div
      className="relative z-40 border-b border-bad/40 bg-bad/10 px-4 py-3 text-sm"
      data-save-warning
    >
      <p className="mx-auto w-full max-w-3xl leading-relaxed">
        <span className="font-bold">Nothing just stored — this device refused the last save.</span>{' '}
        A full disk or private mode can stop the shop's records from reaching the browser's storage.
        How much reached it is not a thing slip can know, so the sale or change you just made is{' '}
        <strong>not counted as recorded</strong>. Clear space or leave private mode, then re-do it.
        Take a{' '}
        <a className="underline" href="#backup">
          backup
        </a>{' '}
        when it saves.
      </p>
    </div>
  );
}
