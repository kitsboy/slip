import type { ReactNode } from 'react';

/**
 * C-20. Label, dotted leader, value. The leader is decoration (`aria-hidden`)
 * and is dropped when the label is long enough to wrap.
 */
export default function DataRow({
  label,
  value,
  sub,
  leader = true,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  leader?: boolean;
}) {
  const showLeader = leader && label.length < 28;
  return (
    <div className="v2-row">
      <dl>
        <div className="v2-row-line">
          <dt>{label}</dt>
          {showLeader ? <span className="v2-leader" aria-hidden /> : null}
          <dd>{value}</dd>
        </div>
        {sub ? <p className="v2-row-sub">{sub}</p> : null}
      </dl>
    </div>
  );
}
