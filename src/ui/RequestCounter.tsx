/**
 * Network request counter — the no-telemetry claim, measured on screen.
 *
 * Uses the browser's own performance log (`performance.getEntriesByType('resource')`)
 * and counts every resource whose origin is not this page. For slip that number is
 * zero: no fonts, no analytics, no CDN, no beacon. A visitor can watch it stay at zero,
 * which is worth more than a paragraph promising it.
 *
 * Two shapes, one measurement. The plain line is a sentence at the bottom of the old page.
 * `hero` is the same sentence with the number drawn large, for the footer, where this claim
 * is the headline. Both read the same state, so the big number can never disagree with the
 * small one.
 */

import { useEffect, useState } from 'react';

function externalRequests(): string[] {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return [];
  const self = window.location.origin;
  return performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      if (url.startsWith('file:')) return false;
      if (self && self !== 'null' && url.startsWith(self)) return false;
      return true;
    });
}

interface Props {
  /** Draw the number large, for the footer. The words are the same. */
  readonly hero?: boolean;
}

export default function RequestCounter({ hero = false }: Props) {
  const [external, setExternal] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const tick = () => {
      setExternal(externalRequests());
      setTotal(performance.getEntriesByType('resource').length);
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, []);

  const tail =
    external.length === 0 ? ' · this page has phoned nobody' : ` · ${external.slice(0, 3).join(', ')}`;
  const sub =
    external.length === 0
      ? 'Every request this page made went to its own address.'
      : 'Some of this page came from somewhere else — it is listed above.';

  if (hero) {
    return (
      <p className="v2-foot-zero" data-testid="request-counter">
        <span className="v2-foot-zero-label">network requests to other servers: </span>
        <span className="v2-foot-zero-n">{external.length}</span>
        <span className="v2-foot-zero-tail">{tail}</span>
        <span className="v2-foot-zero-sub">{sub}</span>
      </p>
    );
  }

  return (
    <p className="text-[11px] text-muted" data-testid="request-counter">
      network requests to other servers: <span className="text-ink">{external.length}</span>
      {tail}
      <span className="opacity-60">
        {' '}
        ({total} {total === 1 ? 'request' : 'requests'} total, all from this file)
      </span>
    </p>
  );
}
