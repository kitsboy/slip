import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import App, { BUILD_STAGE } from '../src/App';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../src/core/settings';

/**
 * Two audiences, one app.
 *
 * The default render is for a shopkeeper who has never used Bitcoin: it must state what slip does
 * and what it cannot do, and it must not put "xpub" in front of them. The technical render proves
 * the other half of the promise — that the vocabulary was moved, not deleted.
 */

function withTechnical(on: boolean): void {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...DEFAULT_SETTINGS,
      assist: { ...DEFAULT_SETTINGS.assist, showTechnical: on },
    }),
  );
}

/** Rendered per test: the settings switch is read at render, so the markup must be built after it. */
const render = (): string => renderToStaticMarkup(<App />);

/** What a person actually reads: attributes (ids, aria, for=) are not vocabulary. */
const text = (): string => render().replace(/<[^>]*>/g, ' ');

describe('app shell — the plain page', () => {
  beforeEach(() => window.localStorage.clear());

  it('says what slip is in words a stranger can repeat', () => {
    const html = render();
    expect(html).toContain('A till that pays you, not a bank.');
    expect(html).toContain('cannot hold or move a penny');
    expect(html).not.toContain('Not a till yet');
  });

  it('still states the honest limits at the bottom of the page', () => {
    expect(render()).toContain('cannot hold, move, refund or recover money');
  });

  it('explains the three steps before any configuration', () => {
    const html = render();
    expect(html).toContain('Add your wallet');
    expect(html).toContain('Ring up the sale');
    expect(html).toContain('They pay you');
  });

  it('does not put the Fedi card on a page while the switch is off', () => {
    expect(render()).not.toContain('Pay to my Fedi account');
    expect(render()).not.toContain('data-fedi-card');
  });

  it('keeps the technical vocabulary out of the first screen', () => {
    const visible = text();
    for (const word of ['xpub', 'mempool', 'BIP-85', 'LNURL', 'descriptor']) {
      expect(visible.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});

describe('app shell — the technical page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    withTechnical(true);
  });

  it('reports the current build stage so a half-built app cannot pass as finished', () => {
    expect(render()).toContain(BUILD_STAGE);
  });

  it('names the rails actually in scope', () => {
    const html = render();
    for (const rail of ['BTC', 'LTC', 'Lightning', 'Fedimint', 'Silent Payments']) {
      expect(html).toContain(rail);
    }
  });

  it('brings the exact terms back when asked', () => {
    expect(text()).toContain('xpub');
  });
});
