import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Failure from '../src/ui/Failure';

const html = (kind: 'rate' | 'network' | 'chain' | 'wallet', extra = '') =>
  renderToStaticMarkup(
    <Failure
      kind={kind}
      what="The price service did not answer."
      safe="Nothing was taken."
      next="Type the rate yourself."
      {...(extra ? { detail: extra } : {})}
    />,
  );

describe('a failure says three things, in the same order', () => {
  for (const kind of ['rate', 'network', 'chain', 'wallet'] as const) {
    it(`answers what happened, what is safe, what to do — ${kind}`, () => {
      const out = html(kind);
      const terms = [...out.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);
      expect(terms).toEqual(['What happened', 'What is safe', 'What to do']);
      const defs = [...out.matchAll(/<dd>([^<]*)<\/dd>/g)].map((m) => m[1]);
      expect(defs[1]).toBe('Nothing was taken.');
      expect(out).toContain(`data-failure="${kind}"`);
      expect(out).toContain('role="status"');
    });
  }

  it('keeps the raw message small and never as the headline', () => {
    const out = html('network', 'TypeError: Failed to fetch');
    expect(out).toContain('slip cannot reach the network');
    expect(out).toContain('v2-failure-detail">TypeError: Failed to fetch');
  });

  it('the chain case says a wrong match cannot move money', () => {
    const out = renderToStaticMarkup(
      <Failure
        kind="chain"
        what="The addresses did not match."
        safe="Nothing was taken and nothing was sent. slip is watch-only, so a wrong match cannot move money."
        next="Open Setup and check address 0/0."
      />,
    );
    expect(out).toContain('v2-failure-bad');
    expect(out).toContain('cannot move money');
  });

  it('names the chain the shop is actually on', () => {
    const ltc = renderToStaticMarkup(
      <Failure
        kind="rate"
        coin="Litecoin"
        what="The price service did not answer."
        safe="Nothing was taken."
        next="Type the rate yourself."
      />,
    );
    expect(ltc).toContain('slip does not know what a Litecoin is worth');
    expect(ltc).not.toContain('Bitcoin');
  });
});
