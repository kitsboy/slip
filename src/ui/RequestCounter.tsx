/**
 * Network request counter — the no-telemetry claim, measured on screen.
 *
 * Uses the browser's own performance log (`performance.getEntriesByType('resource')`) and counts
 * every resource whose origin is not this page. For slip that number is zero: no fonts, no
 * analytics, no CDN, no beacon. A visitor can watch it stay at zero, which is worth more than a
 * paragraph promising it.
 *
 * When it is *not* zero it says so and names the host — never the URL. One injected beacon is 120
 * characters of `https://…/beacon.min.js/vce701…`, which ran across two footer columns and off the
 * page on both a phone and a desktop. A host fits, and a host is what a reader can judge.
 *
 * Two shapes, one measurement. The plain line is the older page's sentence; `hero` is the same
 * sentence with the number drawn large, for the footer. Both read the same state, so the big
 * number can never disagree with the small one.
 */

import { useEffect, useState } from 'react';
import { countLine, hostList } from '../core/net-count';

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

  const line = countLine(external.length);
  const { hosts, more } = hostList(external);
  const sub =
    external.length === 0
      ? 'Every request this page made went to its own address.'
      : 'Nothing in slip asks for this. Whoever added it, you can see it here.';

  if (hero) {
    return (
      <p className="v2-foot-zero" data-testid="request-counter">
        <span className="v2-foot-zero-label">network requests to other servers: </span>
        <span className="v2-foot-zero-n">{external.length}</span>
        <span className="v2-foot-zero-tail">{line}</span>
        {hosts.length > 0 && (
          <span className="v2-foot-hosts">
            {hosts.map((host) => (
              <span className="v2-foot-host" key={host}>
                {host}
              </span>
            ))}
            {more > 0 && <span className="v2-foot-host">and {more} more</span>}
          </span>
        )}
        <span className="v2-foot-zero-sub">{sub}</span>
      </p>
    );
  }

  return (
    <p className="text-[11px] text-muted" data-testid="request-counter">
      network requests to other servers: <span className="text-ink">{external.length}</span>
      {line}
      {hosts.length > 0 && <span className="block">{hosts.join(' · ')}</span>}
      <span className="opacity-60">
        {' '}
        ({total} {total === 1 ? 'request' : 'requests'} total, all from this file)
      </span>
    </p>
  );
}
