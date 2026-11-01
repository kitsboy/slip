/**
 * "Add slip to this device" — only offered when the browser actually offers it.
 *
 * A PWA install prompt arrives as a `beforeinstallprompt` event, and browsers that do not
 * support it (or that already installed the app) never fire one. Showing a dead button in those
 * cases teaches the merchant that the app lies, so this component renders nothing at all until
 * the event has been captured, and says when the app is already installed.
 */

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setNote('installed — slip now opens from your home screen');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // A display-mode match means it is already running as an app, so there is nothing to offer.
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="mt-2 text-[11px] text-muted" data-install="installed">
        slip is running as an installed app.
      </p>
    );
  }
  if (!prompt) return null;

  return (
    <div className="mt-2" data-install="available">
      <button
        type="button"
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          setNote(choice.outcome === 'accepted' ? 'installing…' : 'kept in the browser');
          setPrompt(null);
        }}
        className="rounded-lg border border-accent px-3 py-1.5 text-xs text-accent"
      >
        install slip on this device
      </button>
      <p className="mt-1 text-[11px] text-muted">
        Installs the same single file. It keeps working with the network off.
      </p>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}
