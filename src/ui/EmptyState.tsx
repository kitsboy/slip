import type { ReactNode } from 'react';

import { isSkinV2 } from './skin';

/**
 * One honest line plus one next action for a panel that has nothing in it yet.
 *
 * ONBOARDING-SPEC §5: a blank panel teaches nothing, so every empty list says what would fill it
 * and what to do now. Wording stays concrete — no "get started", no exclamation marks.
 */
export default function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  if (!isSkinV2()) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        <p>{children}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }
  return (
    <div className="v2-empty">
      <svg viewBox="0 0 32 32" width="48" height="48" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 4h20v20a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V4z" strokeLinejoin="round" />
        <path d="M11 12h10M11 17h6" strokeLinecap="round" />
      </svg>
      <p>{children}</p>
      {action}
    </div>
  );
}
