import { useRef, type ReactNode } from 'react';
import { useModalFocus } from './useModalFocus';

/** C-15. Esc closes. Focus returns to whatever opened it. */
export default function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, open, onClose);

  if (!open) return null;
  return (
    <div className="v2-scrim" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className="v2-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <div className="v2-dialog-body">{children}</div>
        {actions ? <div className="v2-dialog-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
