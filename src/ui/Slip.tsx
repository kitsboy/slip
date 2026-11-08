import type { ReactNode } from 'react';

/** C-03 hero card. The tear is the only scallop, and only when asked. */
export default function Slip({ tear = false, children }: { tear?: boolean; children: ReactNode }) {
  return (
    <section className={tear ? 'v2-slip v2-slip-tear' : 'v2-slip'} aria-label="slip">
      {children}
    </section>
  );
}
