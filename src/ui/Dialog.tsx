import { useEffect, useRef, type ReactNode } from 'react';

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
  const opener = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusable = root?.querySelectorAll<HTMLElement>('button, a, input, [tabindex]');
    focusable?.[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab' || !root) return;
      const nodes = [...root.querySelectorAll<HTMLElement>('button, a, input, [tabindex]')];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="v2-scrim" onClick={onClose}>
      <div
        ref={ref}
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
