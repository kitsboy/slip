import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { BUILD_STAGE } from '../src/App';

describe('app shell', () => {
  const html = renderToStaticMarkup(<App />);

  it('states the non-custodial promise instead of implying a working till', () => {
    expect(html).toContain('Sells pay straight into your own wallet.');
    expect(html).toContain('never holds money');
    expect(html).toContain('Not a till yet');
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
