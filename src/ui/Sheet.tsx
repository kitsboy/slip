import { useRef, type ReactNode } from 'react';
import { useModalFocus } from './useModalFocus';

/** C-17. Close is a button, not a swipe. One sheet at a time is the caller's job. */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, open, onClose);

  if (!open) return null;
  return (
    <div className="v2-scrim" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className="v2-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="v2-sheet-close" onClick={onClose}>
          Close
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
