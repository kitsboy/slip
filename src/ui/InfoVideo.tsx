/**
 * A short explanation, on the card it explains.
 *
 * Six clips were filmed for this app, and every one of them answers a question a merchant asks
 * *while looking at that card*: what is this strip, why does the books page talk about a hash,
 * what is the QR the customer keeps. So the (i) lives on the card, not in a help centre.
 *
 * Four rules, and each has a reason:
 *
 *  - NOTHING DOWNLOADS UNTIL THE ICON IS TAPPED. The <video> only mounts when the popover opens,
 *    with `preload="none"`. A shop on mobile data must not pay for six clips it never watched.
 *  - THE CLIP PLAYS WHEN ASKED, AND ONLY THEN. Opening the popover plays it (the tap is the user
 *    gesture browsers require, and the shopkeeper asked for it) — but nothing plays on load, so
 *    slip never makes noise at a customer.
 *  - CLOSING STOPS IT. Pause and rewind on close, or the voice keeps going behind a closed dialog.
 *  - THE MUSIC IS CREDITED WHERE IT PLAYS. The bed is CC BY 4.0, and attribution inside a `.md`
 *    file nobody opens is not attribution.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** Path to the clip, served from this app's own origin — never a CDN. */
  readonly src: string;
  readonly poster: string;
  /** What this clip explains, used for the label and the dialog's accessible name. */
  readonly title: string;
  readonly seconds?: number;
  /** Show the title beside the icon instead of the icon alone (used on the hero). */
  readonly label?: string;
  /**
   * A poster tile instead of an (i). The still is the only thing downloaded before a tap — the clip
   * itself still has `preload="none"` and mounts only when opened. Used where the film is the point.
   */
  readonly card?: boolean;
}

/** The music bed that runs under all six clips. Required by its licence. */
const CREDIT = 'Music: Electro Cabello — Kevin MacLeod (incompetech.com), CC BY 4.0';

export default function InfoVideo({ src, poster, title, seconds, label, card }: Props) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    setOpen(false);
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();
    // The tap that opened this is a user gesture, so sound is allowed. If a browser still
    // refuses, the controls are right there — we do not retry or nag.
    void videoRef.current?.play().catch(() => undefined);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const name = seconds ? `${title} (${seconds} s)` : title;

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Watch a short explanation: ${name}`}
        title={`Watch: ${name}`}
        data-info-video={src}
        className={card ? 'video-card' : label ? 'info-btn info-btn-labelled' : 'info-btn'}
      >
        {card ? (
          <>
            <span className="video-card-still" style={{ backgroundImage: `url(${poster})` }} aria-hidden />
            <span aria-hidden className="video-card-play">
              ▶
            </span>
            <span className="video-card-text">
              <span className="video-card-title">{label ?? title}</span>
              {seconds ? <span className="video-card-meta">{seconds}s · no sound until you press play</span> : null}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden className="info-btn-mark">
              i
            </span>
            {label && <span>{label}</span>}
          </>
        )}
      </button>

      {open && (
        <div
          className="info-scrim"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={name} className="info-card">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">{title}</p>
              <button ref={closeRef} type="button" onClick={close} className="btn btn-ghost">
                Close
              </button>
            </div>
            <video
              ref={videoRef}
              className="mt-2 w-full rounded-lg bg-black"
              src={src}
              poster={poster}
              controls
              playsInline
              preload="none"
              data-info-player={src}
            />
            <p className="mt-2 text-[11px] leading-snug text-secondary">{CREDIT}</p>
          </div>
        </div>
      )}
    </>
  );
}
