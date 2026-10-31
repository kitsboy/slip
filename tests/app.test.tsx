import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { BUILD_STAGE } from '../src/App';

describe('app shell', () => {
  const html = renderToStaticMarkup(<App />);

  it('states the non-custodial promise and the honest limits of the till', () => {
    expect(html).toContain('Sales pay straight into your own wallet.');
    expect(html).toContain('never holds money');
    // The old test pinned a banner that said the app could not take payments, long after it
    // could. It now pins the honest statement a working till should make.
    expect(html).not.toContain('Not a till yet');
    expect(html).toContain('cannot hold, move, refund or recover money');
  });

  it('reports the current build stage so a half-built app cannot pass as finished', () => {
    expect(html).toContain(BUILD_STAGE);
  });

  it('names the rails actually in scope', () => {
    for (const rail of ['BTC', 'LTC', 'Lightning', 'Fedimint', 'Silent Payments']) {
      expect(html).toContain(rail);
    }
  });
});
