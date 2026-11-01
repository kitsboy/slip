import type { ReactNode } from 'react';

/**
 * One honest line plus one next action for a panel that has nothing in it yet.
 *
 * ONBOARDING-SPEC §5: a blank panel teaches nothing, so every empty list says what would fill it
 * and what to do now. Wording stays concrete — no "get started", no exclamation marks.
 */
export default function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
      <p>{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
