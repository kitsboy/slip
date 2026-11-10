import { useEffect, useRef, useState } from 'react';

/**
 * A destructive button that has to be pressed twice.
 *
 * First press arms it and renames it ("Remove again", "Restore again — replaces this device");
 * the arm expires after a few seconds so a forgotten first press cannot leave a live trap. One
 * component so every destructive action in slip feels the same, and so the second press is never
 * a surprise.
 *
 * Deliberately NOT used for the device wipe: that already demands the word WIPE, which is a
 * stronger guard than two taps. Documented in DESIGN-DECISIONS (D-66).
 */
export default function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'btn btn-danger',
  disabled = false,
  windowMs = 6000,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  /** Cannot be used yet. The button stays focusable so the line under it can be read (D-83). */
  disabled?: boolean;
  windowMs?: number;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const disarm = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  const press = () => {
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(disarm, windowMs);
      return;
    }
    disarm();
    onConfirm();
  };

  return (
    <button
      type="button"
      className={disabled ? `${className} v2-blocked` : className}
      onClick={() => {
        if (disabled) return;
        press();
      }}
      aria-disabled={disabled || undefined}
      onBlur={disarm}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
