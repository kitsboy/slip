import type { ReactNode } from 'react';

type Kind = 'primary' | 'secondary' | 'text';
type Size = 's' | 'm' | 'l';

/**
 * C-01. A blocked button stays focusable (`aria-disabled`, never `disabled`) so the
 * reason under it can be read. Primary is never the small size.
 */
export default function Button({
  kind = 'secondary',
  size = 'm',
  blocked,
  children,
  onClick,
}: {
  kind?: Kind;
  size?: Size;
  /** Named reason. Required when the button cannot be used. */
  blocked?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const resolved = kind === 'primary' ? 'l' : size;
  const role = kind === 'primary' ? 'btn-primary' : kind === 'secondary' ? 'btn-secondary' : 'v2-btn-text';
  return (
    <span className="v2-btn-wrap">
      <button
        type="button"
        className={`v2-btn ${role} v2-btn-${resolved}`}
        aria-disabled={blocked ? true : undefined}
        onClick={() => {
          if (blocked) return;
          onClick?.();
        }}
      >
        {children}
      </button>
      {blocked ? (
        <span className="v2-blocker" role="status">
          {blocked}
        </span>
      ) : null}
    </span>
  );
}
