/**
 * Turning the performance log into something a shopkeeper can read.
 *
 * The counter used to print raw URLs. One request was enough to push a 120-character
 * `https://static.cloudflareinsights.com/beacon.min.js/…` string across two columns and off the
 * edge of the page on both a phone and a desktop — the honest number was there, but it was
 * unreadable, which is worse than useless on a footer that exists to be read.
 *
 * A host is all the reader needs to judge the claim: `static.cloudflareinsights.com` says
 * "analytics somewhere" at a glance, and it is short enough to sit in a column. The path and the
 * query are noise. Duplicates collapse, order is kept, and long lists are counted rather than
 * printed.
 */

export interface HostList {
  /** Distinct hosts, in the order they were first seen. */
  readonly hosts: readonly string[];
  /** How many distinct hosts did not fit in `hosts`. */
  readonly more: number;
}

/** The host of a URL, or the URL itself when it cannot be parsed (never a whole long string). */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    const short = url.replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? '';
    return short.slice(0, 60);
  }
}

export function hostList(urls: readonly string[], max = 3): HostList {
  const seen: string[] = [];
  for (const url of urls) {
    const host = hostOf(url);
    if (host && !seen.includes(host)) seen.push(host);
  }
  return { hosts: seen.slice(0, max), more: Math.max(0, seen.length - max) };
}

/** One short sentence for the count, with no URL in it. */
export function countLine(external: number): string {
  if (external === 0) return ' · this page has phoned nobody';
  if (external === 1) return ' · one request left this page';
  return ` · ${external} requests left this page`;
}
