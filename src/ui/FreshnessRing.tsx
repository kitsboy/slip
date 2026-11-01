/**
 * A ring that drains as a number gets old.
 *
 * The point is not decoration: a merchant should be able to tell at a glance whether the price on
 * screen was read a moment ago or an hour ago, without reading a timestamp. The ring is driven by
 * `core/freshness.ts`, so it cannot disagree with the rule that refuses a stale rate.
 */

import { freshness } from '../core/freshness';

export interface FreshnessRingProps {
  readonly fetchedAt: string;
  readonly now?: Date;
  readonly size?: number;
  readonly showLabel?: boolean;
}

export default function FreshnessRing({ fetchedAt, now, size = 14, showLabel = true }: FreshnessRingProps) {
  const f = freshness(fetchedAt, now);
  const r = size / 2 - 1.5;
  const circumference = 2 * Math.PI * r;
  const stroke =
    f.level === 'fresh' ? 'var(--ok, #3fa66b)' : f.level === 'ageing' ? 'var(--warn, #c98a00)' : 'var(--bad, #c0392b)';

  return (
    <span className="inline-flex items-center gap-1" data-freshness={f.level}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`data ${f.label}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="1.5"
          strokeDasharray={`${circumference * f.fraction} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showLabel && <span className="text-[11px] text-muted">{f.label}</span>}
    </span>
  );
}
