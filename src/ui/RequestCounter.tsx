/**
 * Network request counter — the no-telemetry claim, measured on screen.
 *
 * Uses the browser's own performance log (`performance.getEntriesByType('resource')`)
 * and counts every resource whose origin is not this page. For slip that number is
 * zero: no fonts, no analytics, no CDN, no beacon. A visitor can watch it stay at zero,
 * which is worth more than a paragraph promising it.
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

export default function RequestCounter() {
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

  return (
    <p className="text-[11px] text-muted" data-testid="request-counter">
      network requests to other servers: <span className="text-ink">{external.length}</span>
      {external.length === 0 ? ' · this page has phoned nobody' : ` · ${external.slice(0, 3).join(', ')}`}
      <span className="opacity-60"> ({total} resources total, all from this file)</span>
    </p>
  );
}
