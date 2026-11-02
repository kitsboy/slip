/**
 * Technical detail, held in the background until someone asks for it.
 *
 * slip has to be honest about what it watches and how, and the precise vocabulary is the honest
 * way to say it to an engineer. But a shopkeeper who wants to take a payment should never meet the
 * word "xpub" on the way there. So the plain sentence is always on screen, and the exact term lives
 * here — behind one switch in Settings, one click away, never deleted.
 *
 * `<Tech>` renders nothing until "Show technical names" is on.
 * `<Advanced>` hides whole tool panels the same way, with a visible way back.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { loadSettings, saveSettings } from '../core/settings';
import { store as appStore } from '../core/storage';

function read(): boolean {
  try {
    return loadSettings(appStore()).settings.assist.showTechnical;
  } catch {
    return false;
  }
}

function announce(): void {
  window.dispatchEvent(new Event('slip:settings-changed'));
  window.dispatchEvent(new Event('slip:data-changed'));
}

function reveal(): void {
  const store = appStore();
  const settings = loadSettings(store).settings;
  saveSettings(store, { ...settings, assist: { ...settings.assist, showTechnical: true } });
  announce();
}

/** Whether the technical layer is visible, kept in step with Settings. */
export function useShowTechnical(): boolean {
  const [on, setOn] = useState(read);

  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener('slip:settings-changed', sync);
    window.addEventListener('slip:data-changed', sync);
    return () => {
      window.removeEventListener('slip:settings-changed', sync);
      window.removeEventListener('slip:data-changed', sync);
    };
  }, []);

  return on;
}

/** The exact technical wording. Invisible unless the switch is on. */
export default function Tech({ children }: { readonly children: ReactNode }) {
  return useShowTechnical() ? <>{children}</> : null;
}

/**
 * A whole panel that only makes sense to someone who already knows the vocabulary.
 *
 * Hidden, but never out of reach: a card says what is behind it and one button reveals it, so a
 * developer on a shopkeeper's device is never stuck, and a shopkeeper is never confronted.
 */
export function Advanced({ children }: { readonly children: ReactNode }) {
  const on = useShowTechnical();
  if (on) return <>{children}</>;

  return (
    <section className="panel mt-6" data-advanced-hidden="true">
      <p className="eyebrow">For developers</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        These tools are hidden because they only make sense once you know the technical names.
        Nothing was removed — one switch brings them all back.
      </p>
      <button type="button" className="btn btn-secondary mt-3" onClick={reveal}>
        Show the technical tools
      </button>
    </section>
  );
}
