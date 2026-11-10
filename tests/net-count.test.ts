import { describe, expect, it } from 'vitest';
import { countLine, hostList } from '../src/core/net-count';

/**
 * The footer used to print raw URLs. A single Cloudflare-injected beacon put a 120-character
 * string across two columns on desktop and off the edge of a phone. These are the cases that
 * caused it, kept as tests so the printing can never come back.
 */

const BEACON =
  'https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092';

describe('hostList', () => {
  it('turns a beacon URL into a host, never the path', () => {
    const { hosts } = hostList([BEACON]);
    expect(hosts).toEqual(['static.cloudflareinsights.com']);
    expect(hosts[0]?.length ?? 999).toBeLessThan(40);
    expect(hosts.join('')).not.toContain('beacon.min.js');
  });

  it('collapses repeats and keeps the order they appeared', () => {
    const { hosts, more } = hostList([
      'https://a.example/x.js',
      'https://a.example/y.js',
      'https://b.example/z.js',
    ]);
    expect(hosts).toEqual(['a.example', 'b.example']);
    expect(more).toBe(0);
  });

  it('counts what it does not print past the limit', () => {
    const urls = ['a.example', 'b.example', 'c.example', 'd.example', 'e.example'].map(
      (h) => `https://${h}/1`,
    );
    const { hosts, more } = hostList(urls, 3);
    expect(hosts).toHaveLength(3);
    expect(more).toBe(2);
  });

  it('survives a string that is not a URL at all', () => {
    const { hosts } = hostList(['not a url but very long ' + 'x'.repeat(200)]);
    expect(hosts[0]?.length ?? 999).toBeLessThanOrEqual(60);
  });

  it('is empty for an empty page', () => {
    expect(hostList([])).toEqual({ hosts: [], more: 0 });
  });
});

describe('countLine', () => {
  it('keeps the ": 0" the browser suites look for', () => {
    expect(countLine(0)).toBe(' · this page has phoned nobody');
  });

  it('says it in words when something did leave', () => {
    expect(countLine(1)).toBe(' · one request left this page');
    expect(countLine(4)).toBe(' · 4 requests left this page');
  });
});
